// Applies supabase/migrations/*.sql in filename order, each in its own transaction,
// recording versions in supabase_migrations.schema_migrations (CLI-compatible).
//
//   $env:SB_DB_PASSWORD='...'  ; node scripts/db-migrate.mjs            # apply pending
//   $env:SB_DB_PASSWORD='...'  ; node scripts/db-migrate.mjs --dry      # roll back, report only
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const REF = 'xcldkdvbfsvfveqioarj';
const PW = process.env.SB_DB_PASSWORD;
const REGION = process.env.SB_REGION || 'us-east-1';
const DRY = process.argv.includes('--dry');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');

if (!PW) {
  console.error('Set SB_DB_PASSWORD before running.');
  process.exit(2);
}

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
if (!files.length) {
  console.error('No migration files found.');
  process.exit(2);
}

const client = new pg.Client({
  host: `aws-0-${REGION}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${REF}`,
  database: 'postgres',
  password: PW,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();
console.log(`connected: ${REF} (${REGION})   mode: ${DRY ? 'DRY RUN' : 'APPLY'}\n`);

await client.query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
`);

const { rows: applied } = await client.query('select version, name from supabase_migrations.schema_migrations');
const done = new Set(applied.map((r) => r.version));
if (applied.length) console.log(`already applied: ${[...done].join(', ')}\n`);

let failed = 0;

for (const file of files) {
  const version = file.replace(/\.sql$/, '');
  if (done.has(version)) {
    console.log(`SKIP  ${file} (already applied)`);
    continue;
  }

  const sql = readFileSync(join(dir, file), 'utf8');
  const statements = sql
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('--'));

  // Every migration runs inside a single transaction: on error nothing is left behind.
  // --dry validates then rolls back; a real run records the version and commits.
  try {
    await client.query('begin');
    await client.query(sql);
    if (DRY) {
      await client.query('rollback');
    } else {
      await client.query('insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)', [
        version,
        statements,
        file,
      ]);
      await client.query('commit');
    }
    console.log(`${DRY ? 'WOULD APPLY' : 'APPLIED'}  ${file}  (${statements.length} statements)`);
  } catch (e) {
    try { await client.query('rollback'); } catch {}
    failed++;
    console.error(`ERROR  ${file}\n  ${e.message}`);
  }
}

await client.end();
console.log(failed ? `\n${failed} migration(s) failed.` : '\nAll migrations successful.');
process.exit(failed ? 1 : 0);
