// RLS behaviour check that writes nothing: impersonates roles inside a rolled-back
// transaction using `set local role` + `set local request.jwt.claims`, exactly how
// PostgREST applies auth.uid() per request.
//
//   $env:SB_DB_PASSWORD='...' ; node scripts/db-rls-sim.mjs
import pg from 'pg';

const REF = 'xcldkdvbfsvfveqioarj';
const client = new pg.Client({
  host: `aws-0-${process.env.SB_REGION || 'us-east-1'}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${REF}`,
  database: 'postgres',
  password: process.env.SB_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await client.connect();

let pass = 0, fail = 0;
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ROOM = '33333333-3333-4333-8333-333333333333';

// Runs `sql` as `role` with an optional acting user, inside a SAVEPOINT so that a
// denied statement cannot poison the enclosing fixture transaction. SET LOCAL is
// also reverted by ROLLBACK TO SAVEPOINT, so the role never leaks between checks.
let sp = 0;
async function as(role, uid, sql) {
  const name = `sp_${sp++}`;
  await client.query(`savepoint ${name}`);
  try {
    await client.query(`set local role ${role}`);
    await client.query('select set_config($1,$2,true)', [
      'request.jwt.claims',
      JSON.stringify(uid ? { sub: uid, role, email: `${uid}@test.local` } : { role }),
    ]);
    const { rows } = await client.query(sql);
    await client.query(`release savepoint ${name}`);
    return { ok: true, rows };
  } catch (e) {
    await client.query(`rollback to savepoint ${name}`);
    return { ok: false, error: e.message };
  }
}

function check(label, cond, detail = '') {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`);
}

// A denied statement (no GRANT, or RLS blocking) is treated as "sees zero rows".
const count = (r) => (r.ok ? Number(r.rows[0]?.n ?? -1) : 0);

// Everything below runs inside one transaction that is rolled back at the end,
// so the fixtures are visible to the role simulations but never persist.
// (Multi-statement batches can't be parameterised by pg, so the fixed UUIDs are inlined.)
await client.query('begin');
await client.query(`
  insert into auth.users (id, email) values
    ('${ALICE}','alice@test.local'), ('${BOB}','bob@test.local'),
    ('44444444-4444-4444-8444-444444444444','carol@test.local')
  on conflict (id) do nothing;
  insert into public.profiles(user_id,mode,display_name) values
    ('${ALICE}','solo','Alice'), ('${ALICE}','arena','Alice'),
    ('${BOB}','solo','Bob'),    ('${BOB}','arena','Bob'),
    ('44444444-4444-4444-8444-444444444444','solo','Carol');
  insert into public.wallets(user_id,mode,balance) values
    ('${ALICE}','solo',500), ('${ALICE}','arena',500),
    ('${BOB}','solo',500),   ('${BOB}','arena',500);
  insert into public.rooms(id,code,host_id,game_mode,total_rounds,category,status,active_round)
    values ('${ROOM}','ABC123','${ALICE}','first',3,'math','playing',1);
  insert into public.room_players(room_id,user_id,display_name,locale) values
    ('${ROOM}','${ALICE}','Alice','en'), ('${ROOM}','${BOB}','Bob','en');
  insert into public.round_questions(room_id,round,locale,category,prompt,lines)
    values ('${ROOM}',1,'en','math','2+2?','[]'::jsonb);
`);

// ---- anon: only the public catalog is readable -------------------------------
check('anon sees all 4 catalog rows', count(await as('anon', null, 'select count(*) n from public.catalog')) === 4);
check('anon cannot read profiles', count(await as('anon', null, 'select count(*) n from public.profiles')) === 0,
  'blocked by RLS/grant');

// Carol is a non-member, seeded above, to prove the room policies do not leak.
const CAROL = '44444444-4444-4444-8444-444444444444';

check('Alice reads only her own solo profile', count(await as('authenticated', ALICE, "select count(*) n from public.profiles where mode='solo'")) === 1);

const bobSeen = await as('authenticated', ALICE, `select count(*) n from public.profiles where user_id = '${BOB}'`);
check('Alice cannot read Bob profile', count(bobSeen) === 0, `saw ${count(bobSeen)} row(s)`);

check('Alice reads only her own wallet', count(await as('authenticated', ALICE, `select count(*) n from public.wallets where user_id='${BOB}'`)) === 0);
check('room member reads room', count(await as('authenticated', ALICE, `select count(*) n from public.rooms where id='${ROOM}'`)) === 1);
check('non-member Carol cannot read room', count(await as('authenticated', CAROL, `select count(*) n from public.rooms where id='${ROOM}'`)) === 0);
check('member reads the 2 room_players', count(await as('authenticated', ALICE, `select count(*) n from public.room_players where room_id='${ROOM}'`)) === 2);
check('member reads current round question', count(await as('authenticated', ALICE, `select count(*) n from public.round_questions where room_id='${ROOM}'`)) === 1);
check('Carol cannot read round_questions', count(await as('authenticated', CAROL, `select count(*) n from public.round_questions where room_id='${ROOM}'`)) === 0);
check('is_room_member(Bob) true', (await as('authenticated', BOB, `select public.is_room_member('${ROOM}') ok`)).rows[0].ok === true);
check('is_room_member(Carol) false', (await as('authenticated', CAROL, `select public.is_room_member('${ROOM}') ok`)).rows[0].ok === false);

// service_role-only RPCs must not be callable by an end user.
const solo = await as('authenticated', ALICE, `select public.solo_action('${ALICE}','buy',jsonb_build_object('item','hint'))`);
check('authenticated CANNOT call solo_action (want denied)', solo.ok === false, solo.error);
const room = await as('authenticated', ALICE, `select public.room_action('${ALICE}','create',jsonb_build_object('mode','first','rounds',3,'locale','en','category','math'))`);
check('authenticated CANNOT call room_action (want denied)', room.ok === false, room.error);
const hint = await as('authenticated', ALICE, `select public.ai_hint_context('${ALICE}','${ROOM}')`);
check('authenticated CANNOT call ai_hint_context (want denied)', hint.ok === false, hint.error);

// ensure_profile is granted to authenticated, and must still refuse an anon caller.
const epAnon = await as('anon', null, `select public.ensure_profile('solo','X')`);
check('anon CANNOT call ensure_profile (want denied)', epAnon.ok === false, epAnon.error);

// Anonymous execute rights must not exist on the private helpers.
const privExec = await client.query(`
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join information_schema.routine_privileges rp on rp.routine_name=p.proname
  where n.nspname='private' and rp.grantee in ('anon','authenticated')`);
check('private helpers have no anon/authenticated EXECUTE', privExec.rowCount === 0, `${privExec.rowCount} grant(s)`);

await client.query('rollback'); // fixtures never persist
console.log(`\nfixtures rolled back; database left unchanged.  ${pass} passed, ${fail} failed`);
await client.end();
process.exit(fail ? 1 : 0);
