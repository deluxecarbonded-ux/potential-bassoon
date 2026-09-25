// Creates a throwaway user and prints a ready-to-inject supabase-js session for the
// browser, so a real puzzle can be loaded and inspected in Arabic.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SB_URL;
const pat = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SB_REF;

const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${pat}` },
})).json();
const serviceKey = keys.find((k) => k.name === 'service_role').api_key;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const email = `rtl-${Date.now()}@mailinator.com`;
const password = `Rtl-${Math.random().toString(36).slice(2)}!x`;
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) { console.error(error.message); process.exit(1); }

const client = createClient(url, process.env.SB_ANON_KEY, { auth: { persistSession: false } });
const { data: sess, error: sErr } = await client.auth.signInWithPassword({ email, password });
if (sErr) { console.error(sErr.message); process.exit(1); }

// ensure_profile so the play screen is not gated on a missing profile
await client.rpc('ensure_profile', { p_mode: 'solo', p_name: 'RTL' });

const s = sess.session;
console.log(JSON.stringify({
  access_token: s.access_token,
  refresh_token: s.refresh_token,
  expires_at: s.expires_at,
  expires_in: s.expires_in,
  token_type: s.token_type,
  user: s.user,
}));
