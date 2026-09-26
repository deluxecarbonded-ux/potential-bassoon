// Tests for the local build agent's planner: the classifier, the recipes, and the
// guarantee that a recipe never offers an edit it has not checked.
//
//   npm run test:planner
//
// The important test in this file is the held-out one. The training corpus is synthetic
// and generated from templates, so its own accuracy is nearly meaningless - the classifier
// has memorised the templates. Everything below therefore uses phrasings that appear in no
// template, which is the closest thing to an honest generalisation check available for a
// system with one user and no request log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { features, PLANNER_FEATURE_SIZE, VOCAB, PLANNER_WATCHED, classify, rejection, plan } from '../src/ai/planner.ts';
import { PLANNER_WEIGHTS } from '../src/ai/planner-weights.ts';
import { RECIPES, RECIPE_FNS } from '../src/ai/recipes.ts';
import { forwardAll, softmax, sigmoid } from '../src/ai/engine.ts';

// The real files, so the recipes are exercised against the actual anchors rather than a
// fixture that could drift away from them.
const REAL = {
  'src/i18n.ts': readFileSync('src/i18n.ts', 'utf8'),
  'src/App.tsx': readFileSync('src/App.tsx', 'utf8'),
  'src/state.tsx': readFileSync('src/state.tsx', 'utf8'),
};
const ALL = new Map(Object.entries(REAL));

// ── the feature vector ─────────────────────────────────────────────────────────

test('the feature vector is the declared width and finite', () => {
  const x = features('add a new hint string', ALL);
  assert.equal(x.length, PLANNER_FEATURE_SIZE);
  for (const v of x) assert.ok(Number.isFinite(v));
});

test('the feature width is derived from the vocabulary, not hard-coded', () => {
  // It was 48 once against 59 written values, and the truncation silently removed the
  // shape features that separate the copy recipe from the i18n one. Deriving it means a
  // new word cannot break the layout.
  assert.equal(PLANNER_FEATURE_SIZE, VOCAB.length + PLANNER_WATCHED.length + 5);
  assert.ok(PLANNER_FEATURE_SIZE >= VOCAB.length, 'the vector cannot hold the vocabulary');
});

test('the weights match the feature layout', () => {
  assert.equal(PLANNER_WEIGHTS.inputSize, PLANNER_FEATURE_SIZE, 'run: npm run train:planner');
  assert.equal(PLANNER_WEIGHTS.layers[0].in, PLANNER_FEATURE_SIZE);
  for (const l of PLANNER_WEIGHTS.layers) {
    assert.equal(l.w.length, l.in * l.out);
    assert.equal(l.b.length, l.out);
  }
  // One output per recipe plus the rejection class.
  assert.equal(PLANNER_WEIGHTS.layers[PLANNER_WEIGHTS.layers.length - 1].out, RECIPES.length + 1);
});

test('every weight is finite', () => {
  for (const l of PLANNER_WEIGHTS.layers) {
    for (const v of l.w) assert.ok(Number.isFinite(v));
    for (const v of l.b) assert.ok(Number.isFinite(v));
  }
});

test('softmax is finite when the logits are large', () => {
  // Four large, similar logits overflow exp() to Infinity without the max-shift, and every
  // probability comes back NaN - which would make every threshold comparison false.
  const p = softmax(Float64Array.of(900, 901, 899, 902, 900));
  for (const v of p) assert.ok(Number.isFinite(v));
  assert.ok(Math.abs([...p].reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

// ── the classifier, on phrasings no template contained ─────────────────────────

const HELD_OUT = [
  ['the wording on the welcome screen is off', 'copy'],
  ['that sentence about the timer reads badly', 'copy'],
  ['the footer line needs to say something else', 'copy'],
  ['can you put a brand new string in for the pause button', 'i18n'],
  ['we shipped a new label and nobody translated it yet', 'i18n'],
  ['put a dusk theme on the settings page', 'theme'],
  ['give the arena a monochrome palette', 'theme'],
  ['an accessibility switch for high contrast would help', 'setting'],
  ['add a preference switch for reduce motion', 'setting'],
];

test('the classifier recognises held-out phrasings', () => {
  let right = 0;
  const wrong = [];
  for (const [text, want] of HELD_OUT) {
    const top = classify(text, ALL)[0];
    if (top.recipe === want) right++;
    else wrong.push(`"${text}" -> ${top.recipe} (${top.confidence.toFixed(2)}), wanted ${want}`);
  }
  // Not 100%: these are phrasings no template contained, and the honest claim is that it
  // generalises over vocabulary overlap, not that it reads English.
  assert.ok(right >= HELD_OUT.length - 2, `only ${right}/${HELD_OUT.length}:\n  ${wrong.join('\n  ')}`);
});

test('the classifier rejects requests that are none of the four', () => {
  const noise = [
    'make the arena lobby update faster',
    'the high score table is not sorting',
    'stop the timer counting up after you answer',
    'add a leaderboard to the profile page',
  ];
  for (const text of noise) {
    assert.ok(
      rejection(text, ALL) > 0.5,
      `"${text}" was not rejected (${rejection(text, ALL).toFixed(2)}) - it would apply a confident wrong edit`,
    );
  }
});

test('a request with no files in hand is not confidently planned', () => {
  // The recipes cannot run without anchors, and the classifier is fed the file set, so an
  // empty hand should not read as a confident match.
  const empty = new Map();
  const p = plan('add a dusk theme', [{path: 'README.md', content: '# nothing here'}]);
  assert.ok(p.unknown || p.operations.length === 0, JSON.stringify(p));
  assert.equal(classify('add a dusk theme', empty).length, RECIPES.length);
});

// ── the recipes, against the real files ────────────────────────────────────────

test('the copy recipe rewords an existing string and changes nothing else', () => {
  const key = 'footer';
  const before = REAL['src/i18n.ts'];
  const original = before.split('\n').find((l) => l.startsWith(`${key}|`));
  assert.ok(original, `fixture is missing the "${key}" row`);

  const p = plan(`reword the ${key} string to say "Made by hand"`, [{path: 'src/i18n.ts', content: before}]);
  assert.equal(p.unknown, false, 'the copy recipe declined a request it should handle');
  assert.equal(p.recipe, 'copy');
  assert.equal(p.operations.length, 1);

  const after = p.operations[0].content;
  const row = after.split('\n').find((l) => l.startsWith(`${key}|`));
  assert.equal(row.split('|')[1], 'Made by hand', 'the English text was not replaced');
  assert.equal(row.split('|').length, 17, 'the row lost or gained a field');
  // Only one line may differ. A recipe that reformats the file is a recipe that will
  // produce an unreviewable diff.
  const diff = before.split('\n').filter((l, i) => l !== after.split('\n')[i]);
  assert.equal(diff.length, 1, `${diff.length} lines changed, expected 1`);
});

test('the copy recipe refuses a key that is not there', () => {
  const p = plan('reword the nonexistent string to say "x"', [{path: 'src/i18n.ts', content: REAL['src/i18n.ts']}]);
  assert.ok(p.unknown || p.operations.length === 0, 'it invented an edit for a key that does not exist');
});

test('the i18n recipe adds a row with the right shape', () => {
  const p = plan('add a string called pauseLabel with the text "Pause"', [{path: 'src/i18n.ts', content: REAL['src/i18n.ts']}]);
  assert.equal(p.unknown, false);
  const after = p.operations[0].content;
  const row = after.split('\n').find((l) => l.startsWith('pauseLabel|'));
  assert.ok(row, 'no row was added');
  assert.equal(row.split('|').length, 17, 'the new row does not have sixteen locales');
  assert.equal(row.split('|')[1], 'Pause');
  // The added row must be inside the table, not after its closing backtick.
  assert.ok(after.indexOf('pauseLabel|') < after.indexOf('`;'), 'the row landed outside the table');
  assert.ok(p.note && /translat/i.test(p.note), 'it did not say the translations are still needed');
});

test('the i18n recipe will not add a key that already exists', () => {
  const p = plan('add a string called footer with the text "x"', [{path: 'src/i18n.ts', content: REAL['src/i18n.ts']}]);
  assert.ok(p.unknown || !p.operations.some((o) => (o.content || '').includes('footer|')), 'it duplicated an existing key');
});

test('the theme recipe touches the type and the settings list, or nothing', () => {
  const p = plan('add a dusk theme', [
    {path: 'src/state.tsx', content: REAL['src/state.tsx']},
    {path: 'src/App.tsx', content: REAL['src/App.tsx']},
  ]);
  assert.equal(p.unknown, false, JSON.stringify(p));
  assert.equal(p.operations.length, 2);
  const paths = p.operations.map((o) => o.path).sort();
  assert.deepEqual(paths, ['src/App.tsx', 'src/state.tsx']);
  const state = p.operations.find((o) => o.path === 'src/state.tsx').content;
  assert.ok(state.includes("'dusk'"), 'the theme was not added to the saved-state union');
  assert.ok(p.note && /styles\.css/.test(p.note), 'it did not say the styles are still missing');
});

test('the theme recipe refuses when it is only given half the files', () => {
  // Half a theme is a type that allows a value nothing renders.
  const p = plan('add a dusk theme', [{path: 'src/state.tsx', content: REAL['src/state.tsx']}]);
  assert.ok(p.unknown || p.operations.length === 0, 'it applied half a theme');
});

test('the theme recipe will not duplicate an existing theme', () => {
  const p = plan('add a dark theme', [
    {path: 'src/state.tsx', content: REAL['src/state.tsx']},
    {path: 'src/App.tsx', content: REAL['src/App.tsx']},
  ]);
  assert.ok(p.unknown || p.operations.length === 0, 'it added a theme that already exists');
});

test('the setting recipe adds the type, the default and the toggle together', () => {
  const p = plan('add a setting called reduceMotion', [
    {path: 'src/state.tsx', content: REAL['src/state.tsx']},
    {path: 'src/App.tsx', content: REAL['src/App.tsx']},
  ]);
  assert.equal(p.unknown, false, JSON.stringify(p));
  assert.equal(p.operations.length, 2);
  const state = p.operations.find((o) => o.path === 'src/state.tsx').content;
  assert.ok(state.includes('reduceMotion:boolean'), 'the type was not extended');
  assert.ok(state.includes('reduceMotion:false'), 'no default was given');
  const app = p.operations.find((o) => o.path === 'src/App.tsx').content;
  assert.ok(app.includes('reduceMotion'), 'no toggle was added');
});

test('every recipe returns null rather than a broken edit on empty input', () => {
  for (const name of RECIPES) {
    for (const input of ['', '   ', 'x', 'add a thing']) {
      const r = RECIPE_FNS[name](input, new Map());
      if (r) {
        // If it did return something, every operation must carry real content.
        for (const o of r.operations) {
          assert.ok(typeof o.content === 'string' && o.content.length > 0, `${name} returned an empty ${o.op}`);
        }
      }
    }
  }
});

// ── the plan as a whole ───────────────────────────────────────────────────────

test('a plan never contains an operation for a file it was not given', () => {
  const p = plan('reword the footer string to say "x"', [{path: 'src/i18n.ts', content: REAL['src/i18n.ts']}]);
  for (const o of p.operations) {
    assert.ok(o.path === 'src/i18n.ts', `touched ${o.path}, which was not supplied`);
  }
});

test('a plan never proposes a delete', () => {
  // Nothing in the library deletes, and a delete needs its own confirmation in the UI.
  // Asserted because a recipe that grew one by accident would be a nasty surprise.
  for (const [text, files] of [
    ['reword the footer string to say "x"', [{path: 'src/i18n.ts', content: REAL['src/i18n.ts']}]],
    ['add a dusk theme', [{path: 'src/state.tsx', content: REAL['src/state.tsx']}, {path: 'src/App.tsx', content: REAL['src/App.tsx']}]],
    ['add a setting called foo', [{path: 'src/state.tsx', content: REAL['src/state.tsx']}, {path: 'src/App.tsx', content: REAL['src/App.tsx']}]],
  ]) {
    const p = plan(text, files);
    assert.equal(p.preview.delete, 0, `${text} proposed a delete`);
    assert.equal(p.operations.filter((o) => o.op === 'delete').length, 0);
  }
});

test('planning is fast enough to feel instant', () => {
  const files = [
    {path: 'src/i18n.ts', content: REAL['src/i18n.ts']},
    {path: 'src/state.tsx', content: REAL['src/state.tsx']},
    {path: 'src/App.tsx', content: REAL['src/App.tsx']},
  ];
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 500; i++) plan('add a dusk theme', files);
  const perCallUs = Number(process.hrtime.bigint() - t0) / 500 / 1000;
  assert.ok(perCallUs < 20000, `${perCallUs.toFixed(0)}us per plan is too slow`);
});

test('forwardAll agrees with the shapes it is given', () => {
  const p = softmax(forwardAll(PLANNER_WEIGHTS, features('add a dusk theme', ALL)));
  assert.equal(p.length, RECIPES.length + 1);
  assert.ok(Math.abs([...p].reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(Number.isFinite(sigmoid(0)));
});
