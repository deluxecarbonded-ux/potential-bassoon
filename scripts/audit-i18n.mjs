// Cross-checks translation keys: every t('x') used in the app must exist in the table
// (otherwise the UI renders the raw key), and reports table entries nothing references.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const i18n = readFileSync('src/i18n.ts', 'utf8');
const puzzles = readFileSync('supabase/functions/_shared/puzzles.ts', 'utf8');

// Every source file that can call t(). Derived from the directory rather than listed, so
// a component added today is covered today.
//
// This used to be a hardcoded list of three files, and that fails open: a new component's
// keys were missing from the table, the UI rendered the raw key, and this script reported
// nothing wrong. That is exactly what happened with the build agent panel.
const SOURCES = [
  ...readdirSync('src').filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => join('src', f)),
  'supabase/functions/_shared/puzzles.ts',
];

const tableKeys = new Set();
for (const line of i18n.split('\n')) {
  // Only the table body is pipe-delimited data; skip code lines, which never are.
  if (!line.includes('|')) continue;
  // Skip code lines, but require whitespace after the keyword so a legitimate table
  // row that happens to begin with "export|" is not discarded.
  if (/^\s*(export|import|const|function|let|type|declare)\s+[A-Za-z_{[]/.test(line)) continue;
  if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
  const key = line.split('|')[0].trim();
  if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) tableKeys.add(key);
}

const used = new Map();
for (const name of SOURCES) {
  const src = readFileSync(name, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(name);
  }
  // t(cond?'a':'b') and t(a==='x'?'y':'z')
  for (const m of src.matchAll(/\bt\([^)]*?\?\s*['"]([a-zA-Z0-9_]+)['"]\s*:\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
    for (const k of [m[1], m[2]]) {
      if (!used.has(k)) used.set(k, new Set());
      used.get(k).add(name);
    }
  }
  // t(mode==='solo'?'completed':'wins') style with . after
  // A ternary inside a t() call, including the t(mode==='x'?'a':'b') form. Anchored on
  // t( so it cannot pick up an unrelated conditional - cn2('card', ok?'on':'dead') is a
  // class name, not a translation key, and reading it as one produced four phantom
  // "missing" keys the first time this was widened to the whole src directory.
  for (const m of src.matchAll(/\bt\([^)]*?\?\s*['"]([a-zA-Z0-9_]+)['"]\s*:\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
    for (const k of [m[1], m[2]]) {
      if (!used.has(k)) used.set(k, new Set());
      used.get(k).add(name);
    }
  }
}

const missing = [...used.keys()].filter((k) => !tableKeys.has(k)).sort();
const unused = [...tableKeys].filter((k) => !used.has(k) && !k.startsWith('digit')).sort();

console.log(`table keys: ${tableKeys.size}   referenced: ${used.size}`);
console.log(`\nMISSING from table (would render the raw key): ${missing.length}`);
missing.forEach((k) => console.log(`  ${k.padEnd(22)} used in ${[...used.get(k)].join(', ')}`));
console.log(`\nDefined but never referenced: ${unused.length}`);
unused.forEach((k) => console.log('  ' + k));
