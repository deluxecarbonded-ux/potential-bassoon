import {forward, scratchSpace, type Network} from './engine.ts';
import {WEIGHTS} from './weights.ts';
import {features, FEATURE_SIZE, leaksCode} from './features.ts';
import {candidates} from './expert.ts';
import type {Candidate, HintContext, Strength, Strategy} from './candidate.ts';
import type {Difficulty, Puzzle} from '../../supabase/functions/_shared/puzzles.ts';

/**
 * The AI, in full.
 *
 * A hint is produced in three steps and all three run on the reader's device, in
 * microseconds, with nothing fetched and nothing switched on:
 *
 *   1. expert.ts  works out what is actually true about this puzzle, and writes down every
 *                 hint that would be correct. It evaluates the equations, so it cannot
 *                 get one wrong, and it is forbidden by construction from naming a digit
 *                 of the code.
 *   2. features.ts describes each of those hints as numbers.
 *   3. this file  runs the trained network over those numbers and shows the highest.
 *
 * What the network contributes is the choice. Which of several correct hints to show
 * depends on how hard the puzzle is, how far through the campaign the player is, which
 * category it is, and how long a hint needs to be in their language - and those factors
 * pull against each other. A narrowing that unblocks a level 30 hard puzzle is the thing
 * that ruins a level 1 easy one, and a hint that reads well in English is too long in
 * German and too short in Japanese. The rubric that decides this is written out in
 * scripts/train-ai.mjs; the network is the learned shape of it, and weights.ts is the
 * result. The whole model is about twelve kilobytes of committed numbers.
 *
 * There is no request, no key, no quota, no download and no accelerator. That is the
 * entire point: a hosted model is limited by someone else's allowance, and a downloaded
 * one by the reader's disk, their GPU and whether their browser has WebGPU. Arithmetic is
 * limited by nothing.
 */

// A stale weights.ts against a changed feature layout would score confident nonsense, so
// the check is a hard failure at import rather than a subtly wrong hint at runtime.
if (WEIGHTS.inputSize !== FEATURE_SIZE) {
  throw new Error(
    `ai: weights expect ${WEIGHTS.inputSize} features but features.ts produces ${FEATURE_SIZE}. ` +
    'Run: npm run train:ai',
  );
}

export const MODEL = {
  name: 'Exotic Hint Ranker',
  parameters: WEIGHTS.layers.reduce((n, l) => n + l.w.length + l.b.length, 0),
  layers: WEIGHTS.layers.map((l) => `${l.in}→${l.out}`).join(', '),
  features: FEATURE_SIZE,
  /** Bytes of committed weights. Read from the source at build time by scripts/test-ai. */
  trained: true,
} as const;

/**
 * Four digits in a row is the code, not a hint.
 *
 * Checked against a squeezed copy of the text, not the text itself. "0 4 2 7 1" is the
 * same four digits as "04271", and the naive check waves that straight through, so
 * separator runs sitting between two digits are removed first - but only those, and only
 * when they are pure punctuation or space, so a letter still breaks the chain and an
 * honest hint mentioning "the 1st, 2nd, 3rd and 4th lines" keeps its digits.
 *
 * Deliberately answer-agnostic: it never looks at the real code, so it holds on the
 * signed-in path too, where the client is not supposed to know the answer.
 */
const CODE_SHAPE = /\d{4}/;
const squeezed = (text: string) => text.replace(/(\d)[^\dA-Za-z]+(?=\d)/g, '$1');

export function acceptable(hint: string): string {
  if (!hint || CODE_SHAPE.test(squeezed(hint))) return '';
  if (hint.length < 12) return '';
  return hint.slice(0, 1000);
}

/** One candidate, with the score the network gave it. */
export type Scored = Candidate & { score: number };

/**
 * Every candidate with its score, highest first.
 *
 * Exposed rather than only the winner so the tests can assert on the ordering, and so a
 * future "give me a different hint" control has something to work with. Ties break toward
 * the earlier candidate, which is the canned hint first in the expert's output: when the
 * network cannot separate two options, the safe one wins.
 */
export function rank(ctx: HintContext): Scored[] {
  const pool = candidates(ctx).filter((c) => acceptable(c.text));
  if (!pool.length) return [];
  const scratch = scratchSpace();
  return pool
    .map((c) => ({...c, score: forward(WEIGHTS as Network, features(c, ctx), scratch)}))
    .sort((a, b) => b.score - a.score);
}

/**
 * The hint to show, or '' if nothing survived.
 *
 * Returns '' rather than throwing, so a caller can fall back to the puzzle's stored hint
 * without a try/catch. That fallback matters: this runs on a player mid-puzzle, and the
 * stored hint is already correct in their language, so the worst case for a bug here is
 * the hint the app shipped before any of this existed.
 */
export function hintFor(
  puzzle: Puzzle,
  difficulty: Difficulty,
  level: number,
  locale: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  try {
    const best = rank({puzzle, difficulty, level, locale, t})[0];
    return best ? acceptable(best.text) : '';
  } catch {
    return '';
  }
}

export type {Candidate, HintContext, Strength, Strategy};
export {leaksCode, candidates, FEATURE_SIZE};
