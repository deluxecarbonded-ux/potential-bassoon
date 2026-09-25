// Writes Supabase Edge Function secrets into Vault (the same store the dashboard
// uses). Secrets become environment variables for deployed functions automatically.
//
//   $env:SB_DB_PASSWORD='...'  $env:OPENROUTER_API_KEY='sk-or-v1-...'  node scripts/set-secrets.mjs
import pg from 'pg';

const SECRETS = [
  { name: 'OPENROUTER_API_KEY', value: process.env.OPENROUTER_API_KEY, desc: 'OpenRouter API key for the ai-hint edge function.' },
  {
    name: 'OPENROUTER_FREE_MODELS',
    // The function keeps only `openrouter/free` or `:free` ids, max 5. Verified live:
    // `openrouter/free` routes to a healthy provider per request; the named free
    // models were 429/403 at the time of writing and only act as backstops.
    value: 'openrouter/free,qwen/qwen3.8-27b:free,google/gemma-4-31b-it:free,z-ai/glm-5.2:free',
    desc: 'Comma-separated free-only model route list for ai-hint.',
  },
  { name: 'ALLOWED_ORIGINS', value: 'http://localhost:5173,http://127.0.0.1:5173', desc: 'CORS origins allowed to call the edge functions.' },
  { name: 'APP_URL', value: 'http://localhost:5173', desc: 'Sent to OpenRouter as HTTP-Referer for attribution.' },
];

const missing = SECRETS.filter((s) => !s.value);
if (missing.length) {
  console.error(`Missing values for: ${missing.map((s) => s.name).join(', ')}`);
  process.exit(2);
}

const c = new pg.Client({
  host: `aws-0-${process.env.SB_REGION || 'us-east-1'}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${process.env.SB_REF || 'xcldkdvbfsvfveqioarj'}`,
  database: 'postgres',
  password: process.env.SB_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await c.connect();

// create_secret has no upsert, so replace any existing row for the same name.
await c.query('create extension if not exists pgcrypto');
for (const s of SECRETS) {
  await c.query('delete from vault.decrypted_secrets where name = $1', [s.name]);
  await c.query('select vault.create_secret($1, $2, $3)', [s.value, s.name, s.desc]);
}

const { rows } = await c.query(`
  select name,
         case when name = 'OPENROUTER_API_KEY'
              then left(decrypted_secret, 11) || '...' || right(decrypted_secret, 4)
              else decrypted_secret end as value
  from vault.decrypted_secrets order by name
`);

console.log('Vault secrets now set:');
for (const r of rows) console.log(`  ${r.name.padEnd(24)} = ${r.value}`);
await c.end();
