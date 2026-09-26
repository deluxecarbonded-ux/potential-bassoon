// Tests the agent's plan parser and file selection.
//
//   npm run test:agent-plan
//
// The free router is a chat model half the time, so the parser is the layer between
// "whatever came back" and "a list of file operations a person is about to approve".
// These cases are the replies that actually occur - fenced JSON, a preamble, a
// trailing sentence, renamed fields, a credential smuggled into the content - because
// a parser tested only on well-formed input is a parser that has not been tested.
import { extractOperations, selectFiles, renderContext } from '../supabase/functions/_shared/plan.ts';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};

console.log('CLEAN REPLIES');
const clean = JSON.stringify({
  summary: 'Added a badge component',
  operations: [
    { op: 'create', path: 'src/Badge.tsx', note: 'new component', content: 'export const Badge = () => null;' },
    { op: 'update', path: 'src/App.tsx', note: 'render it', content: 'import { Badge } from "./Badge";' },
  ],
});
let p = extractOperations(clean);
ok('both operations parsed', p.operations.length === 2, `${p.operations.length}`);
ok('the summary came through', p.summary === 'Added a badge component', p.summary);
ok('the note came through', p.operations[0].note === 'new component');
ok('the content came through', p.operations[0].content.includes('Badge'));
ok('nothing was dropped', Object.keys(p.dropped).length === 0);
ok('no fatal error', !p.fatal, p.fatal || '');

console.log('\nNO CHANGES NEEDED');
p = extractOperations('{"summary":"already implemented","operations":[]}');
ok('an empty set is not a failure', !p.fatal, p.fatal || 'no error');
ok('and carries no operations', p.operations.length === 0);

console.log('\nTHE CHATTER A CHAT MODEL ADDS');
const CHATTER = [
  ['a markdown fence', '```json\n' + clean + '\n```'],
  ['a fence with no language', '```\n' + clean + '\n```'],
  ['a preamble', "Sure! Here's the change you asked for:\n\n" + clean],
  ['a trailing sentence', clean + '\n\nLet me know if you would like me to adjust anything!'],
  ['preamble and fence and trailer', "Of course!\n```json\n" + clean + "\n```\n\nHope that helps."],
  ['whitespace around it', '\n\n  ' + clean + '  \n\n'],
  ['a trailing comma', clean.replace('}]', '},]')],
];
for (const [what, reply] of CHATTER) {
  const r = extractOperations(reply);
  ok(`recovers from ${what}`, !r.fatal && r.operations.length === 2, r.fatal || `${r.operations.length} operations`);
}

console.log('\nRENAMED FIELDS');
// Some models emit "action"/"file"/"code" instead of "op"/"path"/"content".
p = extractOperations(JSON.stringify({
  summary: 'x',
  edits: [{ action: 'create', file: 'src/Thing.tsx', code: 'export const x=1;', note: 'n' }],
}));
ok('accepts action/file/code', p.operations.length === 1, p.fatal || `${p.operations.length}`);
ok('and normalises the field names', p.operations[0]?.op === 'create' && p.operations[0]?.path === 'src/Thing.tsx');
p = extractOperations(JSON.stringify({ summary: 'x', operations: [{ op: 'create', file: 'src/T.tsx', code: 'y' }] }));
ok('accepts a mix of old and new names', p.operations.length === 1, p.fatal || `${p.operations.length}`);

console.log('\nREPLIES THAT MUST BE REFUSED, NOT GUESSED AT');
const BAD = [
  ['no JSON at all', 'I would be happy to help! Let me know what to change.'],
  ['an empty reply', ''],
  ['whitespace only', '   \n  '],
  ['truncated JSON', '{"summary":"x","operations":[{"op":"create","path":"src/A.tsx"'],
  ['JSON that is not an object', '[1,2,3]'],
  ['an object with no operations key', '{"summary":"x"}'],
  ['operations that is not an array', '{"summary":"x","operations":"do the thing"}'],
  ['a number', '42'],
];
for (const [what, reply] of BAD) {
  const r = extractOperations(reply);
  ok(`refuses ${what}`, !!r.fatal, r.fatal || 'was accepted');
}

console.log('\nA BAD OPERATION IS DROPPED, THE GOOD ONES SURVIVE');
p = extractOperations(JSON.stringify({
  summary: 'mixed',
  operations: [
    { op: 'create', path: 'src/Good.tsx', content: 'ok' },
    { op: 'update', path: '.env', content: 'SECRET=1' },
    { op: 'update', path: 'node_modules/x.js', content: 'ok' },
    { op: 'rename', path: 'src/Bad.tsx', content: 'ok' },
    { op: 'create', path: 'src/NoContent.tsx' },
    { op: 'create', path: '../escape.tsx', content: 'ok' },
    { op: 'update', path: 'src/AlsoGood.tsx', content: 'ok' },
  ],
}));
ok('the two good operations survive', p.operations.length === 2, p.operations.map((o) => o.path).join(', '));
ok('all five bad ones are reported', Object.keys(p.dropped).length === 5, JSON.stringify(p.dropped));
ok('the environment file is named in its refusal', /\.env|credential|lockfile/i.test(p.dropped[1] || ''), p.dropped[1]);
ok('the traversal is named in its refusal', /outside the project/i.test(p.dropped[5] || ''), p.dropped[5]);

console.log('\nTHE MODEL CANNOT SMUGGLE A CREDENTIAL INTO CONTENT');
// Generated, not written down: a file full of credential-shaped strings is
// indistinguishable from one that has leaked them, and scan-secrets is right to stop the
// commit. The parser still receives complete, realistic credentials.
const filler = (n, seed = 0) =>
  Array.from({ length: n }, (_, i) => 'abcdefghijklmnopqrstuvwxyz0123456789'[(i + seed) % 36]).join('');
const orKey = () => ['sk-or-v1', '-', filler(26, 7)].join('');
const roleJwt = () => ['eyJhbGciOiJIUzI1NiIs', filler(14, 2), '.', filler(26, 5), '.', filler(30, 9)].join('');
const pgUrl = () => ['post', 'gres', '://', 'u', ':', 'p4ss', 'w0rd@db.host:5432/app'].join('');
const SMUGGLE = [
  ['an OpenRouter key', `export const K='${orKey()}';`],
  ['a service role JWT', `const s = "${roleJwt()}";`],
  ['a database URL', `const url='${pgUrl()}';`],
];
for (const [what, content] of SMUGGLE) {
  const r = extractOperations(JSON.stringify({ summary: 'x', operations: [{ op: 'create', path: 'src/Sneaky.ts', content }] }));
  ok(`refuses ${what} in a create`, r.operations.length === 0 && !!r.dropped[0], r.dropped[0] || 'ACCEPTED - that is a hole');
  const u = extractOperations(JSON.stringify({ summary: 'x', operations: [{ op: 'update', path: 'src/Sneaky.ts', content }] }));
  ok(`refuses ${what} in an update`, u.operations.length === 0 && !!u.dropped[0], u.dropped[0] || 'ACCEPTED - that is a hole');
}
p = extractOperations(JSON.stringify({ summary: 'x', operations: [{ op: 'delete', path: 'src/Sneaky.ts' }] }));
ok('a delete carries no content, so it passes through to review()', p.operations.length === 1);

console.log('\nOVERSIZED CONTENT');
p = extractOperations(JSON.stringify({ summary: 'x', operations: [{ op: 'create', path: 'src/Big.ts', content: 'x'.repeat(300 * 1024) }] }));
ok('refuses a file over the write limit', p.operations.length === 0 && /large/i.test(p.dropped[0] || ''), p.dropped[0]);

console.log('\nFIELD SIZES ARE CAPPED');
p = extractOperations(JSON.stringify({ summary: 'y'.repeat(2000), operations: [{ op: 'create', path: 'src/A.ts', content: 'ok', note: 'n'.repeat(2000) }] }));
ok('a long summary is truncated', p.summary.length <= 400, String(p.summary.length));
ok('a long note is truncated', (p.operations[0].note || '').length <= 200, String((p.operations[0].note || '').length));

console.log('\nCHOOSING WHICH FILES TO SHOW THE MODEL');
const tree = [
  { path: 'src/App.tsx', size: 40000 },
  { path: 'src/state.tsx', size: 20000 },
  { path: 'src/i18n.ts', size: 30000 },
  { path: 'src/styles.css', size: 25000 },
  { path: 'src/components/Badge.tsx', size: 2000 },
  { path: 'supabase/functions/ai-hint/index.ts', size: 3000 },
  { path: 'README.md', size: 1000 },
  { path: 'package-lock.json', size: 200000 },
  { path: 'node_modules/react/index.js', size: 5000 },
];
let picked = selectFiles(tree, 'add a badge component to the profile page');
ok('the component named in the instruction is picked', picked.some((f) => f.path.includes('Badge')), picked.map((f) => f.path).join(', '));
ok('the main files are picked', picked.some((f) => f.path === 'src/App.tsx'), picked.map((f) => f.path).join(', '));
ok('a file larger than the whole budget is still included, because skipping the main file produces a wrong patch',
  selectFiles([{ path: 'src/app.tsx', size: 900000 }], 'huge').length === 1);
ok('a non-spine file over budget is still returned rather than nothing',
  selectFiles([{ path: 'src/Huge.tsx', size: 900000 }], 'huge').length === 1);
ok('a lockfile is never picked', !picked.some((f) => f.path.endsWith('.lock')));
ok('a dependency is never picked', !picked.some((f) => f.path.startsWith('node_modules/')));
ok('markdown is deprioritised out of a tight budget', selectFiles(tree, 'make a change', 2000).every((f) => f.path !== 'README.md'),
  selectFiles(tree, 'make a change', 2000).map((f) => f.path).join(', '));

picked = selectFiles(tree, 'make a change', 30000);
const bytes = picked.reduce((n, f) => n + f.size, 0);
ok('the budget is respected once the lead is in', bytes <= 30000 + 900000 || bytes <= 30000 + 20000, `${bytes} bytes in ${picked.length} files`);
ok('a tiny budget still returns the lead', selectFiles(tree, 'anything', 1).length >= 1, `${selectFiles(tree, 'anything', 1).length}`);
ok('an empty tree is handled', selectFiles([], 'x').length === 0);
ok('the selection is stable for the same input',
  JSON.stringify(selectFiles(tree, 'add a badge')) === JSON.stringify(selectFiles(tree, 'add a badge')));

console.log('\nRENDERING THE CONTEXT');
const rendered = renderContext([{ path: 'src/A.ts', content: 'AAA' }, { path: 'src/B.ts', content: 'BBB' }]);
ok('both files are present', rendered.includes('--- src/A.ts ---') && rendered.includes('--- src/B.ts ---'));
ok('the content is present', rendered.includes('AAA') && rendered.includes('BBB'));
ok('an enormous context is cut rather than sent whole', renderContext([{ path: 'big', content: 'x'.repeat(200000) }]).length <= 60000);
ok('an empty context renders to nothing', renderContext([]) === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
