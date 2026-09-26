// Writes Supabase Edge Function secrets.
//
//   $env:SUPABASE_ACCESS_TOKEN='sbp_...'  $env:OPENROUTER_API_KEY='sk-or-v1-...'
//   node scripts/set-secrets.mjs
//
// It used to do this over `pg` into vault.decrypted_secrets, on the assumption -
// stated in its own header - that Vault is "the same store the dashboard uses".
// On this project that is false. The vault schema exists but holds 0 rows, while the
// management API lists every secret, so the platform is serving them from its own
// store and the function reads those. Running the old version would have printed a
// reassuring table of secrets it had just written to a table nothing reads, while
// production kept the old value, and it would have left a second copy of a live
// billing key behind in an unused table. Hence the Secrets API below.
//
// The API takes an ARRAY of {name, value}; a bare object returns 400 with an empty
// body, which is no help at all. Verified against this project.
const REF = process.env.SB_REF || 'xcldkdvbfsvfveqioarj';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const API = `https://api.supabase.com/v1/projects/${REF}/secrets`;

const SECRETS = [
  { name: 'OPENROUTER_API_KEY', value: process.env.OPENROUTER_API_KEY, desc: 'OpenRouter API key for the ai-hint edge function.' },
  {
    name: 'OPENROUTER_FREE_MODELS',
    // The function keeps only `openrouter/free` or `:free` ids, max 5. Re-checked
    // against the live catalogue on 2026-09-26: `openrouter/free` routes to a healthy
    // provider per request, and the named models below are all present. The ids this
    // list used to name - meta-llama/llama-3.3-70b-instruct:free, qwen/qwen3-4b:free
    // and z-ai/glm-5.2:free - are all gone from the catalogue, and each one cost a
    // wasted attempt per call. Free-tier ids churn, so re-verify before trusting this
    // list; a missing id is not fatal, it is just a dead attempt.
    value: 'openrouter/free,qwen/qwen3.8-27b:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free',
    desc: 'Comma-separated free-only model route list for ai-hint.',
  },
  // Deliberately opt-in. These used to be hard-coded to localhost, which is right for
  // development and would quietly break a deployed origin. Only write them if the
  // caller states what they should be.
  { name: 'ALLOWED_ORIGINS', value: process.env.ALLOWED_ORIGINS, desc: 'CORS origins allowed to call the edge functions.' },
  { name: 'APP_URL', value: process.env.APP_URL, desc: 'Sent to OpenRouter as HTTP-Referer for attribution.' },
].filter((s) => s.value);

const missing = ['OPENROUTER_API_KEY'].filter((k) => !SECRETS.some((s) => s.name === k));
if (!TOKEN) missing.unshift('SUPABASE_ACCESS_TOKEN');
if (missing.length) {
  console.error(`Missing values for: ${missing.join(', ')}`);
  process.exit(2);
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
  const shown = s.name === 'OPENROUTER_API_KEY'
    ? s.value.slice(0, 8) + '...' + s.value.slice(-4)
    : s.value;
  console.log(`  ${s.name.padEnd(24)} = ${shown}`);
  console.log(`  ${''.padEnd(24)}   updated ${now?.updated_at ?? '(not returned - name missing!)'}`);
}
const skipped = ['ALLOWED_ORIGINS', 'APP_URL'].filter((n) => !SECRETS.some((s) => s.name === n));
if (skipped.length) console.log(`\nLeft untouched (set them explicitly to change): ${skipped.join(', ')}`);
console.log('\nNew secrets reach the function on its next cold start; no redeploy is needed.');
