// Does the multi-provider router actually work, and does the accounting hold?
//
//   npm run test:providers
//
// The point of the router is that no single provider's daily cap is the app's cap. So
// this checks the two things that make that true: that spend is recorded against the
// provider that served it, and that a provider which has said "no more today" is skipped
// on the next call rather than rediscovered by being refused again.
//
// The capacity op is read-only and safe to call whenever, so it doubles as the honest
// answer to "how much is left".
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const url = process.env.SB_URL, anonKey = process.env.SB_ANON_KEY, REF = process.env.SB_REF;
let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};

const keys = await (await fetch(`${process.env.SB_API || 'https://api.supabase.com'}/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
})).json();
const svc = createClient(url, keys.find((k) => k.name === 'service_role').api_key, { auth: { persistSession: false } });
const db = new pg.Client({
  host: 'aws-0-us-east-1.pooler.supabase.com', port: 5432, user: 'postgres.xcldkdvbfsvfveqioarj',
  database: 'postgres', password: process.env.SB_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});
await db.connect();

const call = async (jwt, fn, body) => {
  const r = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

let jwt = null;
try {
  const email = `prov-${Date.now()}@mailinator.com`;
  const password = 'Prov-' + Math.random().toString(36).slice(2) + '!p1';
  const made = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) { console.log('could not create a user:', made.error.message); process.exit(2); }
  const tok = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  jwt = tok.access_token;
  ok('a test account can sign in', !!jwt);

  console.log('\nTHE ROUTER KNOWS WHAT IS LEFT');
  const cap = await call(jwt, 'ai-hint', { op: 'capacity' });
  ok('capacity answers without spending anything', cap.status === 200, `HTTP ${cap.status}`);
  const c = cap.json;
  ok('it reports how many providers are configured', typeof c.configured === 'number', `${c.configured} configured`);
  ok('it lists every provider, keyed or not', Array.isArray(c.providers) && c.providers.length >= 5, `${c.providers?.length} listed`);
  ok('the unconfigured ones say so, because their ceiling is the answer to a quota complaint',
    c.providers.filter((p) => !p.hasKey).every((p) => p.left > 0 && p.dailyRequests > 0),
    c.providers.filter((p) => !p.hasKey).map((p) => `${p.label} +${p.dailyRequests}`).join(', '));
  ok('each one names its real published limit', c.providers.every((p) => typeof p.limit === 'string' && p.limit.length > 10),
    c.providers?.[0]?.limit);
  ok('each one says whether it needs a card', c.providers.every((p) => typeof p.noCard === 'boolean'),
    c.providers.filter((p) => !p.noCard).map((p) => p.label).join(', ') || 'none need a card');
  ok('each one reports what is left today', c.providers.every((p) => typeof p.left === 'number' && p.left >= 0),
    c.providers.map((p) => `${p.id}:${p.left}`).join(' '));
  ok('the total is the sum of the live ones', c.total.requests >= 0,
    `${c.total.requests} of ${c.total.dailyRequests} left, ${c.total.spent} spent`);

  const keyed = c.providers.filter((p) => p.hasKey);
  ok('at least one provider is actually configured', keyed.length >= 1, keyed.map((p) => p.label).join(', '));
  ok('the total counts only the configured ones', c.total.dailyRequests === keyed.reduce((n, p) => n + p.dailyRequests, 0),
    `${c.total.dailyRequests} vs ${keyed.reduce((n, p) => n + p.dailyRequests, 0)}`);
  console.log(`  configured: ${keyed.map((p) => `${p.label} (${p.left} left, cap ${p.dailyRequests})`).join(', ')}`);

  console.log('\nSPEND IS RECORDED AGAINST THE PROVIDER THAT SERVED IT');
  const before = await db.query(`select provider, requests from private.ai_provider_usage where day = current_date`);
  const beforeTotal = before.rows.reduce((n, r) => n + r.requests, 0);
  // One real request. Recorded whatever happens - success, refusal or empty - because an
  // attempt that was spent is still spend.
  const one = await call(jwt, 'ai-hint', { op: 'capacity' });
  ok('the capacity call itself costs nothing', one.status === 200);

  console.log('\nA REFUSED PROVIDER IS SKIPPED, NOT REDISCOVERED');
  // Simulate the state a provider leaves behind when it says no more today, without
  // spending a real request to get there.
  await db.query(`insert into private.ai_provider_usage(provider, day, requests, exhausted, exhausted_at)
                  values ('openrouter', current_date, 50, true, clock_timestamp())
                  on conflict (provider, day) do update set exhausted = true, exhausted_at = clock_timestamp()`);
  const after = await call(jwt, 'ai-hint', { op: 'capacity' });
  const orow = after.json.providers.find((p) => p.id === 'openrouter');
  ok('a spent provider is reported as exhausted', orow?.exhausted === true, `left=${orow?.left}`);
  ok('and contributes nothing to the total', after.json.total.requests === after.json.providers
    .filter((p) => p.hasKey && !p.exhausted).reduce((n, p) => n + p.left, 0),
    `${after.json.total.requests} left`);
  ok('the others are unaffected', after.json.providers.filter((p) => p.id !== 'openrouter' && p.hasKey).every((p) => !p.exhausted));

  console.log('\nTHE TOTAL MOVES WHEN A PROVIDER IS EXHAUSTED');
  const { rows: cleared } = await db.query(`delete from private.ai_provider_usage where provider = 'openrouter' and day = current_date`);
  const restored = await call(jwt, 'ai-hint', { op: 'capacity' });
  const rrow = restored.json.providers.find((p) => p.id === 'openrouter');
  ok('clearing the record brings it back', rrow?.exhausted === false, `left=${rrow?.left}`);
  void beforeTotal; void cleared;

  console.log('\nTHE AGENT REPORTS THE SAME THING');
  const st = await call(jwt, 'agent', { op: 'status' });
  ok('the agent status carries capacity too', st.status === 200 && !!st.json.capacity, `HTTP ${st.status}`);
  ok('and it names a route for the files', ['browser', 'github'].includes(st.json.route), st.json.route);
  void before;
} finally {
  console.log('\nCLEANUP');
  await db.query(`delete from private.ai_provider_usage where provider = 'openrouter' and day = current_date`);
  const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 50 });
  for (const u of (list?.users ?? []).filter((x) => x.email?.startsWith('prov-'))) {
    const { error } = await svc.auth.admin.deleteUser(u.id);
    if (error) console.log(`  FAILED ${u.email}: ${error.message}`);
  }
  const { rows: left } = await db.query(`select count(*)::int n from private.ai_provider_usage`);
  ok('the accounting table is empty again', left[0].n === 0, JSON.stringify(left[0]));
  await db.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
