// Two-player end-to-end test of the arena: create, join, start, answer, score, finish.
//
// The two players are given DIFFERENT locales on purpose. The room stores one
// question and one answer per distinct locale, so this exercises the per-locale
// answer lookup rather than the trivial case where both players share an answer.
//
// Both throwaway users are deleted at the end; ON DELETE CASCADE takes their
// profile, wallet, inventory and room_players rows with them.
//
//   npm run test:arena
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const url = process.env.SB_URL;
const anonKey = process.env.SB_ANON_KEY;
const REF = process.env.SB_REF;
let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`);
};

const keys = await (await fetch(`${process.env.SB_API || 'https://api.supabase.com'}/v1/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
})).json();
const admin = createClient(url, keys.find((k) => k.name === 'service_role').api_key, { auth: { persistSession: false } });

const db = new pg.Client({
  host: `aws-0-${process.env.SB_REGION || 'us-east-1'}.pooler.supabase.com`,
  port: 5432, user: `postgres.${REF}`, database: 'postgres',
  password: process.env.SB_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});
await db.connect();

// The edge function the browser calls, reached the same way the browser reaches it.
const call = async (jwt, body) => {
  const r = await fetch(`${url}/functions/v1/room-action`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

const made = [];
// Built from parts, like app-smoke.mjs. A hardcoded 12+ character literal would trip
// scan-secrets.mjs's assigned-secret-literal rule, and rightly so - the rule cannot
// tell a throwaway test password from a real one, so the test should not look like a
// credential in the first place.
const throwaway = () => 'Arena-' + Math.random().toString(36).slice(2) + '!x';
const makePlayer = async (tag, locale, displayName) => {
  const email = `arena-${tag}-${Date.now()}${Math.floor(Math.random() * 1e4)}@mailinator.com`;
  const password = throwaway();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  made.push(data.user.id);
  const { data: sess, error: siErr } = await createClient(url, anonKey, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email, password });
  if (siErr) throw new Error(`signIn ${tag}: ${siErr.message}`);
  const jwt = sess.session.access_token;
  // room_action opens with "select * into me from profiles where mode='arena'; if not
  // found then raise 'Missing arena profile'". The app satisfies that by calling
  // ensure_profile on sign-in, so this must too - without it every later call fails
  // for the same uninformative reason and the negative checks pass for the wrong one.
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false },
  });
  const { error: epErr } = await client.rpc('ensure_profile', { p_mode: 'arena', p_name: displayName });
  if (epErr) throw new Error(`ensure_profile ${tag}: ${epErr.message}`);
  return { id: data.user.id, email, locale, jwt, client };
};

try {
  console.log('SETUP');
  const alice = await makePlayer('alice', 'en', 'Alice');
  const bob = await makePlayer('bob', 'ja', 'Bob');
  ok('two players signed in with different locales', !!alice.jwt && !!bob.jwt, `${alice.locale} vs ${bob.locale}`);

  console.log('\nROOM LIFECYCLE');
  const created = await call(alice.jwt, { action: 'create', mode: 'first', rounds: 1, category: 'random', locale: 'en' });
  const code = created.json.code;
  ok('host creates a room', created.status === 200 && /^[A-Z0-9]{6}$/.test(code || ''), `HTTP ${created.status} ${JSON.stringify(created.json)}`);

  const badMode = await call(bob.jwt, { action: 'create', mode: 'nonsense', rounds: 1, category: 'random', locale: 'en' });
  ok('invalid mode is rejected', badMode.json.error === 'error' && !badMode.json.code, JSON.stringify(badMode.json));

  if (!code) throw new Error('no room code - the rest of the run would be meaningless');

  const joined = await call(bob.jwt, { action: 'join', code, locale: 'ja' });
  ok('second player joins', joined.status === 200 && joined.json.code === code, `HTTP ${joined.status} ${JSON.stringify(joined.json)}`);

  const rejoin = await call(bob.jwt, { action: 'join', code, locale: 'ja' });
  ok('re-joining is idempotent', rejoin.status === 200 && rejoin.json.code === code, `HTTP ${rejoin.status} ${JSON.stringify(rejoin.json)}`);

  const outsiderPassword = throwaway();
  const { data: nonMember } = await admin.auth.admin.createUser({
    email: `arena-outsider-${Date.now()}@mailinator.com`, password: outsiderPassword, email_confirm: true,
  });
  made.push(nonMember.user.id);
  const { data: os } = await createClient(url, anonKey, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: nonMember.user.email, password: outsiderPassword });
  await createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${os.session.access_token}` } }, auth: { persistSession: false } })
    .rpc('ensure_profile', { p_mode: 'arena', p_name: 'Outsider' });
  const outsiderStart = await call(os.session.access_token, { action: 'start', code });
  ok('non-member cannot start the match', outsiderStart.json.error === 'error', JSON.stringify(outsiderStart.json));

  const earlyStart = await call(bob.jwt, { action: 'start', code });
  ok('non-host cannot start the match', earlyStart.json.error === 'error', JSON.stringify(earlyStart.json));

  console.log('\nMATCH');
  const started = await call(alice.jwt, { action: 'start', code });
  ok('host starts the match', started.status === 200 && started.json.success === true, `HTTP ${started.status} ${JSON.stringify(started.json)}`);

  const { rows: players } = await db.query('select user_id, locale, score from public.room_players where room_id=(select id from public.rooms where code=$1)', [code]);
  ok('both players seated with their locales', players.length === 2, players.map((p) => `${p.locale}:${p.score}`).join(' '));

  const { rows: answers } = await db.query(
    'select locale, answer from private.round_answers where room_id=(select id from public.rooms where code=$1) and round=1 order by locale', [code]);
  ok('one answer stored per distinct locale', answers.length === 2, answers.map((a) => `${a.locale}=${a.answer}`).join(' '));
  ok('the two locales got different answers', answers.length === 2 && answers[0].answer !== answers[1].answer);
  if (answers.length !== 2) throw new Error('expected an answer per locale');

  const wrong = await call(alice.jwt, { action: 'answer', code, answer: '0000', round: 1 });
  ok('a wrong answer is rejected', wrong.status === 200 && wrong.json.correct === false, `HTTP ${wrong.status} ${JSON.stringify(wrong.json)}`);

  const real = answers.find((a) => a.locale === 'en').answer;
  await new Promise((r) => setTimeout(r, 450)); // the RPC rate-limits to 400ms per player
  const right = await call(alice.jwt, { action: 'answer', code, answer: real, round: 1 });
  ok('the correct answer scores', right.status === 200 && right.json.correct === true, JSON.stringify(right.json));

  const { rows: after } = await db.query('select user_id, locale, score, last_solved_round from public.room_players where room_id=(select id from public.rooms where code=$1)', [code]);
  const a = after.find((p) => p.user_id === alice.id);
  const b = after.find((p) => p.user_id === bob.id);
  ok('solver score incremented to 1', a.score === 1, `alice=${a.score} bob=${b.score}`);
  ok('the other player did not score', b.score === 0, `bob=${b.score}`);

  // 'first' advances the moment anyone solves, so a 1-round match is now finished.
  const { rows: room } = await db.query('select status, active_round, finished_at is not null as done from public.rooms where code=$1', [code]);
  ok('match finished after the winning answer', room[0].status === 'finished' && room[0].done === true, `status=${room[0].status}`);

  const late = await call(bob.jwt, { action: 'answer', code, answer: answers.find((x) => x.locale === 'ja').answer, round: 1 });
  ok('answering a finished match is refused', late.json.correct === false && late.json.finished === true, JSON.stringify(late.json));

  const { rows: w } = await db.query(
    "select display_name, wins from public.profiles where user_id = any($1::uuid[]) and mode='arena'",
    [[alice.id, bob.id]]);
  ok('arena profiles exist for both players', w.length === 2, w.map((x) => `${x.display_name}:${x.wins}w`).join(' '));
  ok('display_name from ensure_profile reached the seat', w.some((x) => x.display_name === 'Alice'), w.map((x) => x.display_name).join(','));

  // A `leave` on a FINISHED match is deliberately a no-op - room_action returns early
  // to preserve the standings - so it cannot be used to tidy up after a test. The room
  // is removed directly instead. See also the note on rooms.host_id below.
  const { rows: gone } = await db.query('delete from public.rooms where code=$1 returning code', [code]);
  ok('room row removable by the test', gone.length === 1, `${gone.length} deleted`);
} finally {
  console.log('\nCLEANUP');
  // rooms.host_id has no ON DELETE CASCADE, so the room must go before its host or the
  // user delete fails on the foreign key. Delete any room this run created, then any
  // stray test account, then assert the database is exactly as we found it.
  await db.query("delete from public.rooms where code like '______' and created_at > now() - interval '30 minutes'");
  for (const id of made) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`  FAILED ${id}: ${JSON.stringify(error)}`);
  }
  const { rows: after } = await db.query(`
    select (select count(*)::int from auth.users)         as users,
           (select count(*)::int from public.rooms)       as rooms,
           (select count(*)::int from public.room_players) as players,
           (select count(*)::int from public.profiles)     as profiles`);
  ok('no rooms left behind', after[0].rooms === 0, `${after[0].rooms} remaining`);
  ok('no room_players left behind', after[0].players === 0, `${after[0].players} remaining`);
  ok('no profiles left behind', after[0].profiles === 0, `${after[0].profiles} remaining`);
  ok('no test accounts left behind', after[0].users === 0, `${after[0].users} remaining`);
  await db.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
