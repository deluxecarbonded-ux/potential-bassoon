// Trains the hint-ranking network and writes src/ai/weights.ts.
//
//   npm run train:ai
//
// Run this after changing src/ai/features.ts or the rubric below. The weights are
// committed, so a player never trains anything and never downloads anything; this script
// is the whole build step, and it is deterministic, so re-running it on an unchanged tree
// reproduces the committed file byte for byte.
//
// Plain JavaScript on purpose: Node strips types out of imported .ts modules but not out
// of this file, which is .mjs like every other script here.
//
// ─────────────────────────────────────────────────────────────────────────────
// What is actually being learned, stated plainly
// ─────────────────────────────────────────────────────────────────────────────
//
// The network does not learn what a good hint is. That is written down, in rubric() below,
// as a function of features: how well a hint's strength matches what this puzzle at this
// level and difficulty calls for, whether it was computed from this puzzle or is generic,
// whether it is the right length for its script, and whether narrowing is even welcome in
// this category. All of that is human judgement, stated as arithmetic.
//
// What the network learns is the shape of that judgement across all thirty-four features
// at once, including the parts that interact. Strength interacts with difficulty and with
// level. Length interacts with writing system. Narrowing is worth a lot in math and close
// to worthless in trivia, where the question is recall rather than deduction - and that
// interaction is not something a lookup table keyed on "which strategy is this" could
// express. Those interactions are the hidden layers' entire job, and they are learned from
// the corpus rather than written by hand.
//
// So: the pedagogy is ours and the model is real, but this is a ranker over candidates
// the reasoning layer already knows how to produce, not a language model. It cannot write
// prose and is not asked to. What it does is choose, per puzzle, which of several correct
// hints to show.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { makePuzzle } from '../supabase/functions/_shared/puzzles.ts';
import { candidates } from '../src/ai/expert.ts';
import { features, FEATURE_SIZE, leaksCode } from '../src/ai/features.ts';
import { network, forward } from '../src/ai/engine.ts';
import { languages, translations } from '../src/i18n.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'ai', 'weights.ts');

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const SEEDS = 12;

// ─────────────────────────────────────────────────────────────────────────────
// The rubric: the judgement being learned
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How welcome a narrowing is, by category. A deduction puzzle is unblocked by being told
 * which three digits are possible; a trivia clue is a recall question, and narrowing it
 * does not tutor so much as answer it, so the same strength scores far lower here. This
 * single asymmetry is most of what the hidden layer exists to represent.
 */
const NARROWING_WORTH = { math: 1, logic: 1, riddles: 0.85, science: 0.9, trivia: 0.45 };

const CLAMP = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Mean hint length per writing system. Must match MEAN_LENGTH in src/ai/features.ts. */
const MEAN_LENGTH = [88, 96, 74, 82, 40];
const SCRIPT_OF = {
  en: 0, es: 0, fr: 0, de: 0, pt: 0, it: 0, nl: 0, id: 0,
  ru: 1, ar: 2, ur: 2, hi: 3, ja: 4, ko: 4, zh: 4,
};

function rubric(c, ctx) {
  const { puzzle, difficulty, locale, level } = ctx;
  const di = { easy: 0, medium: 1, hard: 2 }[difficulty];

  // How much narrowing this puzzle calls for. Difficulty and level both push it up: a
  // level 1 easy puzzle wants a direction, a level 30 hard one wants a hand.
  const ideal = CLAMP(0.9 + level / 34 + di * 0.45, 0.8, 2.5) * NARROWING_WORTH[puzzle.category];
  // Gaussian rather than linear, so "one step too strong" is penalised more than "half a
  // step too weak". Over-helping costs a player the puzzle; under-helping costs them a
  // retry, and only the first is worth avoiding.
  const strengthFit = Math.exp(-Math.pow(c.strength - ideal, 2) / 0.9);

  // A hint computed from this puzzle beats a sentence that would fit any of them.
  const specificity = c.specific ? 1 : 0;

  // Readable at a glance, in this script, without being a wall of text.
  const lenFit = 1 - Math.min(1, Math.abs(c.text.length - MEAN_LENGTH[SCRIPT_OF[locale] || 0]) / 70);

  // Any hint above the bare canned one has to tell the player what to do next.
  const direction = c.strength >= 1 ? 1 : 0;

  // The canned hint is the floor and should be beaten by anything specific of equal
  // strength, but it must never score near zero: it is what a player gets when nothing
  // else survives, and a ranker that learned to bury it would leave someone with no hint.
  const floor = c.strategy === 'canned' ? 0.5 : 0.55;

  return CLAMP(
    0.38 * strengthFit + 0.24 * specificity + 0.16 * lenFit + 0.12 * direction + 0.10 * floor,
    0, 1,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Corpus
// ─────────────────────────────────────────────────────────────────────────────

/** The i18n lookup candidates() expects, backed by the real translation table. */
const lookup = (locale) => (key, vars) => {
  const row = translations[locale] || translations.en;
  let s = row[key] ?? translations.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  return s;
};

function build() {
  const train = [];
  const val = [];
  let puzzles = 0;
  const byStrategy = new Map();

  for (const { code: locale } of languages) {
    const t = lookup(locale);
    for (const difficulty of DIFFICULTIES) {
      for (let level = 1; level <= 30; level++) {
        for (let seed = 0; seed < SEEDS; seed++) {
          const puzzle = makePuzzle(difficulty, level, locale, seed * 7919 + 13);
          // Split on the seed, never on the row: a validation set sharing a puzzle with
          // the training set would flatter the network on the one thing it is asked to
          // generalise over, which is unseen puzzles.
          const bucket = seed % 4 === 3 ? val : train;
          const ctx = { puzzle, difficulty, level, locale, t };
          for (const c of candidates(ctx)) {
            bucket.push({ x: features(c, ctx), y: rubric(c, ctx) });
            byStrategy.set(c.strategy, (byStrategy.get(c.strategy) || 0) + 1);
          }
          puzzles++;
        }
      }
    }
  }
  console.log(`  puzzles      ${puzzles}`);
  console.log(`  train rows   ${train.length}`);
  console.log(`  val rows     ${val.length}`);
  console.log('  per strategy ' + [...byStrategy].map(([k, n]) => `${k}=${n}`).join(' '));
  return { train, val };
}

// ─────────────────────────────────────────────────────────────────────────────
// Training: backpropagation by hand, Adam, mean squared error
// ─────────────────────────────────────────────────────────────────────────────

// Every entry is a layer, so the final 1 is the output unit itself. Leaving it off would
// silently give the network a twelve-wide output, and forward() would read only the first
// of the twelve - which trains happily and scores nonsense.
const HIDDEN = [24, 12, 1];
const EPOCHS = 260;
const LR = 0.012;
const BATCH = 64;

/** Deterministic PRNG, so a re-run reproduces the committed weights exactly. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const moment = (n) => ({ m: new Float64Array(n), v: new Float64Array(n), t: 0 });

function adamStep(p, g, a, lr, b1 = 0.9, b2 = 0.999, eps = 1e-8) {
  a.t++;
  const c1 = 1 - Math.pow(b1, a.t);
  const c2 = 1 - Math.pow(b2, a.t);
  for (let i = 0; i < p.length; i++) {
    a.m[i] = b1 * a.m[i] + (1 - b1) * g[i];
    a.v[i] = b2 * a.v[i] + (1 - b2) * g[i] * g[i];
    p[i] -= (lr * (a.m[i] / c1)) / (Math.sqrt(a.v[i] / c2) + eps);
  }
}

/** Forward pass keeping every intermediate, because the backward pass needs them. */
function forwardCache(net, x) {
  const acts = [Float64Array.from(x)];
  let buf = acts[0];
  for (const L of net.layers) {
    const z = new Float64Array(L.out);
    for (let o = 0; o < L.out; o++) {
      let sum = L.b[o];
      const base = o * L.in;
      for (let i = 0; i < L.in; i++) sum += L.w[base + i] * buf[i];
      z[o] = sum;
    }
    const a = new Float64Array(L.out);
    // Leaky ReLU, matching the activation in src/ai/engine.ts.
    for (let o = 0; o < L.out; o++) a[o] = z[o] > 0 ? z[o] : z[o] * 0.01;
    acts.push(a);
    buf = a;
  }
  return acts;
}

function rmse(net, set) {
  let total = 0;
  const scratch = [];
  for (const e of set) {
    const d = forward(net, e.x, scratch) - e.y;
    total += d * d;
  }
  return Math.sqrt(total / set.length);
}

function train(net, data) {
  const state = net.layers.map((L) => ({ w: moment(L.w.length), b: moment(L.b.length) }));
  const rand = rng(0x5eed);
  const order = data.map((_, i) => i);
  // Deterministic shuffle, so the run is reproducible.
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    // Cosine decay: a large step early to break the symmetry between hidden units, a
    // small one late so the weights settle instead of oscillating.
    const lr = LR * (0.5 * (1 + Math.cos((Math.PI * epoch) / EPOCHS)) * 0.9 + 0.1);
    let loss = 0;

    for (let start = 0; start < order.length; start += BATCH) {
      const idx = order.slice(start, start + BATCH);
      const n = idx.length;
      const gw = net.layers.map((L) => new Float64Array(L.w.length));
      const gb = net.layers.map((L) => new Float64Array(L.b.length));

      for (const k of idx) {
        const e = data[k];
        const acts = forwardCache(net, e.x);
        const y = acts[acts.length - 1][0];
        const d = y - e.y;
        loss += d * d;

        // The output layer is linear, so dz is the error itself. Allocated to the real
        // output width rather than assumed to be one: a short array here reads past its
        // end as undefined, and undefined times anything is NaN.
        const outW = net.layers[net.layers.length - 1].out;
        let dz = new Float64Array(outW);
        dz[0] = (2 * d) / n;
        for (let li = net.layers.length - 1; li >= 0; li--) {
          const L = net.layers[li];
          const aPrev = acts[li];
          for (let o = 0; o < L.out; o++) {
            const g = dz[o];
            if (g === 0) continue;
            const base = o * L.in;
            for (let i = 0; i < L.in; i++) gw[li][base + i] += g * aPrev[i];
            gb[li][o] += g;
          }
          if (li > 0) {
            const dA = new Float64Array(L.in);
            for (let o = 0; o < L.out; o++) {
              const g = dz[o];
              if (g === 0) continue;
              const base = o * L.in;
              for (let i = 0; i < L.in; i++) dA[i] += g * L.w[base + i];
            }
            const z = acts[li];
            const dzPrev = new Float64Array(L.in);
            for (let i = 0; i < L.in; i++) dzPrev[i] = dA[i] * (z[i] > 0 ? 1 : 0.01);
            dz = dzPrev;
          }
        }
      }

      for (let li = 0; li < net.layers.length; li++) {
        adamStep(net.layers[li].w, gw[li], state[li].w, lr);
        adamStep(net.layers[li].b, gb[li], state[li].b, lr);
      }
    }

    if (epoch % 40 === 0 || epoch === EPOCHS - 1) {
      console.log(`  epoch ${String(epoch).padStart(3)}  lr ${lr.toFixed(4)}  train rmse ${Math.sqrt(loss / order.length).toFixed(5)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Emit
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v) => {
  const s = v.toPrecision(7);
  return s.includes('.') || s.includes('e') ? s : s + '.0';
};

function emit(net, rVal) {
  const paramCount = net.layers.reduce((n, l) => n + l.w.length + l.b.length, 0);
  const out = [];
  out.push('// Generated by scripts/train-ai.mjs. Do not edit by hand.');
  out.push('//');
  out.push(`// Feature layout: src/ai/features.ts, FEATURE_SIZE = ${net.inputSize}.`);
  out.push(`// Architecture: ${net.inputSize} -> ${net.layers.map((l) => l.out).join(' -> ')}, leaky ReLU, linear output.`);
  out.push(`// Validation RMSE on unseen puzzles: ${rVal.toFixed(5)}, targets spanning 0 to 1.`);
  out.push(`// ${paramCount} parameters.`);
  out.push('//');
  out.push('// A few kilobytes of numbers, and that is the entire model. There is nothing to');
  out.push('// download, no runtime to initialise and no accelerator to ask for, which is what');
  out.push('// makes the AI features in this app free and unlimited on every device.');
  out.push('');
  out.push("import type {Network} from './engine.ts';");
  out.push('');
  out.push('export const WEIGHTS:Network={');
  out.push(`  inputSize:${net.inputSize},`);
  out.push('  layers:[');
  net.layers.forEach((L, li) => {
    const rows = [];
    for (let o = 0; o < L.out; o++) {
      const row = [];
      for (let i = 0; i < L.in; i++) row.push(fmt(L.w[o * L.in + i]));
      rows.push(row.join(','));
    }
    out.push(`    // layer ${li}: ${L.in} -> ${L.out}`);
    out.push(`    {in:${L.in},out:${L.out},`);
    out.push(`     w:Float64Array.from([${rows.join(',')}]),`);
    out.push(`     b:Float64Array.from([${Array.from(L.b, fmt).join(',')}])},`);
  });
  out.push('  ],');
  out.push('};');
  out.push('');
  return out.join('\n');
}

console.log('BUILDING THE CORPUS');
const { train: trainSet, val: valSet } = build();

console.log('\nTRAINING');
const net = network(FEATURE_SIZE, HIDDEN);
{
  // Small seeded init, so the hidden units do not start symmetric with each other.
  const rand = rng(0xc0ffee);
  const scale = Math.sqrt(2 / FEATURE_SIZE);
  for (const L of net.layers) {
    for (let i = 0; i < L.w.length; i++) L.w[i] = (rand() * 2 - 1) * scale;
  }
}
const before = rmse(net, valSet);
console.log(`  before        val rmse ${before.toFixed(5)}`);
train(net, trainSet);
const after = rmse(net, valSet);
console.log(`  after         val rmse ${after.toFixed(5)}`);

// A ranking model that cannot outrank a constant would be a failed run, so say so rather
// than writing weights that look trained and are not.
if (!(after < before * 0.7)) {
  console.error('\nTRAINING DID NOT CONVERGE - refusing to write weights.');
  process.exit(1);
}
if (after > 0.09) {
  console.error(`\nVALIDATION RMSE ${after.toFixed(5)} is too high to ship.`);
  process.exit(1);
}

// Agreement check: low error is not sufficient on its own. What matters is whether the
// network picks the same candidate the rubric would, because picking is the whole job.
{
  let agree = 0;
  let total = 0;
  const t = lookup('en');
  for (const locale of ['en', 'ja', 'ar', 'de', 'zh', 'ru']) {
    const lt = lookup(locale);
    for (const difficulty of DIFFICULTIES) {
      for (const level of [1, 7, 15, 23, 30]) {
        for (let seed = 0; seed < 40; seed++) {
          const puzzle = makePuzzle(difficulty, level, locale, seed * 104729 + 7);
          const ctx = { puzzle, difficulty, level, locale, t: lt };
          const cs = candidates(ctx).filter((c) => !leaksCode(c.text));
          if (cs.length < 2) continue;
          let netTop = null;
          let netBest = -Infinity;
          let rubTop = null;
          let rubBest = -Infinity;
          for (const c of cs) {
            const n = forward(net, features(c, ctx));
            if (n > netBest) { netBest = n; netTop = c; }
            const r = rubric(c, ctx);
            if (r > rubBest) { rubBest = r; rubTop = c; }
          }
          total++;
          if (netTop && rubTop && netTop.strategy === rubTop.strategy) agree++;
        }
      }
    }
  }
  const rate = total ? agree / total : 0;
  console.log(`\n  top-choice agreement with the rubric: ${(rate * 100).toFixed(1)}% over ${total} puzzles`);
  if (rate < 0.8) {
    console.error('The network disagrees with the rubric too often to ship.');
    process.exit(1);
  }
}

const source = emit(net, after);
writeFileSync(OUT, source, 'utf8');
console.log(`\nwrote src/ai/weights.ts  (${Buffer.byteLength(source, 'utf8')} bytes, ${net.layers.reduce((n, l) => n + l.w.length + l.b.length, 0)} parameters)`);
