// Arena rules that the happy-path test does not reach: multi-round advancement,
// time-attack expiry, room capacity, the hourly room rate limit, item purchase and
// equipping, and the per-answer rate limit.
//
// Time-attack expiry is forced by moving the room's deadline into the past rather
// than waiting out the real 45 seconds - the logic under test is the comparison and
// the advance, not the clock.
//
//   npm run test:arena-rules
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
  host: `aws-0-${process.env.SB_REGION || 'us-east-1'}.pooler.supabase.com`, port: 5432,
  user: `postgres.${REF}`, database: 'postgres', password: process.env.SB_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});
await db.connect();

const room = async (jwt, body) => {
  const r = await fetch(`${url}/functions/v1/room-action`, {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const q = async (s, p = []) => (await db.query(s, p)).rows;
const throwaway = () => 'Rule-' + Math.random().toString(36).slice(2) + '!x';
const made = [];
const answerFor = async (code, locale, round) =>
  (await q(`select answer from private.round_answers
            where room_id=(select id from public.rooms where code=$1) and round=$2 and locale=$3`, [code, round, locale]))[0]?.answer;

async function player(tag, locale, coins = 0) {
  const email = `rule-${tag}-${Date.now()}${Math.floor(Math.random() * 1e4)}@mailinator.com`;
  const password = throwaway();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  made.push(data.user.id);
  const { data: s } = await createClient(url, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
  const jwt = s.session.access_token;
  await createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } })
    .rpc('ensure_profile', { p_mode: 'arena', p_name: tag });
  // The wallet row is created by ensure_profile, so any balance has to be set after
  // it - setting it first matches no rows and the player stays broke.
  if (coins) await db.query("update public.wallets set balance=$1 where user_id=$2 and mode='arena'", [coins, data.user.id]);
  return { id: data.user.id, email, locale, jwt };
}

try {
  console.log('MULTI-ROUND ADVANCEMENT (first-to-crack, 3 rounds)');
  const a = await player('alice', 'en');
  const b = await player('bob', 'en');
  const { json: made_room } = await room(a.jwt, { action: 'create', mode: 'first', rounds: 3, category: 'math', locale: 'en' });
  const code = made_room.code;
  await room(b.jwt, { action: 'join', code, locale: 'en' });
  ok('three-round room created and joined', !!code, `code=${code}`);
  const started = await room(a.jwt, { action: 'start', code });
  ok('a 3-round match starts', started.json.success === true, JSON.stringify(started.json));

  // Same locale for both players means one answer per round, so either can advance it.
  for (let round = 1; round <= 3; round++) {
    const state = (await q('select status, active_round from public.rooms where code=$1', [code]))[0];
    ok(`round ${round}: active_round is ${round}`, state.active_round === round, `status=${state.status} active=${state.active_round}`);
    const ans = await answerFor(code, 'en', round);
    ok(`round ${round}: an answer exists`, /^\d{4}$/.test(ans || ''), String(ans));
    // The per-player 400ms answer guard is real and applies here too - a first
    // version of this loop answered rounds back to back and round 2 came back
    // {"error":"error"}, which is the rate limiter working, not a bug in the arena.
    if (round > 1) await new Promise((r) => setTimeout(r, 450));
    const res = await room(a.jwt, { action: 'answer', code, answer: ans, round });
    ok(`round ${round}: correct answer accepted`, res.json.correct === true, JSON.stringify(res.json));
  }
  const fin = (await q('select status, active_round from public.rooms where code=$1', [code]))[0];
  ok('the match finishes after the final round', fin.status === 'finished', `status=${fin.status} active=${fin.active_round}`);
  const scores = await q('select user_id, score from public.room_players where room_id=(select id from public.rooms where code=$1)', [code]);
  const mine = scores.find((s) => s.user_id === a.id);
  const theirs = scores.find((s) => s.user_id === b.id);
  ok('the player who answered scored every round', mine.score === 3, `sweeper=${mine.score}`);
  ok('the player who never answered scored nothing', theirs.score === 0, `idle=${theirs.score}`);

  console.log('\nTIME ATTACK EXPIRY');
  const c = await player('carol', 'en');
  const d = await player('dave', 'en');
  const { json: ta } = await room(c.jwt, { action: 'create', mode: 'timeAttack', rounds: 3, category: 'random', locale: 'en' });
  await room(d.jwt, { action: 'join', code: ta.code, locale: 'en' });
  const taStart = await room(c.jwt, { action: 'start', code: ta.code });
  ok('a time-attack match starts', taStart.json.success === true, JSON.stringify(taStart.json));
  const dl = (await q('select deadline > clock_timestamp() as future from public.rooms where code=$1', [ta.code]))[0];
  ok('a deadline is set and in the future', dl.future === true);
  await db.query("update public.rooms set deadline=clock_timestamp()-interval '1 second' where code=$1", [ta.code]);
  const expired = await room(c.jwt, { action: 'answer', code: ta.code, answer: '0000', round: 1 });
  ok('answering past the deadline reports expiry', expired.json.expired === true && expired.json.correct === false, JSON.stringify(expired.json));
  const afterExp = (await q('select active_round from public.rooms where code=$1', [ta.code]))[0];
  ok('the expired round still advances', afterExp.active_round === 2, `active_round=${afterExp.active_round}`);
  const sync = await room(d.jwt, { action: 'sync', code: ta.code });
  ok('a second player can sync', sync.json.success === true || sync.json.expired === true, JSON.stringify(sync.json));

  console.log('\nCAPACITY AND RATE LIMITS');
  const e = await player('erin', 'en');
  const f = await player('frank', 'en');
  const { json: cap } = await room(e.jwt, { action: 'create', mode: 'first', rounds: 1, category: 'math', locale: 'en' });
  await room(f.jwt, { action: 'join', code: cap.code, locale: 'en' });
  // Fill the remaining six seats, then prove the ninth is refused. room_players.user_id
  // has a foreign key to auth.users, so the fillers have to be real accounts - random
  // UUIDs are rejected by the constraint, which is itself worth knowing.
  for (let n = 0; n < 6; n++) {
    const filler = await player(`fill${n}`, 'en');
    await db.query(`insert into public.room_players (room_id, user_id, display_name, emblem, locale)
      select id, $1, $2, 'moon', 'en' from public.rooms where code=$3`, [filler.id, `fill${n}`, cap.code]);
  }
  const { rows: seated } = await db.query('select count(*)::int n from public.room_players where room_id=(select id from public.rooms where code=$1)', [cap.code]);
  ok('the room seats eight players', seated[0].n === 8, `${seated[0].n} seated`);
  const overflow = await player('grace', 'en');
  const full = await room(overflow.jwt, { action: 'join', code: cap.code, locale: 'en' });
  ok('a ninth player is refused', !!full.json.error, JSON.stringify(full.json));

  // The 400ms per-answer guard.
  const g = await player('gwen', 'en');
  const h = await player('hana', 'en');
  const { json: rl } = await room(g.jwt, { action: 'create', mode: 'first', rounds: 1, category: 'math', locale: 'en' });
  await room(h.jwt, { action: 'join', code: rl.code, locale: 'en' });
  await room(g.jwt, { action: 'start', code: rl.code });
  const firstTry = await room(g.jwt, { action: 'answer', code: rl.code, answer: '0000', round: 1 });
  const instant = await room(g.jwt, { action: 'answer', code: rl.code, answer: '0000', round: 1 });
  ok('the first answer is processed', firstTry.json.correct === false && !firstTry.json.error, JSON.stringify(firstTry.json));
  ok('an immediate second answer is rate limited', !!instant.json.error, JSON.stringify(instant.json));
  await new Promise((r) => setTimeout(r, 450));
  const afterGap = await room(g.jwt, { action: 'answer', code: rl.code, answer: '0000', round: 1 });
  ok('the guard lifts after 400ms', afterGap.json.correct === false && !afterGap.json.error, JSON.stringify(afterGap.json));

  // The 20-rooms-per-hour guard, seeded directly so the test does not create 20 rooms.
  // It needs a player who is NOT seated in a room: create short-circuits and returns
  // the room you are already in before the rate limit is ever reached, which is the
  // idempotency guard doing its job - an earlier version of this test reused a seated
  // player and read the {code} it got back as a failure.
  const flooder = await player('kurt', 'en');
  await db.query("insert into public.rooms (code, host_id, game_mode, total_rounds, category) select upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)), $1, 'first', 1, 'math' from generate_series(1,20)", [flooder.id]);
  const { rows: seeded } = await db.query('select count(*)::int n from public.rooms where host_id=$1', [flooder.id]);
  ok('twenty rooms seeded for one host', seeded[0].n === 20, `${seeded[0].n}`);
  const flood = await room(flooder.jwt, { action: 'create', mode: 'first', rounds: 1, category: 'math', locale: 'en' });
  ok('the hourly room limit is enforced', !!flood.json.error && !flood.json.code,
    `HTTP ${flood.status} ${JSON.stringify(flood.json)}`);

  // And the idempotency guard that masked it: a player already in a room gets that
  // room's code back rather than a rate-limit error.
  const again = await room(g.jwt, { action: 'create', mode: 'first', rounds: 1, category: 'math', locale: 'en' });
  ok('create is idempotent for a player already in a room', again.json.code === rl.code,
    `got ${again.json.code} want ${rl.code}`);

  console.log('\nPURCHASE AND EQUIP');
  const i = await player('iris', 'en', 500);
  const buy = await room(i.jwt, { action: 'buy', item: 'crown' });
  ok('an arena item can be bought', buy.status === 200 && !buy.json.error, JSON.stringify(buy.json));
  const owned = (await q("select quantity from public.inventory where user_id=$1 and mode='arena' and item_id='crown'", [i.id]))[0];
  ok('the purchase lands in arena inventory', owned.quantity === 1, `quantity=${owned?.quantity}`);
  const equip = await room(i.jwt, { action: 'equip', item: 'crown' });
  ok('an owned item can be equipped', equip.json.success === true, JSON.stringify(equip.json));
  const emblem = (await q("select emblem from public.profiles where user_id=$1 and mode='arena'", [i.id]))[0];
  ok('the emblem is written to the profile', emblem.emblem === 'crown', `emblem=${emblem?.emblem}`);
  const notOwned = await player('jack', 'en', 500);
  const badEquip = await room(notOwned.jwt, { action: 'equip', item: 'moon' });
  ok('an unowned item cannot be equipped', !!badEquip.json.error, JSON.stringify(badEquip.json));
  const twice = await room(i.jwt, { action: 'buy', item: 'crown' });
  ok('a non-consumable arena item cannot be bought twice', !!twice.json.error, JSON.stringify(twice.json));
} finally {
  console.log('\nCLEANUP');
  await db.query("delete from public.rooms where created_at > now() - interval '30 minutes'");
  for (const id of made) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`  FAILED ${id}: ${JSON.stringify(error)}`);
  }
  const after = (await q(`select (select count(*)::int from auth.users) u, (select count(*)::int from public.rooms) r,
    (select count(*)::int from public.room_players) p, (select count(*)::int from public.wallets) w,
    (select count(*)::int from public.inventory) i, (select count(*)::int from public.profiles) f`))[0];
  ok('no test residue left behind', after.u === 0 && after.r === 0 && after.p === 0 && after.w === 0 && after.i === 0 && after.f === 0, JSON.stringify(after));
  await db.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
