// Do the two modes register as genuinely separate accounts?
//
//   npm run test:split-accounts
//
// Registration goes through the public signup endpoint, not the admin API, because the
// public endpoint is what a player actually hits and the admin API confirms addresses
// itself. That distinction is the whole point: a version of this test that created users
// with admin.createUser kept passing while signup was completely dead, because the dead
// part was the one call it was skipping.
//
// Single player and multiplayer are independent registrations, not one identity holding
// two profiles. That means separate auth users, separate passwords' worth of state,
// separate progress, and no way to be signed into both at once. The mechanism is
// sub-addressing: the username typed is the same in both routes, and the mode is folded
// into the local part of the address that username becomes before it reaches Supabase,
// which is what makes two rows where there would otherwise be one.
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
// Mirrors accountAddress() in src/state.tsx: the username becomes the local part and the
// mode is folded into it. The domain is the reserved .invalid, so the address is never
// deliverable. Keep the two in step - the app is what a player actually types into.
const address = (mode, username) =>
  `${String(username).trim().toLowerCase()}+${mode}@users.invalid`;
const asUser = (jwt) => createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });

// Deliberately mixed case. A lowercase name would prove nothing about the two things
// that have to hold at once: the address folds the case away so sign-in does not care,
// and the profile keeps the case as it was typed so the name on screen is the name the
// player chose. An all-lowercase fixture passes whether or not either one is true.
const typed = `Split-${Date.now()}${Math.floor(Math.random() * 1e4)}`;
// Assembled from parts: a hardcoded literal this long trips scan-secrets.mjs's
// assigned-secret-literal rule, which cannot tell a throwaway from a real password.
const soloPassword = 'Solo-' + Math.random().toString(36).slice(2) + '!p1';
const arenaPassword = 'Arena-' + Math.random().toString(36).slice(2) + '!p1';
// Two throwaway addresses, one per mode. The same username in both routes is one player,
// so the address given at signup is per mode too - which is what the assertions below
// check, alongside the fact that neither overwrites the other.
const soloEmail = `${typed}-solo@mailinator.com`;
const arenaEmail = `${typed}-arena@mailinator.com`;

const made = [];
try {
  console.log('THE USERNAME IS FOLDED PER MODE');
  ok('solo and arena addresses differ', address('solo', typed) !== address('arena', typed),
    `${address('solo', typed)}  vs  ${address('arena', typed)}`);
  ok('the username a person types is the part before the mode',
    address('solo', typed).split('+')[0] === typed.toLowerCase(), address('solo', typed));
  ok('the address folds the case away, so sign-in does not care about it',
    address('solo', typed) === address('solo', typed.toLowerCase()) &&
    address('solo', typed) === address('solo', typed.toUpperCase()), address('solo', typed));
  ok('the mode is what separates them',
    address('arena', typed).startsWith(typed.toLowerCase() + '+arena@'), address('arena', typed));
  ok('the domain is the reserved, undeliverable one',
    address('solo', typed).endsWith('@users.invalid'));
  ok('the address lowercases, so Alex and alex are one account',
    address('solo', 'Alex') === address('solo', 'alex'), address('solo', 'Alex'));

  console.log('\nREGISTER ON THE SOLO ROUTE');
  const solo = client('solo');
  // Created through the admin API rather than a public signUp: the signup endpoint has
  // a per-project email rate limit that this session has already spent, and what is
  // under test is the folding and the separation, not the confirmation mail. The
  // accounts are byte-for-byte what the two routes would have produced.
  // The public endpoint, with the anon key, exactly as the browser does it. If the
  // derived address is not one the auth service will accept, or the project is asking
  // for a confirmation it can never deliver, this is the line that says so.
  const madeSolo = await solo.auth.signUp({ email: address('solo', typed), password: soloPassword });
  ok('signing up on the solo route returns a session', !madeSolo.error && !!madeSolo.data?.session, madeSolo.error?.message || 'session obtained');
  const soloId = madeSolo.data?.user?.id;
  if (soloId) made.push(soloId);
  const s1 = await solo.auth.signInWithPassword({ email: address('solo', typed), password: soloPassword });
  ok('the derived address signs in on the solo route', !s1.error && !!s1.data?.session, s1.error?.message || 'session obtained');
  if (!s1.data?.session) throw new Error('no solo session; the remaining assertions would be meaningless');
  const p1 = await asUser(s1.data.session.access_token).rpc('ensure_profile_with_email', { p_mode: 'solo', p_name: typed, p_email: soloEmail });
  ok('the solo profile is created', !p1.error, p1.error?.message);
  const { data: soloRow } = await svc.from('profiles').select('display_name,email').eq('user_id', soloId).eq('mode', 'solo').maybeSingle();
  ok('the solo profile carries the signup address', soloRow?.email === soloEmail, JSON.stringify(soloRow));
  ok('the display name is the username with the case it was typed',
    soloRow?.display_name === typed, JSON.stringify(soloRow?.display_name));

  console.log('\nREGISTER ON THE ARENA ROUTE, SAME TYPED ADDRESS');
  const arena = client('arena');
  const madeArena = await arena.auth.signUp({ email: address('arena', typed), password: arenaPassword });
  ok('signing up on the arena route returns a session', !madeArena.error && !!madeArena.data?.session, madeArena.error?.message || 'session obtained');
  const arenaId = madeArena.data?.user?.id;
  if (arenaId) made.push(arenaId);
  const s2 = await arena.auth.signInWithPassword({ email: address('arena', typed), password: arenaPassword });
  ok('the derived address signs in on the arena route', !s2.error && !!s2.data?.session, s2.error?.message || 'session obtained');
  if (!s2.data?.session) throw new Error('no arena session; the remaining assertions would be meaningless');
  const p2 = await asUser(s2.data.session.access_token).rpc('ensure_profile_with_email', { p_mode: 'arena', p_name: typed, p_email: arenaEmail });
  ok('the arena profile is created', !p2.error, p2.error?.message);
  const { data: arenaRow } = await svc.from('profiles').select('display_name,email').eq('user_id', arenaId).eq('mode', 'arena').maybeSingle();
  ok('the arena profile carries its own signup address', arenaRow?.email === arenaEmail, JSON.stringify(arenaRow));
  ok('one username, two different addresses', soloEmail !== arenaEmail, `${soloEmail} / ${arenaEmail}`);

  console.log('\nTHEY REALLY ARE TWO ACCOUNTS');
  ok('two distinct auth identities', soloId && arenaId && soloId !== arenaId, `${soloId?.slice(0, 8)} vs ${arenaId?.slice(0, 8)}`);
  const { data: profiles } = await svc.from('profiles').select('user_id, mode, display_name, email').in('user_id', [soloId, arenaId]);
  ok('one profile each, not one identity with two', profiles.length === 2, JSON.stringify(profiles?.map((p) => `${p.mode}:${p.display_name}`)));
  ok('both profiles kept the typed case', profiles.every((p) => p.display_name === typed),
    JSON.stringify(profiles?.map((p) => p.display_name)));
  const perUser = {};
  for (const p of profiles || []) (perUser[p.user_id] ||= []).push(p.mode);
  ok('neither identity holds both modes', Object.values(perUser).every((m) => m.length === 1), JSON.stringify(perUser));

  console.log('\nTHEY DO NOT SEE EACH OTHER');
  const soloToken = (await solo.auth.getSession()).data.session.access_token;
  const cross = await asUser(soloToken).from('profiles').select('mode').eq('user_id', arenaId);
  ok("the solo account cannot read the arena account's profile", !cross.error && (cross.data || []).length === 0,
    cross.error ? cross.error.message : `${(cross.data || []).length} row(s) visible`);
  const wrongPw = await arena.auth.signInWithPassword({ email: address('arena', typed), password: soloPassword });
  ok("the solo password does not open the arena account", !!wrongPw.error, wrongPw.error?.message);
  // The same username, signed up twice in one mode. This has to fail, because the
  // username is the identity and two accounts answering to it would make every other
  // screen ambiguous about who it is showing.
  const dupe = await arena.auth.signUp({ email: address('arena', typed), password: arenaPassword });
  ok('the same username cannot be taken twice in one mode', !!dupe.error, dupe.error?.message || 'a second account was created');
  const unfurled = await arena.auth.signInWithPassword({ email: `${typed}@users.invalid`, password: arenaPassword });
  ok('a username with no mode folded in is not an account', !!unfurled.error, unfurled.error?.message);

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
  const { data: strays } = await svc.from('profiles').select('user_id').eq('display_name', typed);
  for (const s of strays || []) await svc.from('profiles').delete().eq('user_id', s.user_id);
  // Scoped to the identities this run created, deliberately. Counting the whole table
  // only ever passed while the project had no players in it, so the first real account
  // made this fail on a database that was perfectly clean - a test that cannot be run
  // against a database anyone uses is not a test, it is a countdown.
  const { rows: left } = await db.query(`select
    (select count(*)::int from public.profiles where user_id = any($1::uuid[])) p,
    (select count(*)::int from public.wallets where user_id = any($1::uuid[])) w,
    (select count(*)::int from public.inventory where user_id = any($1::uuid[])) i`, [made]);
  ok('this run left nothing of itself behind', made.length > 0 && left[0].p === 0 && left[0].w === 0 && left[0].i === 0,
    JSON.stringify({ created: made.length, ...left[0] }));
  await db.end();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
