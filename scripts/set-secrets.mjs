// Writes Supabase Edge Function secrets.
//
//   $env:SUPABASE_ACCESS_TOKEN='sbp_...'  $env:ALLOWED_ORIGINS='https://...'
//   node scripts/set-secrets.mjs
//
// This used to push an OpenRouter key, a free-model route list and four other providers'
// keys, and it hard-failed if the OpenRouter one was missing. None of that exists now: the
// project calls no model, from the browser or from an edge function, so there is no
// provider credential to configure and no allowance to raise.
//
// What remains is the CORS origin allowlist, which _shared/http.ts still reads and which
// has nothing to do with AI - it decides which browser origins may call the game actions
// at all. It is deliberately opt-in: it used to be hard-coded to localhost, which is right
// for development and quietly breaks a deployed origin, so it is only written when the
// caller states what it should be.
//
// The rest of the file is unchanged, including the reason it talks to the Secrets API at
// all rather than to pg: the vault schema exists on this project and holds 0 rows, because
// the platform serves secrets from its own store. Writing to vault would print a
// reassuring table of secrets nothing reads while production kept the old value.
//
// The API takes an ARRAY of {name, value}; a bare object returns 400 with an empty body,
// which is no help at all. Verified against this project.
const REF = process.env.SB_REF || 'xcldkdvbfsvfveqioarj';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const API = `https://api.supabase.com/v1/projects/${REF}/secrets`;

// Deliberately opt-in. Only written if the caller states what it should be.
const SECRETS = [
  { name: 'ALLOWED_ORIGINS', value: process.env.ALLOWED_ORIGINS, desc: 'CORS origins allowed to call the edge functions.' },
  // Only used when the agent writes through GitHub rather than through the local bridge.
  { name: 'AGENT_GITHUB_TOKEN', value: process.env.AGENT_GITHUB_TOKEN, desc: 'Lets the agent function commit approved changes to the repository.' },
].filter((s) => s.value);

if (!TOKEN) {
  console.error('Missing values for: SUPABASE_ACCESS_TOKEN');
  process.exit(2);
}
if (!SECRETS.length) {
  console.log('Nothing to write.');
  console.log('This project holds no AI provider credentials, because it calls no model.');
  console.log('Set ALLOWED_ORIGINS to allow a deployed origin, or AGENT_GITHUB_TOKEN to let');
  console.log('the agent commit through GitHub instead of the local bridge.');
  process.exit(0);
}

const call = (method, body) => fetch(API, {
  method,
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

const res = await call('POST', SECRETS.map(({ name, value }) => ({ name, value })));
if (!res.ok) {
  console.error(`Secrets API returned ${res.status} ${res.statusText}`);
  console.error((await res.text()).slice(0, 400) || '(empty body - the API sends none for a 4xx)');
  process.exit(1);
}

// Read the timestamps back rather than reporting the request as success on its own.
// A silent no-op here is the exact failure this script used to have.
const after = await (await call('GET')).json();
console.log(`Wrote ${SECRETS.length} secret(s) to project ${REF}:`);
for (const s of SECRETS) {
  const now = after.find((x) => x.name === s.name);
  const shown = s.name.includes('TOKEN') || s.name.includes('KEY')
    ? s.value.slice(0, 6) + '...' + s.value.slice(-4)
    : s.value;
  console.log(`  ${s.name.padEnd(24)} = ${shown}`);
  console.log(`  ${''.padEnd(24)}   updated ${now?.updated_at ?? '(not returned - name missing!)'}`);
}
console.log('\nNew secrets reach the function on its next cold start; no redeploy is needed.');
