// Turning whatever the free model replied with into a set of file operations.
//
// Free models are chatty. They wrap JSON in fences, prefix it with "Sure! Here's the
// change:", append a sentence afterwards, occasionally emit a trailing comma, and
// sometimes reason out loud before answering. This module is the layer that absorbs
// all of that, so the rest of the agent only ever sees a clean operation list or a
// clean refusal.
//
// Pure and dependency-free, so scripts/test-agent-plan.mjs can feed it the real replies
// the router produced during development and check that none of them can talk it into
// writing something it should not.

import type { Operation } from './guard.ts';
import { mayTouch, looksSecret } from './guard.ts';

const SYSTEM = `You are the build agent for Exotic, a browser game: a four-digit code
puzzle with a single player campaign and a two-player realtime arena. The project is
React 19 + TypeScript + Vite, styled by hand in one stylesheet, i18n through a
pipe-delimited table in src/i18n.ts, and Supabase for auth, Postgres, row level security
and three Deno edge functions.

You are given some of the project's files. Make the smallest change that does what was
asked, in the style already there. Do not rewrite a file you were not asked to change.
Do not add dependencies. Do not add a comment explaining that something was changed.

Reply with one JSON object and nothing else. No prose before or after, no markdown
fence. This exact shape:

{"summary":"one sentence on what you changed","operations":[
  {"op":"update","path":"src/App.tsx","note":"why this file","content":"the whole new file content"},
  {"op":"create","path":"src/Thing.tsx","note":"why this file","content":"the whole new file content"},
  {"op":"delete","path":"src/Gone.tsx","note":"why it is no longer needed"}
]}

"content" is the complete new content of the file, not a fragment and not a diff. Use
"update" when the file already exists and "create" when it does not. Use "delete" only
when the instruction really asks for a file to go. If the request needs no change, reply
{"summary":"...","operations":[]}.

Never write a credential, a token, a key or an environment file. Never write outside
src/, supabase/, scripts/, public/ or the named root files.`;

export { SYSTEM as PLAN_SYSTEM };

/** Pulls the first balanced JSON object out of a chatty reply. */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export type Parsed = {
  operations: Operation[];
  summary: string;
  /** Per-operation reasons an operation was dropped, keyed by its index in the reply. */
  dropped: Record<number, string>;
  /** Set when the reply could not be read at all, so the caller should try another model. */
  fatal?: string;
};

export function extractOperations(text: string): Parsed {
  const out: Parsed = { operations: [], summary: '', dropped: {} };
  if (typeof text !== 'string' || !text.trim()) { out.fatal = 'the model replied with nothing'; return out; }

  const raw = firstJsonObject(text);
  if (!raw) { out.fatal = 'no JSON object in the reply'; return out; }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A trailing comma is the one malformation common enough to be worth repairing.
    try { parsed = JSON.parse(raw.replace(/,(\s*[}\]])/g, '$1')); }
    catch { out.fatal = 'the reply was not valid JSON'; return out; }
  }

  const obj = parsed as { summary?: unknown; operations?: unknown; edits?: unknown };
  const list = Array.isArray(obj?.operations) ? obj.operations
    : Array.isArray(obj?.edits) ? obj.edits : null;
  if (!list) { out.fatal = 'the reply had no operations array'; return out; }
  out.summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 400) : '';

  (list as unknown[]).forEach((item, i) => {
    const o = item as Partial<Operation> & { action?: string; file?: string; code?: string };
    // A few models rename the fields. Accept the obvious synonyms rather than losing a
    // perfectly good patch to a schema quibble.
    const op = (o?.op ?? o?.action) as Operation['op'];
    const path = String(o?.path ?? o?.file ?? '');
    const content = typeof (o?.content ?? o?.code) === 'string' ? String(o?.content ?? o?.code) : undefined;

    if (op !== 'create' && op !== 'update' && op !== 'delete') {
      out.dropped[i] = 'unknown operation'; return;
    }
    const touch = mayTouch(path);
    if (!touch.ok) { out.dropped[i] = touch.reason; return; }
    if (op === 'delete') { out.operations.push({ op, path, note: o?.note }); return; }
    if (!content || !content.trim()) { out.dropped[i] = 'no content'; return; }
    if (Buffer.byteLength(content, 'utf8') > 262144) { out.dropped[i] = 'too large to write in one request'; return; }
    // Re-checked here as well as in review(), because this is the last point before the
    // operation is shown to a person for approval. Belt and braces on the one rule that
    // must never fail open.
    const secret = looksSecret(content);
    if (!secret.ok) { out.dropped[i] = secret.reason; return; }
    out.operations.push({ op, path, content, note: typeof o?.note === 'string' ? o.note.slice(0, 200) : undefined });
  });

  return out;
}

/**
 * Picks the files worth showing the model. Free models get a small budget, and a
 * truncated request is worse than a narrow one, so this is deliberately lossy: the
 * paths that match the instruction, plus the small set of files nearly every change
 * touches.
 */
/**
 * The spine of the project, in priority order. Nearly every change touches one of these,
 * and a patch written without them in view is plausible and wrong - so they are reserved
 * first rather than competing on keyword score with whatever else the instruction
 * happened to mention. The order is the order they build on each other: the components
 * call the state, and the state is wired up by the entry point.
 */
const SPINE = [/^src\/app\.(tsx?|ts)$/, /^src\/main\.(tsx?|ts)$/, /^src\/state\.(tsx?|ts)$/];
const spineRank = (path: string) => {
  const p = path.toLowerCase();
  const i = SPINE.findIndex((re) => re.test(p));
  return i < 0 ? Infinity : i;
};

export function selectFiles<T extends { path: string; size?: number }>(
  files: T[],
  instruction: string,
  budgetBytes = 64000,
): T[] {
  const words = instruction.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const scoreOf = (p: string) => {
    const l = p.toLowerCase();
    let score = 0;
    for (const w of words) if (l.includes(w)) score += 3;
    if (l === 'src/i18n.ts') score += 3;
    if (l === 'src/styles.css') score += 2;
    if (l.startsWith('supabase/functions/')) score += 1;
    if (l.endsWith('.md') || l.endsWith('.lock') || l.startsWith('node_modules/')) score -= 10;
    return score;
  };
  const sizeOf = (f: T) => f.size ?? 4096;

  const spine = files.filter((f) => spineRank(f.path) < Infinity)
    .sort((a, b) => spineRank(a.path) - spineRank(b.path));
  const rest = files
    .filter((f) => spineRank(f.path) === Infinity && scoreOf(f.path) >= 0)
    .sort((a, b) => scoreOf(b.path) - scoreOf(a.path) || a.path.localeCompare(b.path));

  const picked: T[] = [];
  let used = 0;
  const add = (f: T) => { picked.push(f); used += sizeOf(f); };

  // The lead file is whatever the instruction actually names, and it is always included
  // even when it alone exceeds the budget. Asking for a change to "the badge component"
  // and not showing it produces a patch to something else; and this project's main file
  // is 40KB, so a strict budget skipped it, and a model asked to change the app without
  // being shown the app invents something.
  const lead = rest[0] || spine[0];
  if (lead) add(lead);

  for (const f of [...spine, ...rest]) {
    if (f === lead) continue;
    if (used + sizeOf(f) > budgetBytes) continue;
    add(f);
  }
  // A budget smaller than one file still gets the model something to work from.
  if (!picked.length) {
    const anything = files.filter((f) => scoreOf(f.path) >= 0)[0];
    if (anything) picked.push(anything);
  }
  return picked;
}

/** Renders the picked files as the user message. */
export function renderContext(files: Array<{ path: string; content: string }>): string {
  return files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n')
    .slice(0, 60000);
}
