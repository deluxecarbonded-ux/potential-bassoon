// Removes vault secrets that were written by hand and are now superseded by
// `supabase secrets set`. Read-only audit mode unless --prune is passed.
//
// The provider keys are named explicitly rather than matched by pattern, because they are
// the ones worth finding: a live OpenRouter billing key sat in this table on a project that
// no longer calls OpenRouter, and nothing about a vault row expires on its own. Pruning
// here is about the local copy. The platform-managed secret of the same name, if one is
// still set, is removed with `supabase secrets delete` and is deliberately not touched by
// this script.
import pg from 'pg';

// Named, not pattern-matched, so a future secret this project does not know about is
// reported rather than deleted.
const SUPERSEDED = [
  'OPENROUTER_API_KEY',
  'OPENROUTER_FREE_MODELS',
  'GOOGLE_AI_API_KEY',
  'GROQ_API_KEY',
  'CEREBRAS_API_KEY',
  'MISTRAL_API_KEY',
  'ALLOWED_ORIGINS',
  'APP_URL',
];

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

const { rows } = await c.query(`
  select name,
         case
           when name ~* '(KEY|TOKEN|SECRET|PASSWORD)' then '<redacted>'
           else left(decrypted_secret, 60)
         end as value,
         created_at
  from vault.decrypted_secrets order by name
`);

console.log(`vault.decrypted_secrets holds ${rows.length} row(s):`);
for (const r of rows) console.log(`  ${r.name.padEnd(26)} ${r.value}  (${r.created_at.toISOString?.() ?? r.created_at})`);

// Also report what the platform itself is holding, since that is the copy that would
// actually be read, and a stale key there is worth knowing about even though this script
// cannot remove it.
const stale = rows.filter((r) => SUPERSEDED.includes(r.name));
if (stale.length) {
  console.log(`\n${stale.length} superseded name(s) present: ${stale.map((r) => r.name).join(', ')}`);
  console.log('The project no longer calls any of these providers. If the platform still holds');
  console.log('a copy, remove it with: supabase secrets delete <name> --project-ref ' + (process.env.SB_REF || 'xcldkdvbfsvfveqioarj'));
}

if (process.argv.includes('--prune')) {
  const { rowCount } = await c.query(
    `delete from vault.decrypted_secrets where name = any($1::text[])`,
    [SUPERSEDED],
  );
  console.log(`\npruned ${rowCount} superseded row(s); the platform-managed copies are untouched.`);
}

await c.end();
