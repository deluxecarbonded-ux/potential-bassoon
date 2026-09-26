// Deep test of the solo path: purchases, item use, rewards, replay protection,
// malformed answers, rate limiting, and the fact that hints are no longer metered.
//
//   npm run test:solo
//
// There is no daily AI hint cap any more, because there is no server-side hint. Hints are
// written on the player's own device by src/ai from committed weights, so there is no
// request to count, no provider allowance to exhaust and no counter table. The section
// below asserts that absence on purpose: it is the check that would fail if a server-side
// hint path were ever reintroduced alongside the local one.
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

const fn = async (jwt, body) => {
  const r = await fetch(`${url}/functions/v1/solo-action`, {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const q = async (s, p = []) => {
  try {
    return (await db.query(s, p)).rows;
  } catch (e) {
    // Postgres reports a position, not a statement, and a test that fails with only a
    // line number and an offset sends the reader looking in the wrong place. This happened:
    // the reported offset pointed into a 185-character insert that was fine, because the
    // query that actually failed was a third of that length.
    console.error(`\n  SQL FAILED: ${e.message}`);
    console.error(`  statement (${s.length} chars): ${JSON.stringify(s)}`);
    console.error(`  parameters: ${JSON.stringify(p)}`);
    throw e;
  }
};
const throwaway = () => 'Solo-' + Math.random().toString(36).slice(2) + '!x';

const made = [];
// Counts taken before the run, so cleanup is judged against the database as it was found
// rather than against zero. Asserting zero only holds on a project nobody has ever played:
// this one has real accounts, real wallets and fifteen live solo challenges in it, and this
// check was reporting the game's own data as residue the test had failed to remove.
const RESIDUE = `select (select count(*)::int from auth.users) u, (select count(*)::int from public.wallets) w,
    (select count(*)::int from public.inventory) i, (select count(*)::int from public.transactions) t,
    (select count(*)::int from private.solo_challenges) c`;
let baseline = null;
try {
  baseline = (await q(RESIDUE))[0];
  const email = `solo-${Date.now()}${Math.floor(Math.random() * 1e4)}@mailinator.com`;
  const password = throwaway();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr) throw new Error(cErr.message);
  made.push(created.user.id);
  const uid = created.user.id;
  const { data: sess } = await createClient(url, anonKey, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email, password });
  const jwt = sess.session.access_token;
  const me = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  await me.rpc('ensure_profile', { p_mode: 'solo', p_name: 'Solo Test' });
  const { data: s2 } = await createClient(url, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
  const call = (b) => fn(s2.session.access_token, b);

  console.log('START');
  const started = await call({ action: 'start', difficulty: 'easy', level: 1, locale: 'en' });
  const id = started.json.id;
  ok('solo-action start returns a challenge', started.status === 200 && !!id, JSON.stringify(started.json).slice(0, 90));
  ok('puzzle carries 4 lines and a prompt', started.json.puzzle.lines.length === 4 && !!started.json.puzzle.prompt);

  // create_solo_challenge hand-builds its response from category/prompt/lines only, so
  // the answer and the hint never leave private.solo_challenges. That is the whole
  // point of the design - a player must not be able to read the answer out of
  // devtools - so assert it rather than assume it, and take the answer from the
  // database the way a grader would.
  const raw = JSON.stringify(started.json);
  const row = (await q('select answer, hint from private.solo_challenges where id=$1', [id]))[0];
  const answer = row.answer;
  ok('the response does NOT contain the answer', !raw.includes(answer), `answer=${answer}`);
  ok('the response does NOT contain the hint', !raw.includes(row.hint));
  ok('answer is four digits', /^\d{4}$/.test(answer), answer);
  const firstDigit = answer[0];

  console.log('\nITEMS');
  const before = (await q('select quantity from public.inventory where user_id=$1 and mode=$2 and item_id=$3', [uid, 'solo', 'hint']))[0];
  ok('a new player starts with hints', before && before.quantity >= 1, `quantity=${before?.quantity}`);

  const usedHint = await call({ action: 'use', id, item: 'hint' });
  ok('using a hint returns one', usedHint.status === 200 && typeof usedHint.json.hint === 'string' && usedHint.json.hint.length > 10,
    JSON.stringify(usedHint.json).slice(0, 80));
  const afterHint = (await q('select quantity from public.inventory where user_id=$1 and mode=$2 and item_id=$3', [uid, 'solo', 'hint']))[0];
  ok('using a hint decrements the stack', afterHint.quantity === before.quantity - 1, `${before.quantity} -> ${afterHint.quantity}`);
  const reuse = await call({ action: 'use', id, item: 'hint' });
  ok('the same item cannot be used twice on one challenge', !!reuse.json.error, JSON.stringify(reuse.json));

  const usedDigit = await call({ action: 'use', id, item: 'digit' });
  ok('using a digit reveals the first digit', usedDigit.json.digit === firstDigit, `got "${usedDigit.json.digit}" want "${firstDigit}"`);
  const bogus = await call({ action: 'use', id, item: 'crown' });
  ok('an unknown item is refused', !!bogus.json.error, JSON.stringify(bogus.json));

  console.log('\nANSWERING');
  const tooShort = await call({ action: 'answer', id, answer: answer.slice(1) });
  ok('a three-digit answer is refused', !!tooShort.json.error, JSON.stringify(tooShort.json));
  const tooLong = await call({ action: 'answer', id, answer: answer + '9' });
  ok('a five-digit answer is refused', !!tooLong.json.error, JSON.stringify(tooLong.json));
  const nonNumeric = await call({ action: 'answer', id, answer: 'abcd' });
  ok('a non-numeric answer is refused', !!nonNumeric.json.error, JSON.stringify(nonNumeric.json));
  // A wrong-but-well-formed answer. It has to be four DIGITS: an earlier version built
  // the "wrong" value out of UUID characters, which the ^[0-9]{4}$ check correctly
  // rejected as malformed rather than scoring as a wrong answer.
  const wrongAnswer = answer === '9999' ? '1111' : '9999';
  const foreign = await call({ action: 'answer', id, answer: wrongAnswer });
  ok('a wrong but well-formed answer is rejected, not errored', foreign.json.correct === false && !foreign.json.error,
    JSON.stringify(foreign.json));

  // A riddle answer can legitimately begin with a zero, and "0042" must be accepted
  // where "42" is not - the regex is anchored at four digits, so this is the case that
  // would break if the field ever normalised the value to a number.
  const zeroAnswer = (await q(`insert into private.solo_challenges (user_id,difficulty,level,category,prompt,lines,hint,answer,locale)
     values ($1,'easy',2,'math','p','["a"]'::jsonb,'h','0042','en') returning id`, [uid]))[0].id;
  const padded = await call({ action: 'answer', id: zeroAnswer, answer: '0042' });
  ok('a leading-zero answer is accepted', padded.json.correct === true && padded.json.reward > 0, JSON.stringify(padded.json));

  const bal0 = (await q('select balance from public.wallets where user_id=$1 and mode=$2', [uid, 'solo']))[0].balance;
  const first = await call({ action: 'answer', id, answer });
  ok('the first correct answer pays', first.json.correct === true && first.json.reward === 40, JSON.stringify(first.json));
  const bal1 = (await q('select balance from public.wallets where user_id=$1 and mode=$2', [uid, 'solo']))[0].balance;
  ok('the wallet is credited once', bal1 === bal0 + 40, `balance ${bal0} -> ${bal1} (easy pays 40)`);

  // Now the same challenge again. create_solo_challenge marks it completed, and
  // solo_action short-circuits on that, so the second solve must be worth nothing -
  // otherwise a replay button would mint coins.
  const replay = await call({ action: 'answer', id, answer });
  ok('a completed challenge pays nothing on replay',
    replay.json.correct === true && replay.json.reward === 0, JSON.stringify(replay.json));
  const bal2 = (await q('select balance from public.wallets where user_id=$1 and mode=$2', [uid, 'solo']))[0].balance;
  ok('replaying does not pay twice', bal2 === bal1, `balance stayed ${bal2}`);

  const prog = await q('select difficulty, level, attempts from public.solo_progress where user_id=$1', [uid]);
  ok('one progress row per solved level', prog.length === 2 && prog.some((p) => p.level === 1) && prog.some((p) => p.level === 2),
    JSON.stringify(prog));
  const wins = await q("select wins from public.profiles where user_id=$1 and mode='solo'", [uid]);
  ok('a win recorded per solved challenge', wins[0].wins === 2, `wins=${wins[0].wins}`);
  const txs = await q('select reason, delta from public.transactions where user_id=$1 order by created_at', [uid]);
  ok('a transaction per reward, and no duplicates', txs.length === 2 && txs.every((t) => t.delta > 0), JSON.stringify(txs));

  console.log('\nPURCHASES');
  await db.query("update public.wallets set balance=0 where user_id=$1 and mode='solo'", [uid]);
  const broke = await call({ action: 'buy', item: 'hint' });
  ok('cannot buy without coins', !!broke.json.error, JSON.stringify(broke.json));
  await db.query("update public.wallets set balance=100 where user_id=$1 and mode='solo'", [uid]);
  const buy = await call({ action: 'buy', item: 'hint' });
  ok('buying with coins succeeds', buy.status === 200 && !buy.json.error, JSON.stringify(buy.json));
  const inv = (await q('select quantity from public.inventory where user_id=$1 and mode=$2 and item_id=$3', [uid, 'solo', 'hint']))[0];
  ok('the purchase lands in inventory', inv.quantity === afterHint.quantity + 1, `quantity=${inv.quantity}`);
  const balAfterBuy = (await q('select balance from public.wallets where user_id=$1 and mode=$2', [uid, 'solo']))[0].balance;
  ok('the purchase is debited', balAfterBuy === 70, `balance=100 -> ${balAfterBuy} (hint costs 30)`);
  const buyUnknown = await call({ action: 'buy', item: 'moon' });
  ok('cannot buy an item from the other mode', !!buyUnknown.json.error, JSON.stringify(buyUnknown.json));

  console.log('\nTHE HINT PATH IS UNMETERED, AND SAYS SO');
  // There used to be a daily cap here: eleven hints in a day, the eleventh refused, with a
  // per-account counter in private.ai_usage and public.ai_hint_context doing the counting.
  // All of that is gone. A hint is written on the player's own device by src/ai, from
  // committed weights, so there is no request to meter, no allowance to exhaust and no
  // counter to keep. What replaced the cap is an assertion of the new fact, so that if
  // anyone reintroduces a server-side hint path this fails rather than passing quietly.
  const gone = await q(`select
      to_regclass('private.ai_usage') is null as no_usage_table,
      to_regclass('private.ai_provider_usage') is null as no_provider_table,
      to_regprocedure('public.ai_hint_context(uuid,uuid)') is null as no_hint_context,
      to_regprocedure('public.record_ai_provider_use(text,integer,integer,integer,boolean)') is null as no_recorder`);
  ok('the per-account AI counter table is gone', gone[0].no_usage_table === true, JSON.stringify(gone[0]));
  ok('the provider ledger is gone', gone[0].no_provider_table === true);
  ok('the hint context function is gone', gone[0].no_hint_context === true);
  ok('the provider accounting function is gone', gone[0].no_recorder === true);

  // And a hint still arrives, with nothing metered and no provider involved.
  //
  // This asks for more hints than the old ten-a-day cap allowed, because a cap can only be
  // shown to be gone by exceeding it. The challenges come from the real start action rather
  // than being inserted into private.solo_challenges directly: a hand-written row has to
  // agree with that table's columns and foreign keys by hand, and it failed here on a
  // foreign key for a user the cleanup had already removed. Going through the API cannot
  // drift from the schema.
  //
  // A challenge takes one hint and no more - the `used` array refuses the second - so this
  // is twelve challenges rather than twelve hints on one.
  //
  // The bag is topped up first, and that is the whole subtlety: without it the run stops
  // after two hints with "No items", which looks exactly like a cap being enforced and is
  // not. The item economy and the removed daily cap are different things, and only one of
  // them is being tested here.
  await db.query(`update public.inventory set quantity = 50
                  where user_id=$1 and mode='solo' and item_id='hint'`, [uid]);
  const refused = [];
  for (let i = 0; i < 12; i++) {
    const started = await call({ action: 'start', difficulty: 'easy', level: 1, locale: 'en' });
    const got = await call({ action: 'use', id: started.json?.id, item: 'hint' });
    if (got.status !== 200 || !got.json?.hint) {
      refused.push(`#${i + 1} HTTP ${got.status} ${JSON.stringify(got.json).slice(0, 60)}`);
    }
  }
  ok('twelve hints, past the old ten-a-day cap, all served', refused.length === 0,
    refused.length ? refused.join('; ') : 'no cap, no provider, no error');
  ok('and none of them mentioned a quota or a limit',
    !refused.some((s) => /quota|limit|exhaust|allowance/i.test(s)), refused.join('; ') || 'none did');

  console.log('\nAUTHORISATION');
  // A second account, to prove one player cannot touch another's challenge or items.
  // Auth rate-limits account creation, so this reports rather than crashes if the
  // project has had a lot of signups recently.
  const otherPassword = throwaway();
  const { data: other, error: oErr } = await admin.auth.admin.createUser({
    email: `solo-other-${Date.now()}${Math.floor(Math.random() * 1e4)}@mailinator.com`,
    password: otherPassword, email_confirm: true,
  });
  if (oErr) {
    ok('a second account is available for the authorisation checks', false, `createUser: ${oErr.message}`);
  } else {
    made.push(other.user.id);
    const { data: o, error: oSessErr } = await createClient(url, anonKey, { auth: { persistSession: false } })
      .auth.signInWithPassword({ email: other.user.email, password: otherPassword });
    if (oSessErr) {
      ok('the second account can sign in', false, oSessErr.message);
    } else {
      const foreignAnswer = await fn(o.session.access_token, { action: 'answer', id, answer });
      ok("another player cannot answer someone else's challenge", !!foreignAnswer.json.error, JSON.stringify(foreignAnswer.json));
      const foreignUse = await fn(o.session.access_token, { action: 'use', id, item: 'hint' });
      ok("another player cannot spend someone else's item", !!foreignUse.json.error, JSON.stringify(foreignUse.json));
      const foreignStart = await fn(o.session.access_token, { action: 'start', difficulty: 'easy', level: 1, locale: 'en' });
      ok('a fresh account cannot start without a profile', !!foreignStart.json.error, JSON.stringify(foreignStart.json));
    }
  }
} finally {
  console.log('\nCLEANUP');
  for (const id of made) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`  FAILED ${id}: ${JSON.stringify(error)}`);
  }
  // Scoped to the rooms these test accounts host. The previous form deleted anything created
  // in the last thirty minutes, which on a project with real players in it would take their
  // unfinished matches with it. This test does not create rooms, so in practice this is a
  // safety net - but a safety net that deletes other people's games is worse than none.
  if (made.length) {
    await db.query('delete from public.rooms where host_id = any($1::uuid[])', [made]);
  }
  const after = (await q(RESIDUE))[0];
  if (!baseline) {
    ok('no test residue left behind', false, 'could not read a baseline to compare against');
  } else {
    const drift = Object.keys(after).filter((k) => after[k] !== baseline[k]);
    ok('no test residue left behind', drift.length === 0,
      drift.length
        ? `left over: ${drift.map((k) => `${k} ${baseline[k]}->${after[k]}`).join(', ')}`
        : `unchanged: ${JSON.stringify(after)}`);
  }
  await db.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
