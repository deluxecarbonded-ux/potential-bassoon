// Removes the throwaway account created for RTL/bidi inspection.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SB_URL;
const ref = process.env.SB_REF;
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
})).json();
const serviceKey = keys.find((k) => k.name === 'service_role').api_key;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const email = process.argv[2];
if (!email) { console.error('pass the email to delete'); process.exit(2); }

const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) { console.error(error.message); process.exit(1); }
const user = data.users.find((u) => u.email === email);
if (!user) { console.log('no such user, nothing to delete'); process.exit(0); }

const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
console.log(delErr ? `FAILED: ${delErr.message}` : `deleted ${email} (${user.id}); ON DELETE CASCADE removed its rows`);
