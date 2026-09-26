import type {Puzzle} from '../../supabase/functions/_shared/puzzles.ts';

/**
 * Recipes: the edits this project knows how to make, in the shape the apply path expects.
 *
 * A hosted model could be handed an arbitrary instruction and asked for a patch. This
 * cannot, and pretending otherwise would be the dishonest part. What it does instead is
 * hold a small library of edits it knows are correct for *this* codebase - the ones that
 * come up again and again when working on a sixteen-language game - and refuse anything
 * else by name.
 *
 * The trade is deliberate and worth stating plainly. An LLM planner would attempt anything
 * and sometimes produce a plausible patch that does not compile, and you would find out at
 * review. A recipe either finds its anchor and produces a verified edit, or returns null
 * and the planner says it does not know how to do that. Every operation here is checked
 * against the real file contents before it is offered, so an edit that would not apply is
 * never shown.
 *
 * A recipe may only return operations for files it was actually given. Every one of them
 * re-derives its edit from the file's current content rather than from a stored copy, so
 * applying a plan to a tree that has moved on produces a conflict rather than a silent
 * overwrite. The guard (supabase/functions/_shared/guard.ts) then re-checks all of it
 * before anything is written, whatever produced it.
 */

export type Op = {op: 'create' | 'update' | 'delete'; path: string; content?: string; note?: string};

export type RecipeResult = {operations: Op[]; summary: string; note?: string} | null;

export type FileMap = Map<string, string>;

export const RECIPES = ['copy', 'i18n', 'theme', 'setting'] as const;
export type Recipe = (typeof RECIPES)[number];

/** One quoted string from the instruction, which is how these requests are phrased. */
function quoted(text: string): string {
  const m = text.match(/["'“”‘’`]([^"'“”‘’`]{2,80})["'“”‘’`]/);
  return m ? m[1].trim() : '';
}

/** A camelCase identifier, which is what an i18n key or a setting is called here. */
function identifier(text: string): string {
  const m = text.match(/\b([a-z][a-zA-Z0-9]{2,30})\b/);
  return m ? m[1] : '';
}

/**
 * The i18n key a request is talking about, matched against the keys that actually exist.
 *
 * The first version of this used a regular expression hunting for a word next to the word
 * "string", which assumed the name came after it. People say both "add a pauseLabel string"
 * and "reword the footer string", so it found the key about half the time and declined the
 * rest. Asking the file which keys it has, and looking for one of them in the request, is
 * both simpler and correct: it cannot pick a name that is not a key, and it cannot be
 * defeated by word order.
 */
function existingKey(instruction: string, file: string): string {
  const keys = new Set<string>();
  for (const line of file.split('\n')) {
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9]*)\|/);
    if (m) keys.add(m[1]);
  }
  const words = instruction.toLowerCase().match(/[a-z][a-z0-9]{2,30}/g) || [];
  let best = '';
  for (const w of words) {
    for (const k of keys) {
      // Exact word, case-insensitively: onDeviceAi and ondeviceai are the same key to a
      // person typing a request, and a prefix match would confuse onDevice with
      // onDeviceAi when only the shorter one was meant.
      if (k.toLowerCase() === w && k.length > best.length) best = k;
    }
  }
  return best;
}

/**
 * The name of a thing being asked for, taken from the word in front of the noun.
 *
 * Quoted wins, because "add a theme called dusk" is unambiguous and a bare "add a dusk
 * theme" is not something a person would quote. Falls back to the word before the noun
 * rather than to a captured first word, which is what made "add a dusk theme" produce a
 * theme named "add".
 */
function nameBeforeNoun(instruction: string, nouns: string[], quotedName: string): string {
  if (quotedName) return quotedName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const words = instruction.toLowerCase().match(/[a-z][a-z0-9]*/g) || [];
  for (let i = 1; i < words.length; i++) {
    if (!nouns.includes(words[i])) continue;
    // Walk back over determiners: "a", "the", "new", "another".
    let j = i - 1;
    while (j >= 0 && ['a', 'an', 'the', 'new', 'another', 'extra', 'second', 'my', 'its'].includes(words[j])) j--;
    if (j >= 0) return words[j];
  }
  return '';
}

/**
 * Replaces the English text of an existing translation row.
 *
 * The safest edit in the library and the one most often wanted: a line of copy is wrong,
 * here is what it should say. Only the first field changes, because the other fifteen are
 * translations of it and translating them is a separate, human job. The table audit checks
 * field count and script, not whether the translations agree, so this leaves the tree
 * green - which is correct, since a stale translation is a normal state for a project with
 * sixteen locales and no translation service.
 */
export function copy(instruction: string, files: FileMap): RecipeResult {
  const text = quoted(instruction);
  if (!text) return null;
  const file = files.get('src/i18n.ts');
  if (!file) return null;

  const key = existingKey(instruction, file);
  if (!key) return null;

  const lines = file.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`${key}|`));
  if (at < 0) return null;

  const parts = lines[at].split('|');
  if (parts.length !== 17) return null; // not a translation row; refuse rather than guess
  const before = parts[1];
  if (before === text) return null; // nothing to do
  parts[1] = text;
  lines[at] = parts.join('|');

  return {
    operations: [{op: 'update', path: 'src/i18n.ts', content: lines.join('\n'), note: `reword the "${key}" string`}],
    summary: `Reword "${key}" in English`,
    note: `The other fifteen languages still carry the old wording: "${before}". They fall back to English until translated.`,
  };
}

/**
 * Adds a new translation row.
 *
 * Sixteen translations cannot be produced here, and inventing fifteen would be worse than
 * useless, so the row is added with the English sentence in every column and the note says
 * plainly what is left to do. The i18n table audit will fail on the non-Latin cells until
 * they are translated, which is the correct signal rather than a hidden one: a key that
 * shows English to a Japanese reader is a real defect, not a cosmetic one.
 */
export function i18n(instruction: string, files: FileMap): RecipeResult {
  const text = quoted(instruction);
  const file = files.get('src/i18n.ts');
  if (!file) return null;
  // A key that is already a row is a reword, not an addition, and the copy recipe owns
  // that. Handing it over here would add a duplicate key.
  const key = instruction.match(/\b(?:string|key|text|label)\s+(?:called|named)\s*([a-z][a-zA-Z0-9]{2,30})/i)?.[1]
    || (existingKey(instruction, file) ? '' : identifier(instruction));
  if (!text || !key) return null;
  if (new RegExp(`^${key}\\|`, 'm').test(file)) return null;

  const lines = file.split('\n');
  // Insert inside the table, before the closing backtick of the String.raw block.
  const closeAt = lines.findIndex((l) => l.trim() === '`;');
  if (closeAt < 0) return null;
  const row = [key, ...Array(16).fill(text)].join('|');
  lines.splice(closeAt, 0, row);

  return {
    operations: [{op: 'update', path: 'src/i18n.ts', content: lines.join('\n'), note: `add the "${key}" string`}],
    summary: `Add a "${key}" string`,
    note: 'English is filled in for all sixteen locales. Fifteen translations are still needed, and `npm run audit:table` will fail on the non-Latin cells until they are done.',
  };
}

/**
 * Adds a theme.
 *
 * Three files, because that is genuinely how a theme is added here: the union in
 * state.tsx, the default in initial, and the option in the settings panel. Each anchor is
 * checked, and if any is missing the whole recipe returns null rather than applying half a
 * theme - a theme the type does not allow is worse than no theme.
 */
export function theme(instruction: string, files: FileMap): RecipeResult {
  const name = nameBeforeNoun(instruction, ['theme', 'themes', 'scheme', 'palette', 'skin'], quoted(instruction));
  if (!name || name === 'light' || name === 'dark') return null;

  const state = files.get('src/state.tsx');
  const app = files.get('src/App.tsx');
  if (!state || !app) return null;

  const ops: Op[] = [];

  // 1. the union
  const unionOld = "theme:'light'|'dark'";
  if (!state.includes(unionOld)) return null;
  ops.push({
    op: 'update',
    path: 'src/state.tsx',
    content: state.replace(unionOld, `theme:'light'|'dark'|'${name}'`),
    note: `allow the "${name}" theme in the saved state type`,
  });

  // 2. the settings option list
  const optOld = "(['light','dark'] as const)";
  if (!app.includes(optOld)) return null;
  ops.push({
    op: 'update',
    path: 'src/App.tsx',
    content: app.replace(optOld, `(['light','dark','${name}'] as const)`),
    note: `offer the "${name}" theme in Settings`,
  });

  return {
    operations: ops,
    summary: `Add a "${name}" theme`,
    note: `The type and the settings list are updated, but nothing renders it yet: styles.css still has no rules for [data-theme="${name}"], so it will fall back to the light palette. Add those before shipping it.`,
  };
}

/**
 * Adds a boolean setting with a toggle.
 *
 * Same shape as a theme and the same refusal rule: the type, the default and the settings
 * row are one change, and half of it is a bug.
 */
export function setting(instruction: string, files: FileMap): RecipeResult {
  const key = instruction.match(/\b(?:setting|toggle|flag|option)\s+(?:called|named|for)\s*([a-z][a-zA-Z0-9]{2,30})/i)?.[1]
    || nameBeforeNoun(instruction, ['setting', 'settings', 'toggle', 'flag', 'option', 'switch'], '')
    || identifier(instruction);
  if (!key) return null;

  const state = files.get('src/state.tsx');
  const app = files.get('src/App.tsx');
  if (!state || !app) return null;

  // Refuse if the name is already taken, rather than shadowing an existing setting.
  if (new RegExp(`\\b${key}\\b`).test(state)) return null;

  const ops: Op[] = [];
  const typeOld = 'sound:boolean;motion:boolean;';
  const initOld = 'sound:false,motion:false,';
  const uiOld = "(['sound','motion'] as const)";
  if (!state.includes(typeOld) || !state.includes(initOld) || !app.includes(uiOld)) return null;

  ops.push({
    op: 'update',
    path: 'src/state.tsx',
    content: state.replace(typeOld, `sound:boolean;motion:boolean;${key}:boolean;`).replace(initOld, `sound:false,motion:false,${key}:false,`),
    note: `add "${key}" to the saved state, defaulting to off`,
  });
  ops.push({
    op: 'update',
    path: 'src/App.tsx',
    content: app.replace(uiOld, `(['sound','motion','${key}'] as const)`),
    note: `add a toggle for "${key}" in Settings`,
  });

  return {
    operations: ops,
    summary: `Add a "${key}" setting`,
    note: `The toggle renders, and the value is saved, but nothing reads state.${key} yet. Wire it to whatever it should affect.`,
  };
}

export const RECIPE_FNS: Record<Recipe, (instruction: string, files: FileMap) => RecipeResult> = {
  copy, i18n, theme, setting,
};

export type {Puzzle};
