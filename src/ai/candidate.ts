import type {Category, Difficulty, Puzzle} from '../../supabase/functions/_shared/puzzles.ts';

/**
 * One way of hinting at a puzzle, before the model has chosen between them.
 *
 * The reasoning layer produces several of these for every puzzle and the trained network
 * picks one. They are not all equally good: a direction ("work backwards from the result")
 * helps a stuck player, a narrowing ("the first digit is 3 or less") helps a player who has
 * been going in circles, and the puzzle's own canned hint is the safe floor that is never
 * wrong and never specific. Choosing between them per puzzle, per difficulty and per
 * language is a ranking problem, and that is what the network is for.
 */

/** How much of the puzzle a hint resolves. Higher narrows the answer space more. */
export type Strength = 0 | 1 | 2 | 3;

export type Strategy =
  /** The puzzle's own stored hint. Always correct, never specific, in every language. */
  | 'canned'
  /** Which operation to undo first, worked out from the shape of the line. */
  | 'mathUndo'
  /** Only the final digit of an intermediate result is wanted. */
  | 'mathUnits'
  /** A bounded range for one digit, computed from the line. Never the digit itself. */
  | 'mathNarrow'
  /** The repeated difference in a sequence, described rather than given. */
  | 'logicGap'
  /** Hard logic only: the sequence is doubling, not adding. */
  | 'logicDouble'
  /** The order of operations in the riddle line. */
  | 'riddleOrder'
  /** Leading zeroes are part of the answer. */
  | 'riddlePad'
  /** The formula, named. */
  | 'scienceFormula'
  /** The domain the clues live in, without any clue's answer. */
  | 'triviaDomain';

export const STRATEGIES: Strategy[] = [
  'canned', 'mathUndo', 'mathUnits', 'mathNarrow', 'logicGap', 'logicDouble',
  'riddleOrder', 'riddlePad', 'scienceFormula', 'triviaDomain',
];

export type Candidate = {
  strategy: Strategy;
  /** The rendered hint, already in the reader's language. */
  text: string;
  strength: Strength;
  /**
   * Whether this hint was computed from *this* puzzle rather than being a sentence that
   * would fit any puzzle in the category. A specific hint is worth more than a generic
   * one of the same strength, and only the reasoning layer knows which is which.
   */
  specific: boolean;
};

/** Everything the feature extractor is allowed to look at. */
export type HintContext = {
  puzzle: Puzzle;
  difficulty: Difficulty;
  /**
   * The campaign level, 1 to 30, passed in rather than recovered from the puzzle.
   *
   * An earlier version read it out of the first number in the first line, which is wrong
   * in a way that is easy to miss: a math line starts with an addend of three or four, a
   * riddle line starts with a four-digit number, and a trivia line may start with a
   * translated noun containing no digits at all. The feature was therefore saturating for
   * riddles, near zero for math, and absent for trivia - and the model dutifully learned
   * from it. The number the game already knows is the number to use.
   */
  level: number;
  locale: string;
  /** i18n lookup, injected so this module stays free of any import cycle. */
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export type {Category, Difficulty, Puzzle};
