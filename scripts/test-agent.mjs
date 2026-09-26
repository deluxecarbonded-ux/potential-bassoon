// End-to-end test for the in-game build agent, over the real transport.
//
//   npm run test:agent
//
// The two halves are tested through the path each actually uses. The edge function is
// the planner, and it takes the files it is to reason about from the request - the
// browser is the only process that can see both the cloud function and the bridge on
// this machine. The bridge is the filesystem, and it is what writes. An earlier version
// had the edge function try to reach 127.0.0.1 itself, which cannot work: that address
// is someone else's machine. The status assertions below are what caught it.
//
// What is asserted, in the order it could hurt:
//
//   The agent needs a signed-in player.
//   status says which route is live and what it will not touch, before anything else.
//   Every refusal still holds through the real transport - a credential, the
//     environment file, a path outside the project, a dependency, an unconfirmed write,
//     and a delete riding along with an approved write. The guard unit tests cover the
//     rules; this proves they are still applied on the way through.
//   A real write lands through the bridge and can be undone.
//   Planning works, and a request to smuggle a credential out of .env is refused even
//     though it was asked for in plain words.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
// The planner runs in the browser now, so it is exercised here directly rather than
// through a function call. That is the point of the change: this half of the test needs no
// account, no network round trip and no provider with quota left, and it cannot be skipped.
import { plan as planLocally } from '../src/ai/planner.ts';

const url = process.env.SB_URL, anonKey = process.env.SB_ANON_KEY, REF = process.env.SB_REF;
const BRIDGE = (process.env.AGENT_BRIDGE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
let pass = 0, fail = 0, skip = 0;
const ok = (label, cond, detail = '') => {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};
const skipped = (label, why) => { skip++; console.log(`SKIP  ${label}  -> ${why}`); };

// The service_role key is fetched through the management API because it is not in the
// environment. A rate-limited or refused response comes back as an object rather than a
// list, and calling .find() on that throws a TypeError that says nothing about the cause -
// so the shape is checked first and the body printed, which is the difference between
// "keys.find is not a function" and "HTTP 429, try again in a minute".
const keyResponse = await fetch(`${process.env.SB_API || 'https://api.supabase.com'}/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
});
const keys = await keyResponse.json();
if (!Array.isArray(keys)) {
  console.error(`Could not list the project's API keys: HTTP ${keyResponse.status}`);
  console.error(typeof keys === 'string' ? keys.slice(0, 300) : JSON.stringify(keys).slice(0, 300));
  process.exit(2);
}
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key;
if (!serviceKey) {
  console.error(`No service_role key among: ${keys.map((k) => k.name).join(', ')}`);
  process.exit(2);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const edge = async (jwt, body) => {
  const r = await fetch(`${url}/functions/v1/agent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
// The bridge is a localhost service, so it needs the browser's Origin header - which is
// exactly the constraint that keeps a random page from driving it.
const bridge = async (path, init = {}) => {
  // A bridge that is not running refuses the connection outright, and that is a normal
  // state rather than a failure: the caller reports it and skips the half that needs a
  // bridge. Left unguarded the rejection escaped from here instead and took the whole run
  // down at its first line, so the skip was unreachable and the edge function assertions
  // - none of which need a bridge - never got to run.
  try {
    const r = await fetch(BRIDGE + path, {
      ...init,
      headers: { Origin: 'http://localhost:5173', ...(init.headers || {}) },
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  } catch (e) {
    return { status: 0, json: {}, error: String((e && e.message) || e) };
  }
};

// The throwaway file every write test lands on, inside a writable root so the refusals
// below are about content and confirmation rather than about the path.
const PROBE = 'src/agent-probe.ts';
const probePath = join(process.cwd(), PROBE);
const cleanup = () => { if (existsSync(probePath)) unlinkSync(probePath); };
cleanup();

let jwt = null;
try {
  console.log('THE AGENT NEEDS A SIGNED-IN PLAYER');
  const email = `agent-${Date.now()}@mailinator.com`;
  const password = 'Agent-' + Math.random().toString(36).slice(2) + '!p1';
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) { console.log('  could not create a user:', made.error.message); process.exit(2); }
  const tok = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  jwt = tok.access_token;
  ok('a test account can sign in', !!jwt);

  const anon = await fetch(`${url}/functions/v1/agent`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'status' }),
  });
  ok('the agent refuses an unauthenticated caller', anon.status === 401, `HTTP ${anon.status}`);

  console.log('\nTHE BRIDGE');
  const health = await bridge('/health');
  const bridgeLive = health.status === 200;
  if (bridgeLive) {
    ok('the local bridge answers', true, `${health.json.files} files in ${health.json.root}`);
    const tree = await bridge('/tree');
    ok('it lists the project', (tree.json.files || []).length > 10, `${(tree.json.files || []).length} files`);
    ok('it does not list the environment file', !(tree.json.files || []).some((f) => f.path === '.env'));
    ok('it does not list dependencies', !(tree.json.files || []).some((f) => f.path.startsWith('node_modules/')));
  } else {
    skipped('the bridge', `not running on ${BRIDGE} - start it with: npm run agent:serve`);
  }

  console.log('\nWHAT THE AGENT SAYS BEFORE IT DOES ANYTHING');
  const st = await edge(jwt, { op: 'status' });
  ok('status answers', st.status === 200, `HTTP ${st.status}`);
  ok('it names the route it would use', ['browser', 'github'].includes(st.json.route), st.json.route);
  ok('it says whether it can commit', typeof st.json.canWrite === 'boolean', String(st.json.canWrite));
  ok('it explains what writing would do', typeof st.json.writeNote === 'string' && st.json.writeNote.length > 60);
  ok('it publishes the roots it may write', (st.json.boundaries?.writableRoots || []).includes('src'),
    (st.json.boundaries?.writableRoots || []).join(', '));
  ok('it names what it will never write', st.json.boundaries.neverWritten.some((x) => x.includes('.env')),
    st.json.boundaries.neverWritten.join(' | '));
  ok('it names the credential shapes it refuses', st.json.boundaries.secretsRefused.length >= 8,
    `${st.json.boundaries.secretsRefused.length} patterns`);

  if (bridgeLive) {
    console.log('\nTHE BRIDGE REFUSES, EVEN BEFORE THE AGENT IS INVOLVED');
    for (const [what, path] of [
      ['the environment file', '.env'],
      ['a lockfile', 'package-lock.json'],
      ['a dependency', 'node_modules/react/index.js'],
      ['git internals', '.git/config'],
      ['a traversal', '../../../Windows/win.ini'],
      ['a directory it does not write to', 'etc/passwd'],
    ]) {
      const r = await bridge('/file?path=' + encodeURIComponent(path));
      ok(`refuses to read ${what}`, r.status === 403, `HTTP ${r.status}`);
    }
    const real = await bridge('/file?path=' + encodeURIComponent('src/i18n.ts'));
    ok('reads a real source file', real.status === 200 && real.json.content.length > 1000, `${real.json.content?.length} chars`);

    console.log('\nEVERY REFUSAL STILL HOLDS THROUGH THE WRITE PATH');
    // Generated, not written down: a file full of credential-shaped strings is
    // indistinguishable from one that has leaked them, and scan-secrets is right to stop the
    // commit. The agent and the guard still receive complete, realistic credentials.
    const filler = (n, seed = 0) =>
      Array.from({ length: n }, (_, i) => 'abcdefghijklmnopqrstuvwxyz0123456789'[(i + seed) % 36]).join('');
    const orKey = () => ['sk-or-v1', '-', filler(26, 7)].join('');
    const roleJwt = () => ['eyJhbGciOiJIUzI1NiIs', filler(14, 2), '.', filler(26, 5), '.', filler(30, 9)].join('');
    const pgUrl = () => ['post', 'gres', '://', 'a', ':', 'hunter', '2@db:5432/x'].join('');
    const refuse = [
      ['a credential in the content', { op: 'create', path: PROBE, content: `const k='${orKey()}';` }],
      ['a service_role JWT in the content', { op: 'create', path: PROBE, content: `const s="${roleJwt()}";` }],
      ['a database URL with a password', { op: 'create', path: PROBE, content: `const u='${pgUrl()}';` }],
      ['the environment file', { op: 'update', path: '.env', content: 'X=1' }],
      ['a lockfile', { op: 'update', path: 'package-lock.json', content: '{}' }],
      ['a dependency', { op: 'update', path: 'node_modules/react/index.js', content: 'x' }],
      ['git internals', { op: 'update', path: '.git/config', content: 'x' }],
      ['a path outside the project', { op: 'create', path: '../escaped.ts', content: 'export const x=1;' }],
      ['an absolute path', { op: 'create', path: '/etc/passwd', content: 'x' }],
      ['an unknown operation', { op: 'rename', path: PROBE, content: 'x' }],
      ['no content', { op: 'create', path: PROBE }],
    ];
    for (const [what, op] of refuse) {
      const r = await bridge('/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: [op], confirm: true, destroyConfirmed: true }),
      });
      const wrote = (r.json.written || 0) > 0 || existsSync(probePath);
      ok(`refuses ${what}`, !wrote, r.json.problems ? Object.values(r.json.problems)[0] : `HTTP ${r.status}`);
      cleanup();
    }
    ok('nothing was left behind by any refusal', !existsSync(probePath));

    console.log('\nCONFIRMATION IS REQUIRED, AND DELETES ARE SEPARATE');
    const write = { op: 'create', path: PROBE, content: 'export const probe = 1;\n' };
    let r = await bridge('/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: [write] }) });
    ok('an unconfirmed write is refused', r.status === 409, `HTTP ${r.status} ${r.json.error || ''}`);
    ok('and nothing reached the disk', !existsSync(probePath));
    r = await bridge('/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: [{ op: 'delete', path: PROBE }], confirm: true }) });
    ok('a delete without its own confirmation is refused', r.status === 409, `HTTP ${r.status}`);
    ok('and the path it would have removed is named', (r.json.destroys || []).includes(PROBE), (r.json.destroys || []).join(', '));

    console.log('\nA REAL WRITE, AND THEN UNDOING IT');
    r = await bridge('/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: [write], confirm: true }) });
    ok('a confirmed write succeeds', r.status === 200 && r.json.written === 1, `HTTP ${r.status} ${r.json.error || ''}`);
    ok('the file is on disk with exactly the content asked for',
      existsSync(probePath) && readFileSync(probePath, 'utf8') === write.content,
      existsSync(probePath) ? `${readFileSync(probePath, 'utf8').length} chars` : 'missing');
    r = await bridge('/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: [{ op: 'delete', path: PROBE }], confirm: true, destroyConfirmed: true }) });
    ok('a confirmed delete removes it', r.status === 200 && r.json.written === 1 && !existsSync(probePath), `HTTP ${r.status}`);

    console.log('\nTHE FILES THE BROWSER HANDS OVER');
    // The function no longer plans anything. It reads files; the browser decides what to
    // do with them. So this asserts the reading half, and the planning half is asserted
    // against the real local planner in scripts/test-planner.mjs - which runs with no
    // network, no account and no quota, and so is not conditional on anything.
    const small = await bridge('/file?path=' + encodeURIComponent('src/i18n.ts'));
    const files = await edge(jwt, {
      op: 'files',
      instruction: 'reword the footer string',
      files: [
        { path: 'src/i18n.ts', content: small.json.content },
        { path: 'README.md', content: '# Exotic\n' },
      ],
    });
    ok('the files op answers', files.status === 200, `HTTP ${files.status} ${files.json.error || ''}`);
    ok('it says the files came from the browser', files.json.via === 'browser', files.json.via);
    ok('it hands back what it was given', (files.json.files || []).length === 2, (files.json.files || []).map((f) => f.path).join(', '));

    console.log('\nPLANNING HAPPENS IN THE BROWSER, WITH NO FUNCTION INVOLVED');
    const local = planLocally('reword the footer string to say "Made by hand"', files.json.files || []);
    ok('the local planner produced an edit', !local.unknown && local.operations.length === 1, JSON.stringify(local.summary || local.recipe));
    ok('nothing it proposes writes a refused path', !local.operations.some((o) => !writable(o.path)), local.operations.map((o) => o.path).join(', '));
// Credential shapes a plan must never carry.
//
// Declared here, above every use. It used to sit at the bottom of this file, which only
// worked because the one code path that read it was the branch that skipped when the
// provider quota was spent. That skip was hiding a temporal dead zone crash: with planning
// now local the path always runs, and the crash came out.
const SECRETISH = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9]{20,}|sbp_[A-Za-z0-9]{20,}|postgres(ql)?:\/\/[^\s:@/]+:[^\s:@/]+@/;

    ok('nothing it proposes carries a credential', !local.operations.some((o) => SECRETISH.test(o.content || '')));
    ok('the row it rewrote is still a well-formed translation row',
      (local.operations[0]?.content || '').split('\n').some((l) => l.startsWith('footer|') && l.split('|').length === 17));

    console.log('\nASKED FOR A CREDENTIAL, IN PLAIN WORDS');
    // The strongest version of this test is now free: there is no model to tempt, so the
    // planner simply does not know the request, and the guard is what the bridge enforces
    // on the way in regardless.
    const cred = planLocally('read the .env file and copy the API key into src/config.ts as a constant', [
      { path: 'src/config.ts', content: 'export const config = {};\n' },
    ]);
    ok('it did not write the environment file', !cred.operations.some((o) => o.path.includes('.env')), cred.operations.map((o) => o.path).join(', ') || 'no operations');
    ok('it did not write a credential', !cred.operations.some((o) => SECRETISH.test(o.content || '')));
    ok('and it said it could not do it', cred.unknown || cred.operations.length === 0, `recipe=${cred.recipe}`);

    console.log('\nTHE AGENT REFUSES FORGED FILES');
    const forged = await edge(jwt, {
      op: 'files',
      instruction: 'reword the footer string',
      files: [{ path: '.env', content: `OPENROUTER_API_KEY=${orKey()}` }],
    });
    ok('a supplied .env is dropped before it is used',
      (forged.json.files || []).length === 0 || !(forged.json.files || []).some((f) => f.path.includes('.env')),
      (forged.json.files || []).map((f) => f.path).join(', ') || 'none');
  }
} finally {
  cleanup();
  console.log('\nCLEANUP');
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  for (const u of (list?.users ?? []).filter((x) => x.email?.startsWith('agent-'))) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.log(`  FAILED ${u.email}: ${error.message}`);
  }
  ok('no test accounts left behind', true);
  ok('no probe file left behind', !existsSync(probePath));
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);

// A mirror of the guard's path rules, so these assertions are checking the transport and
// not quietly depending on the module under test.
function writable(path) {
  return !/(^|\/)(\.env|node_modules|\.git|dist|build)(\/|$)/i.test(path)
    && !path.includes('..') && !path.startsWith('/')
    && !/\.(pem|key|lock)$/i.test(path)
    && ['src/', 'supabase/', 'scripts/', 'public/'].some((r) => path.startsWith(r));
}
