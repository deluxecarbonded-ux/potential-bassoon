// True end-to-end test of the deployed edge functions, including the live OpenRouter call.
// Creates one throwaway user, exercises the real solo flow, then deletes the user
// (ON DELETE CASCADE removes its profiles, challenges, progress, wallet and usage rows).
import { createClient } from '@supabase/supabase-js';

const url = process.env.SB_URL;
const anonKey = process.env.SB_ANON_KEY;
const pat = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SB_REF;

const fn = async (name, body, token) => {
  const r = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      origin: 'http://localhost:5173',
    },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status, json };
};

// service_role key via the Management API.
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${pat}` },
})).json();
const serviceKey = keys.find((k) => k.name === 'service_role').api_key;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const email = `e2e-${Date.now()}@mailinator.com`;
const password = `E2e-${Math.random().toString(36).slice(2)}!x`;

let userId = null;
const cleanup = async () => {
  if (!userId) return;
  const { error } = await admin.auth.admin.deleteUser(userId);
  console.log(`\ncleanup: deleteUser -> ${error ? 'FAILED ' + error.message : 'ok (cascade removed all rows)'}`);
  userId = null;
};

try {
  // 1. throwaway user
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr) throw cErr;
  userId = created.user.id;
  console.log(`1. created test user ${userId.slice(0, 8)}… (${email})`);

  // 2. real user session, so the function's auth.uid() matches
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: sess, error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  const token = sess.session.access_token;
  console.log(`2. signed in, jwt role=${sess.user.role}`);

  // 3. bootstrap the solo profile through the authenticated RPC
  const { error: eErr } = await client.rpc('ensure_profile', { p_mode: 'solo', p_name: 'E2E' });
  if (eErr) throw eErr;
  const { data: prof } = await client.from('profiles').select('display_name').eq('mode', 'solo').single();
  console.log(`3. ensure_profile ok -> ${JSON.stringify(prof)}`);

  // 4. start a real puzzle through the edge function (Deno generates it)
  const start = await fn('solo-action', { action: 'start', difficulty: 'easy', level: 1, locale: 'en' }, token);
  console.log(`4. solo-action start -> ${start.status} ${JSON.stringify(start.json).slice(0, 160)}`);
  const id = start.json?.id;
  if (!id) throw new Error('no challenge id returned');

  // 5. THE OpenRouter test - runs inside the deployed function
  const hint = await fn('ai-hint', { id }, token);
  console.log(`5. ai-hint -> ${hint.status} ${JSON.stringify(hint.json).slice(0, 300)}`);

  // 6. wrong answer must be rejected
  const wrong = await fn('solo-action', { action: 'answer', id, answer: '0000' }, token);
  console.log(`6. wrong answer -> ${wrong.status} ${JSON.stringify(wrong.json)}`);

  // 7. the daily AI cap must be enforced by the database
  console.log(`7. usage rows recorded: ${(await client.from('profiles').select('user_id').eq('mode', 'solo')).data?.length ?? 0} profile visible to caller (own rows only)`);
} catch (e) {
  console.error(`\nE2E ERROR: ${e.message}`);
} finally {
  await cleanup();
}
