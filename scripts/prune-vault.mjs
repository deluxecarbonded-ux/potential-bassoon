// Removes vault secrets that were written by hand and are now superseded by
// `supabase secrets set`. Read-only audit mode unless --prune is passed.
import pg from 'pg';

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
         case when name = 'OPENROUTER_API_KEY' then '<redacted>' else decrypted_secret end as value,
         created_at
  from vault.decrypted_secrets order by name
`);

console.log(`vault.decrypted_secrets holds ${rows.length} row(s):`);
for (const r of rows) console.log(`  ${r.name.padEnd(26)} ${r.value}  (${r.created_at.toISOString?.() ?? r.created_at})`);

if (process.argv.includes('--prune')) {
  const { rowCount } = await c.query(`
    delete from vault.decrypted_secrets
    where name in ('OPENROUTER_API_KEY','OPENROUTER_FREE_MODELS','ALLOWED_ORIGINS','APP_URL')`);
  console.log(`\npruned ${rowCount} superseded row(s); the platform-managed copies are untouched.`);
}

await c.end();
