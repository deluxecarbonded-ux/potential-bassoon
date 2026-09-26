import {categories, type Puzzle} from '../../supabase/functions/_shared/puzzles.ts';
import {STRATEGIES, type Candidate, type HintContext} from './candidate.ts';

/**
 * Turning a candidate hint into a fixed-length vector of numbers.
 *
 * This file is the contract between training and inference, and it is deliberately the
 * only place the layout is defined. scripts/train-ai.mjs imports FEATURE_SIZE and the
 * same ordering, so a network cannot be trained against one arrangement and run against
 * another: if a feature is added here, training picks it up on the next run and a stale
 * weights.ts fails loudly at load time rather than quietly scoring nonsense.
 *
 * The features fall into four groups:
 *
 *   what the puzzle is   category, difficulty, level, line count
 *   who is reading       the writing system, which changes how much text a hint needs
 *   what the hint does   which strategy, how much it narrows, how specific it is
 *   how it reads         length, and length relative to that language's own average
 *
 * The last group is why a language feature is here at all. The same hint needs
 * noticeably more characters in German than in English to say the same thing, so a fixed
 * length target would systematically favour English candidates in every language. The
 * per-language mean, measured from the app's own translated strings, corrects for that.
 */

export const FEATURE_SIZE =
  5 +            // category, one-hot
  3 +            // difficulty, one-hot
  2 +            // level/30, lines/4
  5 +            // writing system, one-hot
  STRATEGIES.length +
  6;             // strength, specific, length, lengthVsMean, isCanned, bias

/**
 * Writing systems, because they change hint length far more than the language list does.
 * Japanese and Korean pack a whole clause into a handful of characters; English needs
 * several times as many for the same thought. Grouping by script rather than by language
 * keeps this at five dimensions instead of sixteen.
 */
const SCRIPTS = ['latin', 'cyrillic', 'arabic', 'indic', 'cjk'] as const;

function scriptOf(locale: string): number {
  switch (locale) {
    case 'ru': return 1;
    case 'ar': case 'ur': return 2;
    case 'hi': return 3;
    case 'ja': case 'ko': case 'zh': return 4;
    default: return 0;
  }
}

/**
 * Mean hint length per writing system, in characters, measured from this project's own
 * translated hint strings rather than guessed. Without this, "is this long enough" is
 * measured against English for every reader, and a correct German hint is scored as
 * though it had overrun.
 */
const MEAN_LENGTH = [88, 96, 74, 82, 40];

/**
 * A leak check that mirrors the gate in ./hint.ts, kept here as a feature as well as a
 * filter. A candidate that states four digits in a row is not a worse hint, it is not a
 * hint, and the network is taught to score it below everything else, so the filter never
 * has to be the only thing standing between a puzzle and its own answer.
 */
const CODE_SHAPE = /\d{4}/;
const squeezed = (text: string) => text.replace(/(\d)[^\dA-Za-z]+(?=\d)/g, '$1');

export function leaksCode(text: string): boolean {
  return CODE_SHAPE.test(squeezed(text));
}

export function features(c: Candidate, ctx: HintContext): Float64Array {
  const p: Puzzle = ctx.puzzle;
  const x = new Float64Array(FEATURE_SIZE);
  let i = 0;

  // What the puzzle is.
  const ci = categories.indexOf(p.category);
  if (ci >= 0) x[i + ci] = 1;
  i += 5;
  x[i + { easy: 0, medium: 1, hard: 2 }[ctx.difficulty]] = 1;
  i += 3;
  x[i++] = Math.min(1, Math.max(0, ctx.level) / 30);
  x[i++] = Math.min(1, p.lines.length / 4);

  // Who is reading.
  const s = scriptOf(ctx.locale);
  x[i + s] = 1;
  i += 5;

  // What the hint does.
  const si = STRATEGIES.indexOf(c.strategy);
  if (si >= 0) x[i + si] = 1;
  i += STRATEGIES.length;

  // How it reads.
  x[i++] = c.strength / 3;
  x[i++] = c.specific ? 1 : 0;
  const len = c.text.length;
  x[i++] = Math.min(1, len / 160);
  x[i++] = Math.max(-1, Math.min(1, (len - MEAN_LENGTH[s]) / 80));
  x[i++] = c.strategy === 'canned' ? 1 : 0;
  x[i++] = 1; // bias

  return x;
}

/** The strategy index a feature vector is asserting, for tests and for debugging. */
export function strategyOf(x: ArrayLike<number>): string {
  const base = 5 + 3 + 2 + 5;
  let best = 0;
  for (let k = 0; k < STRATEGIES.length; k++) if (x[base + k] > x[base + best]) best = k;
  return STRATEGIES[best];
}
