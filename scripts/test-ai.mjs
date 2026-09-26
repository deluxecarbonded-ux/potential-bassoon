// Tests for the local AI: the safety gate, the reasoning layer, the features, the
// network arithmetic, and the ranking the model exists to perform.
//
//   npm run test:ai
//
// Plain JavaScript, like every other script in this directory: Node strips types out of
// imported .ts modules but not out of a .mjs file.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makePuzzle, categories } from '../supabase/functions/_shared/puzzles.ts';
import { candidates, digitWindow } from '../src/ai/expert.ts';
import { features, FEATURE_SIZE, leaksCode } from '../src/ai/features.ts';
import { forward, network, sigmoid } from '../src/ai/engine.ts';
import { WEIGHTS } from '../src/ai/weights.ts';
import { acceptable, hintFor, rank, MODEL } from '../src/ai/hint.ts';
import { languages, translations } from '../src/i18n.ts';

const lookup = (locale) => (key, vars) => {
  const row = translations[locale] || translations.en;
  let s = row[key] ?? translations.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  return s;
};

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const ctxFor = (difficulty, level, locale = 'en', seed = 3) => {
  const puzzle = makePuzzle(difficulty, level, locale, seed);
  return { puzzle, difficulty, level, locale, t: lookup(locale) };
};

/**
 * makePuzzle assigns categories round-robin by level: categories[(level - 1) % 5]. Several
 * assertions below are about one category, so they have to ask for a level that actually
 * produces it rather than assuming every level looks alike.
 */
const categoryAt = (level) => categories[(level - 1) % categories.length];
const levelsFor = (cat) => {
  const out = [];
  for (let l = 1; l <= 30; l++) if (categoryAt(l) === cat) out.push(l);
  return out;
};

// ── the safety gate ──────────────────────────────────────────────────────────
// Nothing else in this file matters if a hint can hand over the code.

test('the gate refuses four digits written directly', () => {
  for (const bad of ['4271', 'Try 4271.', 'The code is 4271.']) assert.equal(acceptable(bad), '');
});

test('the gate refuses the code split by spaces, commas or hyphens', () => {
  // "0 4 2 7 1" is the same four digits as "04271", and hiding one that way is the
  // oldest trick there is.
  for (const bad of ['0 4 2 7 1', '4,271', '0-4-2-7', '4 . 2 7 1']) assert.equal(acceptable(bad), '');
});

test('the gate keeps hints whose digits are separated by words', () => {
  // An ordinal is not a code, and squeezing must not manufacture a false positive.
  assert.ok(acceptable('Read the 1st, 2nd, 3rd and 4th lines from top to bottom.'));
});

test('the gate refuses a stub and keeps a real sentence', () => {
  assert.equal(acceptable('no'), '');
  assert.equal(acceptable('   '), '');
  assert.ok(acceptable('Subtract the known number from the result.'));
});

test('the gate caps a runaway', () => {
  assert.equal(acceptable('x'.repeat(5000)).length, 1000);
});

// ── the digit window, the sharpest thing the expert will ever say ────────────

test('the digit window always spans three values', () => {
  for (let d = 0; d <= 9; d++) {
    const { lo, hi } = digitWindow(d);
    assert.equal(hi - lo, 2, `digit ${d} gave a window of width ${hi - lo}`);
    assert.ok(d >= lo && d <= hi, `digit ${d} fell outside its own window ${lo}..${hi}`);
    assert.ok(lo >= 0 && hi <= 9, `window ${lo}..${hi} left the digit range`);
  }
});

test('the digit window never collapses onto the digit itself', () => {
  // The reason for the offset arithmetic: a window centred on the answer would become a
  // single value at 0 and at 9, handing over exactly the two digits a naive version of
  // this gets wrong.
  for (let d = 0; d <= 9; d++) {
    const { lo, hi } = digitWindow(d);
    assert.ok(hi - lo >= 2, `digit ${d} collapsed to ${lo}..${hi}`);
  }
});

// ── the reasoning layer ──────────────────────────────────────────────────────

test('every category produces a non-empty candidate set in all sixteen locales', () => {
  for (const { code } of languages) {
    for (const difficulty of DIFFICULTIES) {
      for (const cat of categories) {
        const level = categories.indexOf(cat) + 1;
        const ctx = ctxFor(difficulty, level, code);
        const forced = { ...ctx, puzzle: { ...ctx.puzzle, category: cat } };
        const cs = candidates(forced);
        assert.ok(cs.length > 0, `${code}/${difficulty}/${cat} produced nothing`);
        for (const c of cs) assert.ok(c.text.length > 0, `${code}/${cat} emitted an empty hint`);
      }
    }
  }
});

test('no candidate ever contains four digits in a row', () => {
  // Swept across the whole generation space rather than sampled, because this is the one
  // invariant that must hold everywhere and a sample would only suggest that it does.
  let checked = 0;
  for (const { code } of languages) {
    for (const difficulty of DIFFICULTIES) {
      for (let level = 1; level <= 30; level++) {
        for (let seed = 0; seed < 8; seed++) {
          const ctx = ctxFor(difficulty, level, code, seed);
          for (const c of candidates(ctx)) {
            checked++;
            assert.ok(!leaksCode(c.text), `${code}/${difficulty}/${level}: leaked in "${c.text}"`);
          }
        }
      }
    }
  }
  assert.ok(checked > 20000, `only swept ${checked} candidates`);
});

test('the canned hint is always available as a floor', () => {
  for (const difficulty of DIFFICULTIES) {
    for (let level = 1; level <= 30; level++) {
      const cs = candidates(ctxFor(difficulty, level));
      assert.ok(
        cs.some((c) => c.strategy === 'canned'),
        `${difficulty}/${level} had no canned fallback`,
      );
    }
  }
});

test('math narrowing is computed from the line, not copied from the answer', () => {
  // The window has to depend on the equation. The generator's PRNG has a short cycle in
  // its low bits, so consecutive seeds only produce a couple of different digits; the
  // seeds here are spread out deliberately, because sweeping seed = 0..39 would look like
  // a broken feature when it is really just the generator.
  const seen = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const ctx = ctxFor('easy', 1, 'en', seed * 7919 + 13);
    const n = candidates(ctx).find((c) => c.strategy === 'mathNarrow');
    if (n) seen.add(n.text);
  }
  assert.ok(seen.size >= 6, `expected varied narrowing, got ${seen.size}: ${[...seen].join(' | ')}`);
});

test('every digit produces a distinct enough window that the hint is not a constant', () => {
  // Directly over the ten digits, so this does not depend on the generator's PRNG at all.
  const windows = [];
  for (let d = 0; d <= 9; d++) windows.push(digitWindow(d));
  const distinct = new Set(windows.map((w) => `${w.lo}-${w.hi}`));
  assert.equal(distinct.size, 8, `only ${distinct.size} distinct windows: ${[...distinct].join(' ')}`);
});

test('a hard logic puzzle is recognised as doubling rather than as a constant gap', () => {
  // The two logic hints are opposites, so misreading the shape would give a player the
  // wrong method entirely.
  let doubling = 0;
  let constant = 0;
  for (let level = 1; level <= 30; level++) {
    const cs = candidates(ctxFor('hard', level, 'en', 1));
    if (cs.some((c) => c.strategy === 'logicDouble')) doubling++;
    if (cs.some((c) => c.strategy === 'logicGap')) constant++;
  }
  assert.ok(doubling > 0, 'no hard logic puzzle was recognised as doubling');
  assert.equal(constant, 0, 'a hard logic puzzle was misread as a constant gap');
});

// ── features and the network ──────────────────────────────────────────────────

test('the feature vector has the declared width and is finite', () => {
  for (const difficulty of DIFFICULTIES) {
    for (let level = 1; level <= 30; level++) {
      const ctx = ctxFor(difficulty, level);
      for (const c of candidates(ctx)) {
        const x = features(c, ctx);
        assert.equal(x.length, FEATURE_SIZE);
        for (const v of x) assert.ok(Number.isFinite(v), 'non-finite feature');
      }
    }
  }
});

test('the weights match the feature layout', () => {
  assert.equal(WEIGHTS.inputSize, FEATURE_SIZE, 'run: npm run train:ai');
  assert.equal(WEIGHTS.layers[0].in, FEATURE_SIZE);
  for (const l of WEIGHTS.layers) {
    assert.equal(l.w.length, l.in * l.out);
    assert.equal(l.b.length, l.out);
  }
  assert.equal(WEIGHTS.layers[WEIGHTS.layers.length - 1].out, 1, 'the output must be a scalar');
});

test('every weight is finite', () => {
  for (const l of WEIGHTS.layers) {
    for (const v of l.w) assert.ok(Number.isFinite(v));
    for (const v of l.b) assert.ok(Number.isFinite(v));
  }
});

test('the network is a trained model, not an untrained scaffold', () => {
  assert.ok(MODEL.parameters > 500, `only ${MODEL.parameters} parameters`);
  // An untrained net emits near-identical scores for everything. A trained one separates
  // candidates, and separates them differently at different levels - so this sweeps the
  // same category across the campaign rather than the whole range, which would mostly be
  // measuring the category feature.
  const scores = new Set();
  for (const level of levelsFor('math')) {
    for (const r of rank(ctxFor('hard', level))) scores.add(r.score.toFixed(4));
  }
  assert.ok(scores.size > 12, `only ${scores.size} distinct scores across ${levelsFor('math').length} math levels`);
});

test('the score responds to the level, not only to the category', () => {
  // The level feature is the one the model uses to decide how hard to lean in. If moving
  // through the campaign did not move the scores, that feature is not reaching the net.
  const first = rank(ctxFor('hard', levelsFor('math')[0], 'en', 5))[0].score;
  const last = rank(ctxFor('hard', levelsFor('math').at(-1), 'en', 5))[0].score;
  assert.ok(
    Math.abs(first - last) > 1e-4,
    `level barely moved the score: ${first} vs ${last}`,
  );
});

test('forward matches a hand-computed network', () => {
  // Guards the arithmetic in engine.ts, which everything else trusts.
  const net = network(2, [1]);
  net.layers[0].w.set([2, 3]);
  net.layers[0].b.set([1]);
  assert.ok(Math.abs(forward(net, [4, 5]) - 24) < 1e-12); // 2*4 + 3*5 + 1 = 24
});

test('sigmoid is finite at both extremes', () => {
  // The naive 1/(1+exp(-z)) overflows to Infinity for large positive z on some engines
  // and returns NaN, which would poison a whole training run rather than one example.
  for (const z of [-800, -50, 0, 50, 800]) assert.ok(Number.isFinite(sigmoid(z)), `sigmoid(${z})`);
  assert.ok(Math.abs(sigmoid(0) - 0.5) < 1e-12);
});

// ── the ranking, which is the model's actual job ──────────────────────────────

test('ranking returns candidates ordered by score', () => {
  for (let level = 1; level <= 30; level += 3) {
    const ranked = rank(ctxFor('medium', level));
    for (let i = 1; i < ranked.length; i++) {
      assert.ok(ranked[i - 1].score >= ranked[i].score, `out of order at level ${level}`);
    }
  }
});

test('a hard puzzle gets a stronger hint than an easy one', () => {
  // The central claim the model exists to make, asserted across the whole campaign rather
  // than at one level. Any single level can be a wash - late on, an easy puzzle genuinely
  // does warrant a narrowing, because the player is twenty-five levels in - so the
  // meaningful statement is that difficulty shifts the hint strength overall.
  const mean = (difficulty) => {
    const levels = levelsFor('math');
    const total = levels.reduce((n, l) => n + rank(ctxFor(difficulty, l))[0].strength, 0);
    return total / levels.length;
  };
  const easy = mean('easy');
  const hard = mean('hard');
  assert.ok(hard > easy, `hard averaged ${hard.toFixed(2)} against easy's ${easy.toFixed(2)}`);
});

test('difficulty separates the hints at the start of the campaign', () => {
  // Where the difference is sharpest, and therefore where a failure to learn the
  // difficulty interaction would show up first.
  const first = levelsFor('math')[0];
  const easy = rank(ctxFor('easy', first))[0];
  const hard = rank(ctxFor('hard', first))[0];
  assert.ok(
    hard.strength > easy.strength,
    `level ${first}: hard gave "${hard.strategy}" (${hard.strength}), easy gave "${easy.strategy}" (${easy.strength})`,
  );
});

test('an early easy puzzle is not given a narrowing', () => {
  // Over-helping a beginner costs them the puzzle. That asymmetry is the rubric's, so it
  // is worth asserting rather than trusting.
  for (const level of levelsFor('math').slice(0, 3)) {
    assert.notEqual(rank(ctxFor('easy', level))[0].strategy, 'mathNarrow', `level ${level}`);
  }
});

test('trivia is never narrowed, at any level or difficulty', () => {
  // A trivia clue is recall, not deduction, so narrowing it answers rather than tutors.
  for (const level of levelsFor('trivia')) {
    for (const difficulty of DIFFICULTIES) {
      const top = rank(ctxFor(difficulty, level, 'en', 5))[0];
      assert.ok(
        ['triviaDomain', 'canned'].includes(top.strategy),
        `${difficulty}/${level}: ${top.strategy}`,
      );
    }
  }
});

test('the hard logic hint is the doubling one and never the constant-gap one', () => {
  // The two are opposites, so a shape misread here hands the player the wrong method.
  for (const level of levelsFor('logic')) {
    for (const top of rank(ctxFor('hard', level, 'en', 3))) {
      if (top.strategy === 'logicGap') {
        assert.fail(`hard logic level ${level} was told the gap is constant`);
      }
    }
  }
});

// ── the public entry point ────────────────────────────────────────────────────

test('hintFor returns a usable hint for every category, difficulty and locale', () => {
  for (const { code } of languages) {
    for (const difficulty of DIFFICULTIES) {
      for (const cat of categories) {
        const level = categories.indexOf(cat) + 1;
        const ctx = ctxFor(difficulty, level, code);
        const forced = { ...ctx, puzzle: { ...ctx.puzzle, category: cat } };
        const hint = hintFor(forced.puzzle, difficulty, level, code, lookup(code));
        assert.ok(hint.length > 0, `${code}/${difficulty}/${cat} returned nothing`);
        assert.ok(!leaksCode(hint), `${code}/${difficulty}/${cat} leaked the code`);
      }
    }
  }
});

test('hintFor degrades instead of throwing when it cannot help', () => {
  // The stored hint is always present, so the worst case for a bug here is the hint the
  // app shipped before any of this existed, not a crash mid-puzzle.
  const puzzle = makePuzzle('easy', 1, 'en', 1);
  const broken = { ...puzzle, lines: ['not a puzzle at all'], category: 'math' };
  const out = hintFor(broken, 'easy', 1, 'en', lookup('en'));
  assert.equal(typeof out, 'string');
  assert.ok(!leaksCode(out));
});

test('hints come back in the reader language, not English', () => {
  for (const code of ['ja', 'ar', 'ru', 'hi', 'zh']) {
    const ranked = rank(ctxFor('easy', 1, code, 2));
    assert.ok(ranked.length > 0, `${code} produced nothing`);
    const nonLatin = ranked.filter((c) => /[^\x00-\x7F]/.test(c.text));
    assert.ok(nonLatin.length > 0, `${code} produced only ASCII hints`);
  }
});

test('inference is fast enough to run on a click', () => {
  const ctx = ctxFor('hard', 20, 'en', 9);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 2000; i++) rank(ctx);
  const perCallUs = Number(process.hrtime.bigint() - t0) / 2000 / 1000;
  assert.ok(perCallUs < 5000, `${perCallUs.toFixed(0)}us per ranking is too slow for a click`);
});
