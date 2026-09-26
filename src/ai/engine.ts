/**
 * A small multilayer perceptron, in plain TypeScript, with no dependencies.
 *
 * This is the whole runtime. There is no WASM, no WebGPU, no worker, no dynamic import
 * and nothing fetched at any point: the weights are a TypeScript module that ships with
 * the app, and this file turns a feature vector into a score using ordinary arithmetic.
 * That is the entire reason the AI features in this project have no limits. A hosted
 * model is limited by someone else's quota; a downloaded one is limited by the reader's
 * disk, their GPU and whether their browser has WebGPU at all. Arithmetic is limited by
 * nothing, and a forward pass here costs well under a millisecond.
 *
 * Deliberately written out rather than pulled in, so that what runs is readable and
 * auditable in the same repository as everything else. The maths is standard: a dense
 * layer is a matrix multiply plus a bias, and training is gradient descent over the mean
 * squared error. Nothing here is proprietary or downloaded.
 */

/** One dense layer: `out` neurons, each a weighted sum of `in` inputs plus a bias. */
export type Layer = {
  /** Row-major, `out` rows of `in` weights. */
  w: Float64Array;
  /** One bias per output neuron. */
  b: Float64Array;
  in: number;
  out: number;
};

/** A complete network: layers applied in order, with ReLU between them. */
export type Network = {
  layers: Layer[];
  /** Feature count the weights were trained against. Guards against a silent mismatch. */
  inputSize: number;
};

export function layer(inSize: number, outSize: number): Layer {
  return {
    w: new Float64Array(inSize * outSize),
    b: new Float64Array(outSize),
    in: inSize,
    out: outSize,
  };
}

export function network(inputSize: number, shape: number[]): Network {
  const sizes = [inputSize, ...shape];
  const layers: Layer[] = [];
  for (let i = 0; i < shape.length; i++) layers.push(layer(sizes[i], sizes[i + 1]));
  return { layers, inputSize };
}

/**
 * Forward pass. The hidden layers use ReLU because the ranking problem this network
 * solves is not linear - "does this hint leak the code" interacts with "is this hint
 * long enough to be useful" - and the output layer is left linear so the score is
 * unbounded and can be compared and averaged.
 *
 * `scratch` is reused across calls. Hinting happens on a click, and a puzzle can be
 * re-ranked several times while a player considers their options, so allocating four
 * typed arrays per candidate per click would be the most expensive thing in the feature.
 */
export function forward(net: Network, x: ArrayLike<number>, scratch?: Float64Array[]): number {
  let buf = scratch?.[0];
  if (!buf || buf.length < x.length) {
    buf = new Float64Array(Math.max(x.length, 64));
    if (scratch) scratch[0] = buf;
  }
  for (let i = 0; i < x.length; i++) buf[i] = x[i];

  const next = new Float64Array(net.layers[net.layers.length - 1].out);
  if (scratch) {
    if (!scratch[1] || scratch[1].length < next.length) scratch[1] = new Float64Array(Math.max(next.length, 64));
  }

  for (let li = 0; li < net.layers.length; li++) {
    const L = net.layers[li];
    const isLast = li === net.layers.length - 1;
    const dst = isLast ? next : ensure(scratch, li + 1, L.out);
    for (let o = 0; o < L.out; o++) {
      let sum = L.b[o];
      const base = o * L.in;
      for (let i = 0; i < L.in; i++) sum += L.w[base + i] * buf[i];
      // ReLU everywhere but the output. A dead ReLU is a neuron that can never fire
      // again, so the clipped form is used rather than a hard zero.
      dst[o] = isLast ? sum : sum > 0 ? sum : sum * 0.01;
    }
    buf = dst;
  }
  return next[0];
}

function ensure(scratch: Float64Array[] | undefined, at: number, size: number): Float64Array {
  if (!scratch) return new Float64Array(size);
  if (!scratch[at] || scratch[at].length < size) scratch[at] = new Float64Array(Math.max(size, 64));
  return scratch[at];
}

/** Per-call scratch space, so a caller ranking many candidates allocates once. */
export function scratchSpace(): Float64Array[] {
  return [];
}

/**
 * Sigmoid, used by the planner's classifier. Kept here rather than inlined so the
 * training script and the browser agree on the arithmetic to the last bit.
 */
export function sigmoid(z: number): number {
  // Branched rather than the naive form: exp() of a large negative overflows to 0
  // harmlessly, but exp() of a large positive overflows to Infinity and then the
  // division returns NaN, which would poison a whole training run silently.
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * Every output unit, not just the first.
 *
 * forward() reads next[0] and is right for a scalar score. This is for the one place that
 * needs the outputs to compete: classifying a request into one of several recipes. A
 * separate binary network per recipe cannot do that when two of them share most of their
 * vocabulary - "add a new string" and "change the string text" overlap heavily, and two
 * independent networks each see their own evidence and neither learns to defer. One network
 * with one output per class, trained against each other, is what makes the comparison
 * happen at all.
 *
 * Returns the raw pre-activation scores. The caller applies softmax, because the right
 * thing to do with four logits depends on what it is doing with them.
 */
export function forwardAll(net: Network, x: ArrayLike<number>, scratch?: Float64Array[]): Float64Array {
  const layers = net.layers;
  let buf = ensure(scratch, 0, x.length);
  for (let i = 0; i < x.length; i++) buf[i] = x[i];

  let cur = buf;
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    const isLast = li === layers.length - 1;
    const dst = ensure(scratch, li + 1, L.out);
    for (let o = 0; o < L.out; o++) {
      let sum = L.b[o];
      const base = o * L.in;
      for (let i = 0; i < L.in; i++) sum += L.w[base + i] * cur[i];
      dst[o] = isLast ? sum : sum > 0 ? sum : sum * 0.01;
    }
    cur = dst;
  }
  // Copy out, because the caller may hold on to it while asking for another forward pass
  // with the same scratch space.
  return Float64Array.from(cur.subarray(0, layers[layers.length - 1].out));
}

/**
 * Softmax, shifted by the maximum first. Without the shift, four logits that are all large
 * and of similar size overflow exp() to Infinity, every probability becomes Infinity, and
 * the normalisation returns NaN for all four.
 */
export function softmax(logits: ArrayLike<number>): Float64Array {
  const n = logits.length;
  const out = new Float64Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i] > max) max = logits[i];
  let total = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.exp(logits[i] - max);
    total += out[i];
  }
  if (total === 0) { out.fill(1 / n); return out; }
  for (let i = 0; i < n; i++) out[i] /= total;
  return out;
}
