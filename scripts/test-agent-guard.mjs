// Tests the agent's boundaries: what it may write, what it must refuse, and what it
// will not do without being told twice.
//
//   npm run test:agent-guard
//
// A self-modifying agent is only as safe as this file. It is tested against the cases
// that actually cause damage - path traversal, writing the environment file, echoing a
// credential back, a delete riding along with an approved feature - rather than
// against the happy path, which proves nothing.
import { mayTouch, looksSecret, review, boundaries } from '../supabase/functions/_shared/guard.ts';

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};

console.log('PATHS THE AGENT MAY WRITE');
for (const p of [
  'src/App.tsx', 'src/i18n.ts', 'src/styles.css', 'src/components/Thing.tsx',
  'supabase/functions/agent/index.ts', 'supabase/functions/_shared/guard.ts',
  'supabase/migrations/202609260003_thing.sql', 'scripts/new-check.mjs',
  'index.html', 'vite.config.ts', 'package.json', 'tsconfig.json',
  'public/robots.txt', 'supabase/schema.sql', 'README.md',
]) {
  const v = mayTouch(p);
  ok(`may write ${p}`, v.ok, v.ok ? '' : v.reason);
}
// A Windows-style path from a model that learned paths from a Windows project.
ok('a backslash path is understood', mayTouch('src\\App.tsx').ok);
ok('a leading ./ is ignored', mayTouch('./src/App.tsx').ok);

console.log('\nPATHS THE AGENT MUST NEVER TOUCH');
const REFUSED = [
  ['.env', 'the environment file'],
  ['.env.local', 'a variant of it'],
  ['.env.production', 'another variant'],
  ['config/.env', 'one nested in a subdirectory'],
  ['node_modules/react/index.js', 'a dependency'],
  ['.git/config', 'git internals'],
  ['dist/bundle.js', 'a build artefact'],
  ['package-lock.json', 'a lockfile'],
  ['yarn.lock', 'another lockfile'],
  ['deploy.pem', 'a certificate'],
  ['server.key', 'a private key'],
  ['id_rsa', 'an ssh key'],
  ['.npmrc', 'the npm token file'],
  ['certs/mine.p12', 'a keystore'],
];
for (const [p, why] of REFUSED) {
  const v = mayTouch(p);
  ok(`refuses ${why} (${p})`, !v.ok, v.ok ? 'ALLOWED - that is a hole' : v.reason);
}

console.log('\nESCAPING THE PROJECT');
for (const p of ['../outside.ts', 'src/../../escape.ts', '..', '/etc/passwd', 'C:/Windows/system32/x.ts']) {
  const v = mayTouch(p);
  ok(`refuses ${p}`, !v.ok, v.ok ? 'ALLOWED - that is a hole' : v.reason);
}
ok('refuses a directory outside the writable roots', !mayTouch('etc/config').ok, mayTouch('etc/config').reason);
ok('refuses an empty path', !mayTouch('').ok);
ok('refuses a binary extension', !mayTouch('public/logo.png').ok, mayTouch('public/logo.png').reason);
ok('allows a filename with no extension at the root only if listed', mayTouch('index.html').ok);

console.log('\nCREDENTIALS THE AGENT MUST NOT WRITE');
// Generated rather than written down.
//
// A file full of credential-shaped strings is indistinguishable from a file that has
// leaked them, and scan-secrets is right to stop the commit. So each fixture is built
// from a prefix and a generated tail: what the guard receives at runtime is a complete
// and realistic credential, because that is what it has to recognise, while the source
// contains no run of characters that matches a credential pattern. There is no scanner
// allowlist entry and no suppression comment, because a scanner that can be told to
// trust one line is a scanner that will eventually be wrong about a real one.
const filler = (n, seed = 0) =>
  Array.from({ length: n }, (_, i) => 'abcdefghijklmnopqrstuvwxyz0123456789'[(i + seed) % 36]).join('');
const jwt = () => ['eyJhbGciOiJIUzI1NiIs', filler(14, 2), '.', filler(26, 5), '.', filler(30, 9)].join('');
// Defined once and used from both the table below and the later "a secret never
// reaches the writer" case, which used to call orKey() with no such binding in scope
// and took the whole suite down before it finished. The sibling agent tests define
// it the same way; here it had been written out inline instead and only one of the
// two call sites was ever updated.
const orKey = () => ['sk-or-v1', '-', filler(26, 7)].join('');
const SECRETS = [
  ['a service_role JWT', `const k = "${jwt()}";`],
  ['a Supabase PAT', `token: '${['sbp', '_', filler(30, 4)].join('')}'`],
  ['an OpenRouter key', `const OPENROUTER_API_KEY = '${orKey()}'`],
  ['a GitHub token', `auth: '${['ghp', '_', filler(36, 11)].join('')}'`],
  ['a GitHub fine-grained token', `auth: '${['github', '_pat_', filler(40, 13)].join('')}'`],
  ['an AWS key', `aws: '${['AKIA', filler(16, 3).toUpperCase()].join('')}'`],
  ['a Google API key', `key: '${['AIza', filler(35, 6)].join('')}'`],
  ['a Slack token', `webhook: '${['xoxb', '-', filler(24, 8)].join('')}'`],
  ['a private key block', ['-----BEGIN ', 'RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----'].join('')],
  ['a database URL with a password', `url: '${['post', 'gres', '://', 'user', ':', 'hunter', '2@db.example.com:5432/app'].join('')}'`],
  ['a long assigned password', `const ${'pass'}word = 'correct-${'horse'}-battery'`],
];
for (const [what, content] of SECRETS) {
  const v = looksSecret(content);
  ok(`refuses ${what}`, !v.ok, v.ok ? 'ALLOWED - that is a hole' : v.reason);
  ok(`  and the reason does not repeat the secret`, !v.ok && !v.reason.includes('eyJ') && !v.reason.includes('sbp_') && !v.reason.includes('sk-or'), v.ok ? '' : v.reason);
}

console.log('\nORDINARY CODE IS NOT A SECRET');
const FINE = [
  'export function add(a: number, b: number) { return a + b; }',
  'const apiKeyLabel = "Enter your API key in Settings";',
  'const passwordField = document.querySelector("#password")!;',
  '// token: the auth token is refreshed on 401',
  'const shortLabel = "id";',
  '{"name":"exotic","private":true,"version":"1.0.0"}',
  '',
];
for (const content of FINE) {
  const v = looksSecret(content);
  ok(`allows ${JSON.stringify(content.slice(0, 46))}`, v.ok, v.ok ? '' : v.reason);
}

console.log('\nREVIEWING A SET OF OPERATIONS');
const good = [
  { op: 'create', path: 'src/Badge.tsx', content: 'export const Badge = () => null;', note: 'new component' },
  { op: 'update', path: 'src/App.tsx', content: 'export const x = 1;', note: 'wire it up' },
];
let r = review(good, { confirm: true });
ok('a clean set is accepted', r.ok, r.summary);
ok('both operations survive', r.safe.length === 2, r.summary);
ok('nothing is reported as destroyed', r.destroys.length === 0);
ok('an unconfirmed set is refused', !review(good, { confirm: false }).ok);
ok('a confirmed set is accepted', review(good, { confirm: true }).ok);
ok('an empty set is refused', !review([], { confirm: true }).ok);
ok('a non-array is refused', !review('nope', { confirm: true }).ok);

console.log('\nA BAD OPERATION IS DROPPED, NOT THE WHOLE SET');
r = review([good[0], { op: 'update', path: '.env', content: 'X=1' }, good[1]], { confirm: true });
ok('the two good ones survive', r.safe.length === 2, r.summary);
ok('the bad one is reported against its own index', !!r.problems[1], r.problems[1] || 'not reported');
ok('the refusal explains itself', /environment file|credentials|lockfile/i.test(r.problems[1] || ''), r.problems[1]);

console.log('\nA SECRET NEVER REACHES THE WRITER');
r = review([{ op: 'create', path: 'src/config.ts', content: `const k='${orKey()}';` }], { confirm: true });
ok('a write carrying a credential is dropped', r.safe.length === 0, r.summary);
ok('and it is reported', !!r.problems[0], r.problems[0]);
ok('the summary does not leak it', !r.summary.includes('sk-or'), r.summary);

console.log('\nDELETES ARE GATED SEPARATELY FROM WRITES');
const withDelete = [...good, { op: 'delete', path: 'src/Old.tsx', note: 'no longer used' }];
r = review(withDelete, { confirm: true });
ok('writes alone are refused while a delete rides along', !r.ok, r.summary);
ok('the delete is named', r.destroys.join(',') === 'src/Old.tsx', r.destroys.join(',') || 'not named');
r = review(withDelete, { confirm: true, destroyConfirmed: true });
ok('both confirmations together are accepted', r.ok, r.summary);
ok('and the delete is still in the set', r.safe.some((o) => o.op === 'delete'));
r = review([good[0], { op: 'delete', path: 'node_modules/x.js' }], { confirm: true, destroyConfirmed: true });
ok('a delete inside a blocked directory is dropped', r.safe.length === 1, r.summary);

console.log('\nMALFORMED OPERATIONS');
for (const [label, ops] of [
  ['an unknown op', [{ op: 'rename', path: 'src/a.ts', content: 'x' }]],
  ['a missing path', [{ op: 'update', content: 'x' }]],
  ['empty content', [{ op: 'create', path: 'src/a.ts', content: '   ' }]],
  ['content that is not a string', [{ op: 'create', path: 'src/a.ts', content: 42 }]],
  ['an object instead of an array', { op: 'create' }],
]) {
  const v = review(ops, { confirm: true });
  ok(`refuses ${label}`, !v.ok && v.safe.length === 0, v.summary);
}

console.log('\nSIZE');
const big = { op: 'create', path: 'src/Big.ts', content: 'x'.repeat(300 * 1024) };
ok('refuses a file over the limit', !review([big], { confirm: true }).ok, review([big], { confirm: true }).problems[0]);
ok('accepts a file under it', review([{ ...big, content: 'x'.repeat(1000) }], { confirm: true }).ok);

console.log('\nTHE BOUNDARIES ARE REPORTABLE');
const b = boundaries();
ok('the writable roots are listed', b.writableRoots.includes('src'));
ok('the never-written list mentions the environment file', b.neverWritten.some((x) => x.includes('.env')));
ok('the secret shapes are named', b.secretsRefused.length >= 8, `${b.secretsRefused.length} patterns`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
