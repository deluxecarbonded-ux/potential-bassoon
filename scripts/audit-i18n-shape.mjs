// Guards the shape of src/i18n.ts, which nothing else checks.
//
//   npm run audit:i18n-shape
//
// The table is a String.raw template, and a row added just after its closing backtick is
// syntactically valid TypeScript that silently does nothing: audit-table counts pipe-fields
// per line and is perfectly happy, and translate() falls back to printing the key name. The
// only thing that noticed was tsc, and only because the stray rows happened to sit between
// the template and the next declaration. A row added after that point would have compiled,
// passed every audit, and shown a player the word "aiAlways".
//
// So the three invariants that make the table work are asserted directly.
import { readFileSync } from 'node:fs';

const SRC = 'src/i18n.ts';
const LINES = readFileSync(SRC, 'utf8').split(/\r?\n/);

let problems = 0;
const fail = (msg) => { problems++; console.log(`FAIL  ${msg}`); };
const pass = (msg) => console.log(`OK    ${msg}`);

// 1. The template opens and closes exactly once.
const opens = LINES.filter((l) => /String\.raw`\s*$/.test(l)).length;
const closes = LINES.filter((l) => l.trim() === '`;').length;
if (opens !== 1) fail(`expected one String.raw opening, found ${opens}`);
else pass('the table has one opening backtick');
if (closes !== 1) fail(`expected one closing backtick, found ${closes}`);
else pass('the table has one closing backtick');

// 2. Every row is between them.
const openAt = LINES.findIndex((l) => /String\.raw`\s*$/.test(l));
const closeAt = LINES.findIndex((l) => l.trim() === '`;');
if (openAt < 0 || closeAt < 0) {
  fail('could not locate the table, so the row check cannot run');
} else {
  const inside = LINES.slice(openAt + 1, closeAt);
  const outside = [...LINES.slice(0, openAt), ...LINES.slice(closeAt + 1)];
  const isRow = (l) => /^[a-zA-Z][a-zA-Z0-9]*\|/.test(l.trim());
  const stray = outside.filter(isRow);
  if (stray.length) {
    fail(`${stray.length} row(s) sit outside the table and would be ignored: ${stray.map((l) => l.split('|')[0]).join(', ')}`);
  } else {
    pass(`all ${inside.filter(isRow).length} rows are inside the table`);
  }

  // 3. And the loop that reads them is after the table, not before.
  const readerAt = LINES.findIndex((l) => l.includes('rows.trim().split'));
  if (readerAt >= 0 && readerAt < closeAt) {
    fail('the loop that reads the table is above its closing backtick');
  } else {
    pass('the table is read after it is closed');
  }
}

// 4. Every row has seventeen fields, and the keys are unique. A duplicate key is silently
// overwritten by the later row, which is the same class of quiet failure.
const openLine = LINES.findIndex((l) => /String\.raw`\s*$/.test(l));
const rows = LINES.slice(openLine + 1, LINES.findIndex((l) => l.trim() === '`;')).filter((l) => /^[a-zA-Z][a-zA-Z0-9]*\|/.test(l.trim()));
const seen = new Map();
const dupes = [];
for (const r of rows) {
  const key = r.split('|')[0];
  if (seen.has(key)) dupes.push(key);
  seen.set(key, true);
}
if (dupes.length) fail(`duplicate keys: ${[...new Set(dupes)].join(', ')}`);
else pass(`${rows.length} keys, all unique`);

console.log(`\n${problems ? `${problems} problem(s)` : 'the table is well formed'}`);
process.exit(problems ? 1 : 0);
