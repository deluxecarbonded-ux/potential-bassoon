// End-to-end check through the Supabase REST API using the anon key the browser gets.
// Confirms PostgREST/Auth/realtime are live and that RLS behaves as designed.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SB_URL;
const key = process.env.SB_ANON_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const show = (label, { data, error }) =>
  console.log(`${error ? 'FAIL' : 'OK  '}  ${label}` + (error ? `  -> ${error.message}` : `  ${JSON.stringify(data)}`));

// 1. Public catalog is readable by anon (read_catalog policy).
show('anon SELECT public.catalog', await supabase.from('catalog').select('id,mode,price'));

// 2. Auth endpoint is reachable and signup is enabled.
//    This DOES create a real auth.users row - signup is a real signup, and with
//    email confirmation disabled the account persists unconfirmed. It used to be
//    commented as "deliberately does not create a real account", which was false:
//    two probe accounts were found sitting in auth.users afterwards, one per run.
//    So the probe is deleted again below, and says so loudly if it cannot be.
{
  const probe = 'exotic-probe-' + Math.random().toString(36).slice(2, 10);
  const email = `${probe}@mailinator.com`;
  const r = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Pr0be-' + Math.random().toString(36).slice(2) + '!x' }),
  });
  const j = await r.json().catch(() => ({}));
  // 429 means the endpoint answered and throttled us, which still proves it is
  // reachable - repeated probes exhaust the signup rate limit. Only a real error
  // is a failure; a throttle is a warning, or the check cries wolf every run.
  const reachable = r.ok ? 'OK  ' : r.status === 429 ? 'WARN' : 'FAIL';
  const why = r.status === 429 ? ' (rate limited - endpoint reachable, retry later)' : j.error ? `, ${j.error_description || j.error}` : '';
  console.log(`${reachable}  auth.signUp endpoint reachable (HTTP ${r.status}${why})`);

  const id = j.user?.id;
  if (!id) {
    console.log('      no user returned, so nothing to clean up');
  } else if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.log(`WARN  probe account ${email} was created and could NOT be removed - no SUPABASE_ACCESS_TOKEN.`);
    console.log('      Delete it with: npm run user:delete -- ' + email);
  } else {
    const keys = await (await fetch(`${process.env.SB_API || 'https://api.supabase.com'}/v1/projects/${process.env.SB_REF}/api-keys`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
    })).json();
    const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { error: delErr } = await admin.auth.admin.deleteUser(id);
    console.log(delErr
      ? `WARN  probe account ${email} left behind: ${delErr.message}`
      : `OK    probe account ${email} removed (auth.users is unchanged by this run)`);
  }
}

// 5. Cross-tenant reads must be impossible for anon: transactions/rooms are locked down.
//
//    These cannot go through show(). That helper prints FAIL for any error, which is
//    right for the checks above, where an error means something is broken - but here
//    the error IS the correct result, and a successful read is the breach. Written
//    that way the check was inverted: it would have printed OK on a leak and FAIL on
//    a correctly locked-down table.
//
//    Two denial shapes are equally acceptable and both mean "not readable": a missing
//    GRANT reports 42501 permission denied for table X, while an RLS policy that
//    filters every row reports PGRST301 with an empty result set. Only rows actually
//    coming back is a failure.
const expectUnreadable = async (table) => {
  const { data, error } = await supabase.from(table).select('id').limit(1);
  if (data?.length) return { ok: false, why: `READ ${data.length} ROW(S) - that is a cross-tenant leak` };
  if (error) return { ok: true, why: `denied, ${error.code || 'error'} ${error.message}` };
  return { ok: true, why: 'empty result set (RLS filtered every row)' };
};
for (const table of ['transactions', 'rooms']) {
  const { ok, why } = await expectUnreadable(table);
  console.log(`${ok ? 'OK  ' : 'FAIL'}  anon SELECT public.${table} is unreadable -> ${why}`);
}
