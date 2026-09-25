// Runtime smoke test for the deployed edge functions.
// Calls each function with no bearer token. verify_jwt=true means a valid user JWT
// is required, so the expected result is the function's own 401 {"error":"signIn"}.
// That still proves the function is live, the Deno runtime starts, and every import
// in _shared/http.ts resolves. It does NOT exercise the OpenRouter call path.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SB_URL;
const key = process.env.SB_ANON_KEY;

for (const fn of ['solo-action', 'room-action', 'ai-hint']) {
  const endpoint = `${url}/functions/v1/${fn}`;
  for (const [label, init] of [
    ['no auth header', { headers: { apikey: key, 'content-type': 'application/json' } }],
    ['OPTIONS preflight', { method: 'OPTIONS', headers: { apikey: key, origin: 'http://localhost:5173' } }],
    ['GET (want 405)', { method: 'GET', headers: { apikey: key } }],
  ]) {
    try {
      const r = await fetch(endpoint, { ...init, body: init.body ?? (init.method === 'POST' ? '{}' : undefined) });
      const text = (await r.text()).slice(0, 90);
      const want = label === 'OPTIONS preflight' ? 200 : label === 'GET (want 405)' ? 405 : 401;
      console.log(`${r.status === want ? 'OK  ' : 'WARN'}  ${fn.padEnd(12)} ${label.padEnd(18)} -> ${r.status}  ${text}`);
      if (label === 'OPTIONS preflight') {
        console.log(`               allow-origin: ${r.headers.get('access-control-allow-origin')}`);
      }
    } catch (e) {
      console.log(`FAIL  ${fn.padEnd(12)} ${label}  -> ${e.message}`);
    }
  }
}

// Confirm a bad token is rejected by the gateway itself, not just by our handler.
const r = await fetch(`${url}/functions/v1/ai-hint`, {
  method: 'POST',
  headers: { apikey: key, authorization: 'Bearer not-a-real-jwt', 'content-type': 'application/json' },
  body: '{}',
});
console.log(`\ngateway rejects a forged JWT: HTTP ${r.status} (${(await r.text()).slice(0, 60)})`);
