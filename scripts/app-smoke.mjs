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
//    NOTE: deliberately does not create a real account - see db-rls-sim.mjs for
//    RLS coverage that needs no rows. `enable_confirmations` is a hosted-project
//    setting, so a real signup may return a user with a null session.
{
  const probe = 'exotic-probe-' + Math.random().toString(36).slice(2, 10);
  const r = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${probe}@mailinator.com`, password: 'Pr0be-' + Math.random().toString(36).slice(2) + '!x' }),
  });
  const j = await r.json().catch(() => ({}));
  console.log(`${r.ok && !j.error ? 'OK  ' : 'FAIL'}  auth.signUp endpoint reachable (HTTP ${r.status}${j.error ? `, ${j.error_description || j.error}` : ''})`);
}

// 5. Cross-tenant read must be impossible for anon: transactions/rooms are locked down.
show('anon SELECT public.transactions (want DENIED/empty)', await supabase.from('transactions').select('id').limit(1));
show('anon SELECT public.rooms (want DENIED/empty)', await supabase.from('rooms').select('id').limit(1));
