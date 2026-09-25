// Success-rate check for the AI hint after the retry fix. Each iteration uses a
// fresh throwaway user (the DB caps hints at 10/day per user) and deletes it after.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SB_URL;
const anon = process.env.SB_ANON_KEY;
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${process.env.SB_REF}/api-keys`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
})).json();
const admin = createClient(url, keys.find((k) => k.name === 'service_role').api_key, { auth: { persistSession: false } });

const runs = Number(process.argv[2] || 5);
let ok = 0, fail = 0;
const times = [];

for (let i = 1; i <= runs; i++) {
  const email = `hint-${Date.now()}-${i}@mailinator.com`;
  const password = `H-${Math.random().toString(36).slice(2)}!x`;
  const { data: u, error: uErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (uErr) { console.log(`  ${i}: could not create user: ${uErr.message}`); continue; }
  try {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    // display_name has a check constraint of 2-24 characters; a 1-char name makes
    // ensure_profile fail and the challenge then reports "Missing profile".
    await c.rpc('ensure_profile', { p_mode: 'solo', p_name: 'Hint Probe' });
    const ch = await c.functions.invoke('solo-action', { body: { action: 'start', difficulty: 'easy', level: 1, locale: 'en' } });
    if (ch.error || !ch.data?.id) {
      let body = '';
      try { body = JSON.stringify(await ch.error?.context?.clone?.().json?.()); } catch { body = '(unreadable)'; }
      fail++;
      console.log(`  ${i}: could not create challenge -> HTTP ${ch.error?.context?.status ?? '?'} ${String(body).slice(0, 120)}`);
      continue;
    }
    const t0 = Date.now();
    const r = await c.functions.invoke('ai-hint', { body: { id: ch.data.id, locale: 'en' } });
    const ms = Date.now() - t0;
    times.push(ms);
    if (r.error) {
      fail++;
      const status = r.error.context?.status ?? '?';
      let body = '';
      try { body = JSON.stringify(await r.error.context?.clone?.().json?.()); } catch { body = '(unreadable)'; }
      console.log(`  ${i}: FAILED HTTP ${status} after ${ms}ms  ${String(body).slice(0, 90)}`);
    } else {
      ok++;
      console.log(`  ${i}: OK ${ms}ms  "${r.data.hint.slice(0, 95)}"`);
    }
  } finally {
    await admin.auth.admin.deleteUser(u.user.id);
  }
}

const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
console.log(`\n  ${ok}/${runs} succeeded, ${fail} failed, avg ${avg}ms`);
