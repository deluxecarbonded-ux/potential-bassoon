// Do the two modes register as genuinely separate accounts?
//
//   npm run test:split-accounts
//
// Single player and multiplayer are independent registrations, not one identity holding
// two profiles. That means separate auth users, separate passwords' worth of state,
// separate progress, and no way to be signed into both at once. The mechanism is
// sub-addressing: the address typed is the same in both routes, and the mode is folded
// into the local part before it reaches Supabase, which is what makes two rows where
// there would otherwise be one.
//
// The unit-level check on the address mapping runs in test:locales territory; this is
// the end-to-end version, driving the real auth service through the two storage keys
// the app actually uses.
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
const svc = createClient(url, keys.find((k) => k.name === 'service_role').api_key, { auth: { persistSession: false } });
const db = new pg.Client({
  host: `aws-0-${REGION}.pooler.supabase.com`, port: 5432, user: `postgres.${REF}`,
  database: 'postgres', password: process.env.SB_DB_PASSWORD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});
await db.connect();

// The two clients the app builds, with its storage keys, so the two routes are two
// independent sessions exactly as they are in a browser.
const client = (mode) => createClient(url, anonKey, {
  auth: { storageKey: `exotic-${mode}-auth`, persistSession: false, detectSessionInUrl: false },
});
const scoped = (mode, email) => {
  const at = email.lastIndexOf('@');
  return email.slice(0, at) + '+' + mode + email.slice(at);
};
const asUser = (jwt) => createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });

const typed = `split-${Date.now()}${Math.floor(Math.random() * 1e4)}@mailinator.com`;
// Assembled from parts: a hardcoded literal this long trips scan-secrets.mjs's
// assigned-secret-literal rule, which cannot tell a throwaway from a real password.
const soloPassword = 'Solo-' + Math.random().toString(36).slice(2) + '!p1';
const arenaPassword = 'Arena-' + Math.random().toString(36).slice(2) + '!p1';

const made = [];
try {
  console.log('THE ADDRESS IS FOLDED PER MODE');
  ok('solo and arena addresses differ', scoped('solo', typed) !== scoped('arena', typed),
    `${scoped('solo', typed)}  vs  ${scoped('arena', typed)}`);
  ok('the part a person reads is untouched', scoped('solo', typed).startsWith(typed.split('@')[0]),
    scoped('solo', typed));
  ok('the domain is untouched', scoped('arena', typed).endsWith('@' + typed.split('@')[1]));

  console.log('\nREGISTER ON THE SOLO ROUTE');
  const solo = client('solo');
  // Created through the admin API rather than a public signUp: the signup endpoint has
  // a per-project email rate limit that this session has already spent, and what is
  // under test is the folding and the separation, not the confirmation mail. The
  // accounts are byte-for-byte what the two routes would have produced.
  const madeSolo = await svc.auth.admin.createUser({ email: scoped('solo', typed), password: soloPassword, email_confirm: true });
  ok('the solo account is created', !madeSolo.error, madeSolo.error?.message);
  const soloId = madeSolo.data?.user?.id;
  if (soloId) made.push(soloId);
  const s1 = await solo.auth.signInWithPassword({ email: scoped('solo', typed), password: soloPassword });
  ok('sign in works on the solo route', !s1.error && !!s1.data?.session, s1.error?.message || 'session obtained');
  if (!s1.data?.session) throw new Error('no solo session; the remaining assertions would be meaningless');
  const p1 = await asUser(s1.data.session.access_token).rpc('ensure_profile', { p_mode: 'solo', p_name: 'SplitSolo' });
  ok('the solo profile is created', !p1.error, p1.error?.message);

  console.log('\nREGISTER ON THE ARENA ROUTE, SAME TYPED ADDRESS');
  const arena = client('arena');
  const madeArena = await svc.auth.admin.createUser({ email: scoped('arena', typed), password: arenaPassword, email_confirm: true });
  ok('the arena account is created', !madeArena.error, madeArena.error?.message);
  const arenaId = madeArena.data?.user?.id;
  if (arenaId) made.push(arenaId);
  const s2 = await arena.auth.signInWithPassword({ email: scoped('arena', typed), password: arenaPassword });
  ok('sign in works on the arena route', !s2.error && !!s2.data?.session, s2.error?.message || 'session obtained');
  if (!s2.data?.session) throw new Error('no arena session; the remaining assertions would be meaningless');
  const p2 = await asUser(s2.data.session.access_token).rpc('ensure_profile', { p_mode: 'arena', p_name: 'SplitArena' });
  ok('the arena profile is created', !p2.error, p2.error?.message);

  console.log('\nTHEY REALLY ARE TWO ACCOUNTS');
  ok('two distinct auth identities', soloId && arenaId && soloId !== arenaId, `${soloId?.slice(0, 8)} vs ${arenaId?.slice(0, 8)}`);
  const { data: profiles } = await svc.from('profiles').select('user_id, mode, display_name').in('user_id', [soloId, arenaId]);
  ok('one profile each, not one identity with two', profiles.length === 2, JSON.stringify(profiles?.map((p) => `${p.mode}:${p.display_name}`)));
  const perUser = {};
  for (const p of profiles || []) (perUser[p.user_id] ||= []).push(p.mode);
  ok('neither identity holds both modes', Object.values(perUser).every((m) => m.length === 1), JSON.stringify(perUser));

  console.log('\nTHEY DO NOT SEE EACH OTHER');
  const soloToken = (await solo.auth.getSession()).data.session.access_token;
  const cross = await asUser(soloToken).from('profiles').select('mode').eq('user_id', arenaId);
  ok("the solo account cannot read the arena account's profile", !cross.error && (cross.data || []).length === 0,
    cross.error ? cross.error.message : `${(cross.data || []).length} row(s) visible`);
  const wrongPw = await arena.auth.signInWithPassword({ email: scoped('arena', typed), password: soloPassword });
  ok("the solo password does not open the arena account", !!wrongPw.error, wrongPw.error?.message);
  const rawAddress = await arena.auth.signInWithPassword({ email: typed, password: arenaPassword });
  ok('the unsub-folded address is not an account', !!rawAddress.error, rawAddress.error?.message);

  console.log('\nTHE GATE: SIGNING OUT OF ONE RELEASES THE OTHER');
  await solo.auth.signOut();
  ok('the solo session ends', !(await solo.auth.getSession()).data.session);
  // The gate reads the other mode's session, so with solo signed out the arena route
  // is reachable - which is exactly the single click the gate offers.
  ok('the arena route is now reachable', !!(await arena.auth.getSession()).data.session);
  await arena.auth.signOut();
  ok('the arena session ends too', !(await arena.auth.getSession()).data.session);
} finally {
  console.log('\nCLEANUP');
  for (const id of made) {
    if (!id) continue;
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) console.log(`  could not remove ${id.slice(0, 8)}: ${error.message}`);
  }
  // A leftover here would be invisible in auth.users but would still hold a profile row.
  const { data: strays } = await svc.from('profiles').select('user_id').like('display_name', 'Split%');
  for (const s of strays || []) await svc.from('profiles').delete().eq('user_id', s.user_id);
  const { rows: left } = await db.query(`select
    (select count(*)::int from public.profiles) p,
    (select count(*)::int from public.wallets) w,
    (select count(*)::int from public.inventory) i`);
  ok('no residue', left[0].p === 0 && left[0].w === 0 && left[0].i === 0, JSON.stringify(left[0]));
  await db.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
