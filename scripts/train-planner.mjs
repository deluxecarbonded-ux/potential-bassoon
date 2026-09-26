// Trains the build agent's intent classifier and writes src/ai/planner-weights.ts.
//
//   npm run train:planner
//
// The planner holds four recipes - copy, i18n, theme, setting - and has to decide between
// them from the words in a request. That decision is learned here: one network with one
// output per recipe, trained with cross-entropy so the four compete, using the same engine
// and the same backpropagation as the hint ranker.
//
// Why one network with four outputs rather than four binary networks: two of the recipes
// share most of their vocabulary. "add a new string" and "change the string text" are
// different requests whose words overlap almost completely, and four independent binary
// classifiers each fire on both, because nothing in a binary loss makes one of them defer
// to another. Softmax over four logits is what makes the comparison happen.
//
// The corpus is synthetic, and that is worth being blunt about: the honest version of this
// problem is "requests people actually make", and there are none to collect, because this
// project has had one user. So the training set is generated from templates varying the
// verb, the object and the phrasing. It teaches the classifier the vocabulary and the shape
// of these four requests, not the way anyone in particular words things. It will get an
// unfamiliar phrasing right when the words overlap, and it will say "I don't know" when they
// do not - which is the failure mode worth having, because a planner that guesses produces
// a diff nobody can review.
//
// The recipes themselves are not trained. They are hand-written, in src/ai/recipes.ts,
// because an edit has to be exactly right and a learned edit is only approximately right.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {network, forwardAll, softmax} from '../src/ai/engine.ts';
import {features, PLANNER_FEATURE_SIZE, VOCAB} from '../src/ai/planner.ts';
import {RECIPES} from '../src/ai/recipes.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'ai', 'planner-weights.ts');

const EPOCHS = 700;
const LR = 0.03;
const BATCH = 24;
const HIDDEN = [24];

// ─────────────────────────────────────────────────────────────────────────────
// The corpus
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = {
  copy: [
    'change the {x} text',
    'reword the {x} string',
    'the {x} wording is wrong, fix it',
    'update the {x} copy',
    'make the {x} label read differently',
    'change what the {x} says',
    'the {x} text needs correcting',
    'fix a typo in the {x} string',
    'the {x} message is wrong',
    'change the {x} wording instead',
  ],
  i18n: [
    'add a new {x} string',
    'add a string called {x}',
    'introduce a {x} label',
    'create a new {x} message',
    'add another {x} text',
    'we need a {x} string in every language',
    'add a {x} translation key',
    'add a new {x} label for the settings page',
  ],
  theme: [
    'add a {x} theme',
    'support a new {x} colour scheme',
    'add a {x} palette',
    'let people choose the {x} theme',
    'add a {x} skin',
    'we need a {x} appearance option',
    'add a {x} theme to settings',
  ],
  setting: [
    'add a {x} setting',
    'add a toggle for {x}',
    'introduce a {x} flag',
    'add a {x} option to settings',
    'add a {x} preference switch',
    'we need a {x} toggle in the settings panel',
    'add a setting called {x}',
  ],
};

/**
 * Requests that are none of the four.
 *
 * These are the reason the threshold means anything. Without them every probability would
 * sit near 1 and "I don't know" would never fire, so the planner would confidently apply the
 * wrong recipe to a request about the layout. Two of them are deliberately close to a real
 * recipe - "make it faster" is not a copy request, and "add a leaderboard" is not an i18n
 * request - because the near misses are the ones a keyword classifier gets wrong.
 */
const NOISE = [
  'make it faster', 'fix the layout on mobile', 'why is the timer wrong',
  'add a leaderboard', 'change the colours of the arena', 'the save button is broken',
  'add sound effects', 'make the puzzle harder', 'add a dark mode toggle for reduced motion',
  'rename the profile page', 'the high scores are not saving', 'add a streak counter',
  'add a second profile picture', 'the arena lobby does not update',
  'add a badge for finishing hard', 'stop the timer counting up after the answer',
];

const NOUNS = [
  'hint', 'shop', 'profile', 'settings', 'arena', 'score', 'timer', 'welcome', 'footer',
  'answer', 'code', 'coins', 'streak', 'badge', 'title', 'help', 'round', 'lobby',
];

const FILES_FOR = {
  copy: ['src/i18n.ts'],
  i18n: ['src/i18n.ts'],
  theme: ['src/state.tsx', 'src/App.tsx'],
  setting: ['src/state.tsx', 'src/App.tsx'],
};
const ALL_FILES = [
  'src/i18n.ts', 'src/App.tsx', 'src/state.tsx', 'src/styles.css',
  'supabase/functions/_shared/puzzles.ts',
];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build() {
  const rows = [];
  const rand = mulberry(0x1234abcd);

  for (const [recipe, templates] of Object.entries(TEMPLATES)) {
    for (let i = 0; i < 300; i++) {
      const noun = NOUNS[Math.floor(rand() * NOUNS.length)];
      const text = templates[i % templates.length].replace('{x}', noun);
      const files = new Map();
      for (const f of FILES_FOR[recipe]) files.set(f, 'placeholder');
      // A third of the positives are missing a file they need, so the classifier learns
      // that a recipe it cannot satisfy is a poor choice rather than always the right one.
      if (i % 3 === 0) files.delete(FILES_FOR[recipe][0]);
      for (const f of ALL_FILES) if (rand() < 0.35) files.set(f, 'placeholder');
      rows.push({x: features(text, files), want: RECIPES.indexOf(recipe), text});
    }
  }
  // The rejection class, one past the end of the recipe list.
  for (let i = 0; i < 500; i++) {
    const text = NOISE[i % NOISE.length];
    const files = new Map();
    for (const f of ALL_FILES) if (rand() < 0.5) files.set(f, 'placeholder');
    rows.push({x: features(text, files), want: RECIPES.length, text});
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Training: cross-entropy, one output per class plus a rejection output
// ─────────────────────────────────────────────────────────────────────────────

const moment = (n) => ({m: new Float64Array(n), v: new Float64Array(n), t: 0});

function adamStep(p, g, a, lr) {
  a.t++;
  const c1 = 1 - Math.pow(0.9, a.t);
  const c2 = 1 - Math.pow(0.999, a.t);
  for (let i = 0; i < p.length; i++) {
    a.m[i] = 0.9 * a.m[i] + 0.1 * g[i];
    a.v[i] = 0.999 * a.v[i] + 0.001 * g[i] * g[i];
    p[i] -= (lr * (a.m[i] / c1)) / (Math.sqrt(a.v[i] / c2) + 1e-8);
  }
}

function forwardCache(net, x) {
  const acts = [Float64Array.from(x)];
  let buf = acts[0];
  for (const L of net.layers) {
    const z = new Float64Array(L.out);
    for (let o = 0; o < L.out; o++) {
      let s = L.b[o];
      const base = o * L.in;
      for (let i = 0; i < L.in; i++) s += L.w[base + i] * buf[i];
      z[o] = s;
    }
    const a = new Float64Array(L.out);
    for (let o = 0; o < L.out; o++) a[o] = z[o] > 0 ? z[o] : z[o] * 0.01;
    acts.push(a);
    buf = a;
  }
  return acts;
}

const OUTS = RECIPES.length + 1; // the last output is "none of these"

function train(data) {
  const net = network(PLANNER_FEATURE_SIZE, [...HIDDEN, OUTS]);
  const rand = mulberry(0x5eed);
  const scale = Math.sqrt(2 / PLANNER_FEATURE_SIZE);
  for (const L of net.layers) for (let i = 0; i < L.w.length; i++) L.w[i] = (rand() * 2 - 1) * scale;
  const state = net.layers.map((L) => ({w: moment(L.w.length), b: moment(L.b.length)}));

  const order = data.map((_, i) => i);
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const lr = LR * (0.5 * (1 + Math.cos((Math.PI * epoch) / EPOCHS)) * 0.9 + 0.1);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let loss = 0;
    for (let start = 0; start < order.length; start += BATCH) {
      const idx = order.slice(start, start + BATCH);
      const n = idx.length;
      const gw = net.layers.map((L) => new Float64Array(L.w.length));
      const gb = net.layers.map((L) => new Float64Array(L.b.length));
      for (const k of idx) {
        const e = data[k];
        const acts = forwardCache(net, e.x);
        const p = softmax(acts[acts.length - 1]);
        loss += -Math.log(Math.max(1e-9, p[e.want]));
        // dL/dlogit = p - onehot
        let dz = new Float64Array(OUTS);
        for (let o = 0; o < OUTS; o++) dz[o] = (p[o] - (o === e.want ? 1 : 0)) / n;
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
            const dzP = new Float64Array(L.in);
            for (let i = 0; i < L.in; i++) dzP[i] = dA[i] * (acts[li][i] > 0 ? 1 : 0.01);
            dz = dzP;
          }
        }
      }
      for (let li = 0; li < net.layers.length; li++) {
        adamStep(net.layers[li].w, gw[li], state[li].w, lr);
        adamStep(net.layers[li].b, gb[li], state[li].b, lr);
      }
    }
    if (epoch % 100 === 0 || epoch === EPOCHS - 1) {
      const acc = accuracy(net, data);
      console.log(`  epoch ${String(epoch).padStart(3)}  loss ${(loss / data.length).toFixed(4)}  train acc ${(acc * 100).toFixed(1)}%`);
    }
  }
  return net;
}

function accuracy(net, data) {
  let ok = 0;
  for (const e of data) {
    const p = softmax(forwardAll(net, e.x));
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    if (best === e.want) ok++;
  }
  return ok / data.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emit
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v) => {
  const s = v.toPrecision(7);
  return s.includes('.') || s.includes('e') ? s : s + '.0';
};

const matrix = (L) => {
  const rows = [];
  for (let o = 0; o < L.out; o++) {
    const row = [];
    for (let i = 0; i < L.in; i++) row.push(fmt(L.w[o * L.in + i]));
    rows.push(row.join(','));
  }
  return rows.join(',');
};

console.log(`vocabulary: ${VOCAB.length} words, features: ${PLANNER_FEATURE_SIZE}, outputs: ${OUTS}`);
const data = build();
console.log(`corpus: ${data.length} rows (${data.length - data.filter((d) => d.want === OUTS - 1).length} recipe, ${data.filter((d) => d.want === OUTS - 1).length} rejection)\n`);

const net = train(data);

// Per-class report, because a single accuracy figure hides the case that matters most:
// whether it rejects what it should. A classifier that never says "I don't know" applies a
// confident wrong edit, which is the one outcome the planner exists to avoid.
const report = [];
for (let c = 0; c < OUTS; c++) {
  const rows = data.filter((d) => d.want === c);
  if (!rows.length) continue;
  let ok = 0;
  for (const d of rows) {
    const p = softmax(forwardAll(net, d.x));
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    if (best === c) ok++;
  }
  report.push({label: c === OUTS - 1 ? 'reject' : RECIPES[c], acc: ok / rows.length, n: rows.length});
}
console.log('\nper class:');
for (const r of report) {
  const bar = '#'.repeat(Math.round(r.acc * 30)).padEnd(30, '.');
  console.log(`  ${r.label.padEnd(9)} ${bar} ${(r.acc * 100).toFixed(1)}%  (${r.n} rows)`);
}

const reject = report.find((r) => r.label === 'reject');
const worstRecipe = report.filter((r) => r.label !== 'reject').reduce((a, b) => (a.acc < b.acc ? a : b));
if (!reject || reject.acc < 0.85) {
  console.error(`\nRejection accuracy ${(reject?.acc * 100).toFixed(1)}% is too low: the planner would apply a confident wrong edit.`);
  process.exit(1);
}
if (worstRecipe.acc < 0.9) {
  console.error(`\n${worstRecipe.label} is only ${(worstRecipe.acc * 100).toFixed(1)}% - refusing to write weights.`);
  process.exit(1);
}

const params = net.layers.reduce((n, l) => n + l.w.length + l.b.length, 0);
const out = [];
out.push('// Generated by scripts/train-planner.mjs. Do not edit by hand.');
out.push('//');
out.push(`// One network, ${PLANNER_FEATURE_SIZE} features in, ${OUTS} outputs out: one per recipe plus a`);
out.push('// rejection class, so the four compete rather than four independent classifiers each');
out.push('// firing on the same words. Feature layout: src/ai/planner.ts.');
out.push('//');
out.push('// Per-class accuracy on the training corpus:');
for (const r of report) out.push(`//   ${r.label.padEnd(9)} ${(r.acc * 100).toFixed(1)}%`);
out.push('//');
out.push(`// ${params} parameters. The whole of the planning step, on the reader's machine, with`);
out.push('// no request leaving the device and nothing to run out of.');
out.push('');
out.push("import type {Network} from './engine.ts';");
out.push('');
out.push('export const PLANNER_WEIGHTS:Network={');
out.push(`  inputSize:${net.inputSize},`);
out.push('  layers:[');
net.layers.forEach((L) => {
  out.push(`   {in:${L.in},out:${L.out},w:Float64Array.from([${matrix(L)}]),b:Float64Array.from([${Array.from(L.b, fmt).join(',')}])},`);
});
out.push('  ],');
out.push('};');
out.push('');

writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(`\nwrote src/ai/planner-weights.ts  (${params} parameters)`);
