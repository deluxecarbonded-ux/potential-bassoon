// Does a realtime subscription actually deliver an event?
//
// The lobby depends on it: rooms, room_players, wallets, inventory, profiles and
// solo_progress are all in the supabase_realtime publication, and the client renders
// other players joining and scores moving purely from these pushes. A publication
// entry that does not deliver is invisible to every other test here - the REST
// assertions all pass while two players stare at a stale lobby.
//
// The subscription is made with a signed-in player's JWT, because that is what the
// client does. An earlier version subscribed as anon and saw room_players arrive but
// not rooms, which says nothing about the app: RLS filters realtime by the
// subscriber's own permissions, and a guest is in no room, so the membership policies
// correctly withhold those events from them.
//
//   npm run test:realtime
import { createClient } from '@supabase/supabase-js';

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
const throwaway = () => 'Rt-' + Math.random().toString(36).slice(2) + '!x';
const made = [];

// The nine public tables in the supabase_realtime publication. Kept as a list rather
// than spread through the test so the subscription covers all of them at once, and so
// the "nothing is published by accident" check below has something to compare against.
// The three private tables are deliberately absent: two of them hold the answers to
// every puzzle in the game, and publishing them would broadcast those answers to
// every connected client.
const PUBLISHED = ['rooms', 'room_players', 'round_questions', 'wallets', 'inventory',
  'profiles', 'solo_progress', 'transactions', 'catalog'];
const WITHHELD = ['round_answers', 'solo_challenges', 'ai_usage'];

/** Subscribes as `jwt` and records every postgres_changes event that arrives. */
function listen(jwt, name) {
  const received = [];
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false },
  });
  const channel = client.channel(name);
  // Every filter has to be registered before subscribe(); realtime-js throws on
  // adding a postgres_changes callback afterwards. All nine published tables are
  // listed, so a table that is added to the publication but not covered here fails
  // this test rather than being assumed to work.
  for (const table of PUBLISHED) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => received.push(p));
  }
  channel.subscribe();
  return {
    received,
    state: () => channel.state,
    // Waits for a matching event, or gives up. Polling a plain array avoids the
    // bookkeeping a queue-of-waiters needs, and the payloads are the only thing that
    // matters here.
    async until(predicate, ms = 15000) {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const hit = received.find(predicate);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    },
    close: () => client.removeChannel(channel),
  };
}

async function player(tag) {
  const email = `rt-${tag}-${Date.now()}${Math.floor(Math.random() * 1e4)}@mailinator.com`;
  const password = throwaway();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  made.push(data.user.id);
  const { data: s } = await createClient(url, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
  await createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${s.session.access_token}` } }, auth: { persistSession: false } })
    .rpc('ensure_profile', { p_mode: 'arena', p_name: tag });
  return { id: data.user.id, jwt: s.session.access_token };
}
const room = (jwt, body) => fetch(`${url}/functions/v1/room-action`, {
  method: 'POST', headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then((r) => r.json().catch(() => ({})));

const alice = await player('alice');
const bob = await player('bob');
let host, guest;
try {
  console.log('HOST SEES THE ROOM BEING CREATED');
  host = listen(alice.jwt, 'rt-host');
  await new Promise((r) => setTimeout(r, 2000));
  ok('a signed-in client can subscribe', ['joined', 'SUBSCRIBED'].includes(host.state()), `state=${host.state()}`);

  const created = await room(alice.jwt, { action: 'create', mode: 'first', rounds: 1, category: 'math', locale: 'en' });
  const code = created.code;
  ok('room created', !!code, `code=${code}`);
  const ins = await host.until((p) => p.table === 'rooms' && p.eventType === 'INSERT');
  ok('the host receives the rooms INSERT', !!ins, ins ? `code=${ins.new?.code}` : 'no rooms INSERT within 15s');

  // The row payload arrives EMPTY - new and old are {} - under both the anon key and a
  // member's JWT. Recorded here because it is a trap rather than a defect: every
  // handler in state.tsx is `() => load()`, using the event purely as a signal to
  // refetch over REST, so the app is unaffected. But any future code that reaches for
  // payload.new.code would silently get undefined, so the shape is asserted here where
  // someone adding a realtime-driven feature will see it.
  ok('row payloads are empty (events are refetch signals only, not data)',
    !!ins && Object.keys(ins.new || {}).length === 0,
    ins ? `new=${JSON.stringify(ins.new)} old=${JSON.stringify(ins.old)}` : 'no event');

  console.log('\nA JOINING PLAYER SEES SOMEONE ELSE ARRIVE');
  guest = listen(bob.jwt, 'rt-guest');
  await new Promise((r) => setTimeout(r, 2000));
  await room(bob.jwt, { action: 'join', code, locale: 'en' });
  const seat = await guest.until((p) => p.table === 'room_players' && p.eventType === 'INSERT');
  ok('the joining player receives their own room_players INSERT', !!seat, seat ? `name=${seat.new?.display_name}` : 'none within 15s');

  console.log('\nSTART PROPAGATES AS AN UPDATE');
  const started = await room(alice.jwt, { action: 'start', code });
  ok('the match started', started.success === true, JSON.stringify(started));
  const upd = await host.until((p) => p.table === 'rooms' && p.eventType === 'UPDATE');
  ok('the host receives the rooms UPDATE', !!upd, upd ? `status->${upd.new?.status} round=${upd.new?.active_round}` : 'no rooms UPDATE within 15s');
  const updGuest = await guest.until((p) => p.table === 'rooms' && p.eventType === 'UPDATE');
  ok('the other player receives it too', !!updGuest, updGuest ? `status->${updGuest.new?.status}` : 'none within 15s');

  console.log('\nWALLET MOVES ON A PURCHASE');
  const before = await admin.from('wallets').select('balance').eq('user_id', alice.id).eq('mode', 'arena').maybeSingle();
  await admin.from('wallets').update({ balance: 300 }).eq('user_id', alice.id).eq('mode', 'arena');
  const wUpd = await host.until((p) => p.table === 'wallets' && p.eventType === 'UPDATE');
  ok('a wallet UPDATE reaches the owner', !!wUpd, wUpd ? `balance->${wUpd.new?.balance} (was ${before.data?.balance})` : 'none within 15s');

  console.log('\nTHE THREE TABLES ADDED TO THE PUBLICATION');
  // These were published after the original six. A publication entry that does not
  // deliver is the exact failure this whole test exists to catch, so each one is
  // driven by a real write rather than assumed from its presence in the publication.
  const qIns = await host.until((p) => p.table === 'round_questions' && p.eventType === 'INSERT');
  ok('round_questions INSERT reaches a room member', !!qIns,
    qIns ? 'delivered' : 'none within 15s - the start above wrote a question');

  // A purchase, not a match win: the room was never finished, so no win transaction
  // exists yet, and buy_item writes a 'purchase:' entry the moment it succeeds.
  const buy = await room(alice.jwt, { action: 'buy', item: 'moon' });
  ok('the purchase went through', buy.success === true, JSON.stringify(buy));
  const tIns = await host.until((p) => p.table === 'transactions' && p.eventType === 'INSERT');
  ok('transactions INSERT reaches the owner', !!tIns,
    tIns ? 'delivered' : 'none within 15s - the purchase above wrote a ledger entry');

  // catalog is public seed data, so a temporary row is enough to prove delivery. It is
  // removed again immediately, and nothing references it - inventory's foreign key
  // points the other way and no inventory row names it.
  const tempItem = { id: 'rt' + Date.now().toString(36), mode: 'arena', price: 999, consumable: false };
  const { error: catErr } = await admin.from('catalog').insert(tempItem);
  ok('a temporary catalog row was inserted', !catErr, catErr?.message);
  const cIns = await host.until((p) => p.table === 'catalog' && p.eventType === 'INSERT');
  ok('catalog INSERT reaches subscribers', !!cIns, cIns ? `event=${cIns.eventType}` : 'none within 15s');
  await admin.from('catalog').delete().eq('id', tempItem.id).eq('mode', 'arena');
  const cDel = await host.until((p) => p.table === 'catalog' && p.eventType === 'DELETE');
  ok('catalog DELETE reaches subscribers too', !!cDel, cDel ? 'delivered' : 'none within 15s');

  console.log('\nNOTHING IS PUBLISHED BY ACCIDENT');
  const seen = [...new Set(host.received.map((p) => p.table))].sort();
  ok('nothing arrived for a table that is not published',
    !seen.some((t) => WITHHELD.includes(t)),
    `withheld: ${WITHHELD.join(', ')}`);
  ok('every table that delivered is one of the published ones',
    seen.every((t) => PUBLISHED.includes(t)),
    `delivered: ${seen.join(', ') || 'none'}`);
} finally {
  console.log('\nCLEANUP');
  await host?.close();
  await guest?.close();
  await admin.from('rooms').delete().gte('created_at', new Date(Date.now() - 1800000).toISOString());
  for (const id of made) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`  FAILED ${id}: ${JSON.stringify(error)}`);
  }
  const { data: first } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  const strays = (first?.users ?? []).filter((u) => u.email?.startsWith('rt-')).map((u) => u.email);
  if (strays.length) console.log(`  ${strays.length} still listed immediately after delete; listUsers is eventually consistent, re-checking`);
  // listUsers reads a replica, so it can still list a user that was just deleted.
  // Poll rather than assert on the first read, or a correct run reports a leak.
  let remaining = strays;
  for (let i = 0; i < 10 && remaining.length; i++) {
    await new Promise((r) => setTimeout(r, 700));
    const { data: again } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
    remaining = (again?.users ?? []).filter((u) => u.email?.startsWith('rt-')).map((u) => u.email);
  }
  ok('no test accounts left behind', remaining.length === 0, remaining.join(', ') || 'none');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
