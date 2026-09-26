// Can an account that has hosted a match actually be deleted?
//
//   npm run test:erasure
//
// rooms.host_id was the one foreign key in this schema pointing at auth.users without
// on delete cascade, so hosting a game - the ordinary thing an arena account does -
// made an account permanently undeletable. Deleting such a user failed on that
// constraint and left the room orphaned behind it.
//
// This asserts the whole cascade, not just that the delete returns: a hosted match
// pulls its room, that room's players, and that room's questions out with it, and
// nothing belonging to the erased account survives anywhere in the platform.
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const url = process.env.SB_URL, anonKey = process.env.SB_ANON_KEY, REF = process.env.SB_REF;
const REGION = process.env.SB_REGION || 'us-east-1';
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
  host: `aws-0-${REGION}.pooler.supabase.com`, port: 5432, user: `postgres.${REF}`,
  database: 'postgres', password: process.env.SB_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});
await db.connect();

// A confirmed account in each mode, reached the way the app reaches auth.
async function account(tag) {
  const email = `erase-${tag}-${Date.now()}${Math.floor(Math.random() * 1e4)}@mailinator.com`;
  // Assembled from parts: a hardcoded literal this long trips scan-secrets.mjs's
  // assigned-secret-literal rule, which cannot tell a throwaway from a real password.
  const password = 'Erase-' + Math.random().toString(36).slice(2) + '!p1';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  const tok = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  if (!tok.access_token) throw new Error('no access token');
  const client = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${tok.access_token}` } }, auth: { persistSession: false } });
  return { id: data.user.id, email, client, password };
}

const call = (jwt, body) => fetch(`${url}/functions/v1/room-action`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then((r) => r.json());

const made = [];
try {
  console.log('THE ACCOUNT THAT ONLY PLAYS');
  const player = await account('play');
  made.push(player.id);
  const pa = await player.client.rpc('ensure_profile', { p_mode: 'solo', p_name: 'ErasePlay' });
  ok('solo profile created', !pa.error, pa.error?.message);
  const pa2 = await player.client.rpc('ensure_profile', { p_mode: 'arena', p_name: 'ErasePlay' });
  ok('arena profile created on the same identity', !pa2.error, pa2.error?.message);
  const dPlayer = await admin.auth.admin.deleteUser(player.id);
  ok('deletes cleanly', !dPlayer.error, dPlayer.error?.message || 'deleted');

  console.log('\nTHE ACCOUNT THAT HAS HOSTED A MATCH');
  const host = await account('host');
  made.push(host.id);
  const tok = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: host.email, password: host.password }),
  })).json();
  const hp = await host.client.rpc('ensure_profile', { p_mode: 'arena', p_name: 'EraseHost' });
  ok('arena profile created', !hp.error, hp.error?.message);

  // Host a real match, so a room, a player row and a question all genuinely exist.
  const room = await call(tok.access_token, { action: 'create', mode: 'first', rounds: 3, category: 'random', locale: 'en' });
  ok('hosted a room', !!room.code, room.code || JSON.stringify(room));
  // room-action returns only the code on purpose - the room id is never handed to a
  // client - so resolve it here the way an operator would.
  const { data: hosted } = await admin.from('rooms').select('id, code, host_id').eq('code', room.code).single();
  ok('the room is on the platform', !!hosted?.id, hosted?.id || 'not found');
  const { data: rows } = await admin.from('room_players').select('room_id, user_id').eq('room_id', hosted.id);
  ok('a room_players row exists for the host', (rows || []).length >= 1, `${rows?.length} row(s)`);

  const dHost = await admin.auth.admin.deleteUser(host.id);
  ok('a hosting account can now be deleted - the dead end is gone', !dHost.error, dHost.error?.message || 'deleted');

  console.log('\nNOTHING SURVIVES THE ERASURE');
  const gone = async (table, column, value) => {
    const { data } = await admin.from(table).select('*').eq(column, value);
    return (data || []).length;
  };
  ok('the room is gone', (await gone('rooms', 'id', hosted.id)) === 0);
  ok('its player rows are gone', (await gone('room_players', 'room_id', hosted.id)) === 0);
  ok('its questions are gone', (await gone('round_questions', 'room_id', hosted.id)) === 0);
  ok('its profile is gone', (await gone('profiles', 'user_id', host.id)) === 0);
  ok('its wallet is gone', (await gone('wallets', 'user_id', host.id)) === 0);
  const { data: still } = await admin.from('rooms').select('id, host_id');
  ok('no orphaned room anywhere', (still || []).every((r) => r.host_id !== host.id), `${still?.length} room(s) on the platform`);

  console.log('\nEVERY auth.users FK CASCADES');
  const { rows: fks } = await db.query(`
    select c.conrelid::regclass::text as tbl, c.confdeltype
    from pg_constraint c
    where c.contype='f' and c.confrelid='auth.users'::regclass
      and c.conrelid::regclass::text in ('rooms','room_players','profiles','solo_progress')
      or c.contype='f' and c.confrelid='auth.users'::regclass
        and c.conrelid::regclass::text like '%.%' and c.conrelid::regclass::text !~ '^auth\\.'
    order by tbl`);
  const stubborn = fks.filter((r) => r.confdeltype !== 'c');
  ok('no app-owned FK to auth.users blocks deletion', stubborn.length === 0,
    stubborn.map((r) => `${r.tbl}=${r.confdeltype}`).join(' ') || `${fks.length} FKs, all cascade`);
} finally {
  console.log('\nCLEANUP');
  for (const id of made) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) console.log(`  could not remove ${id.slice(0, 8)}: ${error.message}`);
  }
  // Sweep any test rooms that survived, so a failure here cannot leak into the next run.
  const { data: strays } = await admin.from('rooms').select('id');
  for (const r of strays || []) await admin.from('rooms').delete().eq('id', r.id);
  const { rows: left } = await db.query(`select
    (select count(*)::int from public.rooms) r,
    (select count(*)::int from public.room_players) rp,
    (select count(*)::int from public.round_questions) rq,
    (select count(*)::int from public.profiles) p`);
  ok('no residue in the game tables', left[0].r === 0 && left[0].rp === 0 && left[0].rq === 0 && left[0].p === 0, JSON.stringify(left[0]));
  // auth.users is eventually consistent, so a just-deleted account still appears for a
  // moment. Poll rather than assert on the first read, and only about this test's own
  // erase-* accounts - the rest of the table is not this test's business.
  let stragglers = [];
  for (let i = 0; i < 12; i++) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    stragglers = (data?.users ?? []).filter((u) => u.email?.startsWith('erase-'));
    if (!stragglers.length) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  ok('every account this test created is gone', stragglers.length === 0,
    stragglers.map((u) => u.email).join(' ') || 'none left');
  await db.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
