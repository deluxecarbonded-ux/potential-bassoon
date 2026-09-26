import {forwardAll, softmax, network, type Network} from './engine.ts';
import {PLANNER_WEIGHTS} from './planner-weights.ts';
import {RECIPES, RECIPE_FNS, type FileMap, type Op, type Recipe, type RecipeResult} from './recipes.ts';

/**
 * The build agent's planner, running entirely on the reader's machine.
 *
 * This replaces a hosted model that was handed the project's files and asked for a patch.
 * The replacement is a trained intent classifier over a library of edits that are known to
 * be correct for this codebase, which is a real trade rather than an equivalent: it will
 * refuse requests a model might have attempted, and what it produces is verified against the
 * actual file contents rather than plausible. See src/ai/recipes.ts for why that is the
 * better failure mode here.
 *
 * What is trained, and what is not, stated plainly: the classifier learns from examples
 * which words in a request imply which recipe - it is a bag of words over the instruction
 * plus which of the project's files are in hand, and the weights come from
 * scripts/train-planner.mjs. The recipes themselves are hand-written, because an edit has to
 * be exactly right and "nearly right" is a file that does not compile.
 *
 * No request leaves the device, there is no key, and there is nothing to run out of.
 */

/**
 * Derived, never hard-coded.
 *
 * It was 48 once, while the vector actually filled 59 slots, and the tail was silently
 * truncated by Float64Array. What got cut was the shape block - quoted string, add versus
 * change - which is the entire difference between the copy recipe and the i18n one, so the
 * two became indistinguishable and the classifier fired on everything. Deriving it means
 * adding a word to the vocabulary cannot silently break the layout.
 */
const SHAPE_FEATURES = 5;

export type Plan = {
  summary: string;
  operations: Op[];
  /** Which recipe was chosen, and how confident the classifier was. */
  recipe: Recipe;
  confidence: number;
  /** True when nothing in the library matched, which is reported rather than guessed at. */
  unknown: boolean;
  note?: string;
  consideredFiles: string[];
  preview: {create: number; update: number; delete: number};
};

/**
 * The vocabulary the classifier was trained on. Kept as an explicit list rather than
 * derived, so that adding a word means retraining rather than silently changing what the
 * committed weights mean.
 *
 * "change", "fix", "wrong" and "instead" are here, and were not at first. They are what
 * separates re-wording an existing string from adding a new one, and without them the copy
 * and i18n recipes were the same request as far as the classifier was concerned.
 */
export const VOCAB = [
  'string', 'strings', 'text', 'copy', 'wording', 'word', 'words', 'label', 'caption',
  'translate', 'translation', 'locale', 'language', 'locales', 'i18n', 'message',
  'reword', 'rename', 'say', 'typo', 'spelling', 'change', 'fix', 'wrong', 'instead',
  'theme', 'themes', 'dark', 'light', 'palette', 'colour', 'color', 'skin', 'appearance',
  'setting', 'settings', 'toggle', 'flag', 'option', 'switch', 'preference', 'enable',
  'add', 'new', 'create', 'make', 'introduce', 'another', 'extra', 'remove', 'delete',
] as const;

/** Which of the project's files are in hand, as a bit each. */
export const PLANNER_WATCHED = [
  'src/i18n.ts', 'src/App.tsx', 'src/state.tsx', 'src/styles.css',
  'supabase/functions/_shared/puzzles.ts',
] as const;

// Declared here, after the two lists it counts, so it cannot fall into the temporal dead
// zone the way a constant near the top of the file did.
export const PLANNER_FEATURE_SIZE = VOCAB.length + PLANNER_WATCHED.length + SHAPE_FEATURES;

export function features(instruction: string, files: FileMap): Float64Array {
  const x = new Float64Array(PLANNER_FEATURE_SIZE);
  const lower = ' ' + instruction.toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';

  for (let i = 0; i < VOCAB.length; i++) {
    const w = VOCAB[i];
    if (lower.includes(' ' + w + ' ')) x[i] = 1;
    // A word repeated is a stronger signal than a word mentioned once.
    if (w.length > 3) {
      const hits = lower.split(' ' + w + ' ').length - 1;
      if (hits > 1) x[i] = Math.min(2, hits);
    }
  }
  const base = VOCAB.length;

  for (let i = 0; i < PLANNER_WATCHED.length; i++) {
    x[base + i] = files.has(PLANNER_WATCHED[i]) ? 1 : 0;
  }
  const fbase = base + PLANNER_WATCHED.length;

  // Shape of the request, which the vocabulary alone does not carry: a quoted string means
  // the person already knows what the text should say, which is the difference between the
  // copy recipe and the i18n one.
  x[fbase] = /["'“”‘’`]/.test(instruction) ? 1 : 0;
  x[fbase + 1] = Math.min(1, instruction.trim().split(/\s+/).length / 20);
  x[fbase + 2] = /\b(change|instead|should (be|say)|wrong|typo|fix)\b/.test(lower) ? 1 : 0;
  x[fbase + 3] = /\b(add|new|create|introduce|another)\b/.test(lower) ? 1 : 0;
  x[fbase + 4] = 1; // bias
  return x;
}

/**
 * One network with one output per recipe, so the four compete.
 *
 * The first version here was a separate binary network per recipe, which does not work and
 * could not have: "add a new string" and "change the string text" share almost all of their
 * vocabulary, so each binary network saw its own evidence, neither learned to defer, and
 * every one of them fired on everything. A single set of logits forces the comparison.
 */
function probs(x: Float64Array): Float64Array {
  return softmax(forwardAll(PLANNER_WEIGHTS, x));
}

/** Every recipe's probability, highest first. The rejection class is not a recipe. */
export function classify(instruction: string, files: FileMap): {recipe: Recipe; confidence: number}[] {
  const p = probs(features(instruction, files));
  return RECIPES
    .map((recipe, i) => ({recipe, confidence: p[i]}))
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * How strongly the network believes this is none of the four.
 *
 * Read from the network rather than inferred from the best recipe's score, because with
 * four competing outputs the recipes share probability mass: a confident "copy" at 0.55
 * because i18n took 0.30 is a different situation from a lone 0.55, and only the rejection
 * output distinguishes them.
 */
export function rejection(instruction: string, files: FileMap): number {
  return probs(features(instruction, files))[RECIPES.length];
}

/**
 * Two thresholds, because there are two different mistakes.
 *
 * REJECT above this and the network's own "none of these" output wins, so the planner says
 * plainly that this is not something it knows how to do. CONFIDENT is the floor for
 * attempting a recipe at all, and is lower: a request can be 40% copy with 45% rejection
 * and still be worth attempting, because the recipe re-checks its own anchors against the
 * real file and returns nothing if they are not there. A wrong recipe costs a sentence; a
 * wrong edit costs a broken file.
 */
const REJECT = 0.5;
const CONFIDENT = 0.2;

/**
 * Plans an edit, or explains that it cannot.
 *
 * The top recipe is tried first, and if its anchors are not in the files it was given it
 * falls through to the next one, so a request that names a theme but was handed no App.tsx
 * does not come back empty-handed. Only when every recipe has declined does this report
 * `unknown`, which the UI shows as a plain sentence rather than as an error.
 */
export function plan(instruction: string, fileList: Array<{path: string; content: string}>): Plan {
  const files: FileMap = new Map(fileList.map((f) => [f.path, f.content]));
  const considered = fileList.map((f) => f.path);
  const empty = {create: 0, update: 0, delete: 0};

  const base = {consideredFiles: considered, preview: empty};
  const text = instruction.trim();
  if (text.length < 4) {
    return {...base, summary: '', operations: [], recipe: RECIPES[0], confidence: 0, unknown: true};
  }

  const ranked = classify(text, files);
  const rejected = rejection(text, files);
  for (const {recipe, confidence} of ranked) {
    if (rejected >= REJECT) break;
    if (confidence < CONFIDENT) break;
    let result: RecipeResult = null;
    try {
      result = RECIPE_FNS[recipe](text, files);
    } catch {
      result = null;
    }
    if (!result || !result.operations.length) continue;
    return {
      ...base,
      summary: result.summary,
      operations: result.operations,
      note: result.note,
      recipe,
      confidence,
      unknown: false,
      preview: {
        create: result.operations.filter((o) => o.op === 'create').length,
        update: result.operations.filter((o) => o.op === 'update').length,
        delete: result.operations.filter((o) => o.op === 'delete').length,
      },
    };
  }

  return {
    ...base,
    summary: '',
    operations: [],
    recipe: ranked[0].recipe,
    confidence: ranked[0].confidence,
    unknown: true,
  };
}

export {RECIPES, RECIPE_FNS};
export type {FileMap, Op, Plan as PlannedOps, Recipe, RecipeResult};
export {network};
