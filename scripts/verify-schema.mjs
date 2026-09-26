// Proves supabase/schema.sql is the schema of record, by rebuilding it into an empty
// database and diffing the result against production.
//
//   npm run verify:schema
//
// A consolidated schema file that has never been executed is a document. This makes
// it a test. Every difference is printed, and the exit code is non-zero if there is
// any, so a schema that has drifted cannot be shipped believing it is complete.
//
// What is compared:
//   tables, and for each: every column with its type, nullability and default
//   primary keys, unique constraints, check constraints and foreign keys
//   indexes
//   whether RLS is on
//   every policy: name, command, roles, using and with check
//   every function: signature, volatility, security definer, search_path
//   every table grant for anon, authenticated and service_role
//   the realtime publication
//
// What is not compared, and why:
//   the private schema's RLS event trigger, which has no effect on structure
//   sequence values, which depend on insert history
//   auth.* and the platform's own grants, which belong to Supabase
import pg from 'pg';
import { readFileSync } from 'node:fs';

const REF = 'xcldkdvbfsvfveqioarj';
const REGION = process.env.SB_REGION || 'us-east-1';
const PW = process.env.SB_DB_PASSWORD;
const SCRATCH = 'exotic_schema_verify';
if (!PW) { console.error('Set SB_DB_PASSWORD before running.'); process.exit(2); }

const connect = (database) => new pg.Client({
  host: `aws-0-${REGION}.pooler.supabase.com`, port: 5432, user: `postgres.${REF}`,
  database, password: PW, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000,
});

// The signature of one database's game structure, as sorted comparable lines.
const SIGNATURE = `
with tabs as (
  select c.oid, n.nspname||'.'||c.relname as t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('public','private')
)
select 'TABLE '||t from tabs
union all
select '  RLS '||n.nspname||'.'||c.relname||'='||c.relrowsecurity::text
from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname in ('public','private')
union all
select '  COLUMN '||t||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)
       ||' notnull='||a.attnotnull::text||' default='||coalesce(pg_get_expr(d.adbin,d.adrelid),'-')
from tabs tb
  join pg_attribute a on a.attrelid = tb.oid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attnum > 0 and not a.attisdropped
union all
select '  CONSTRAINT '||conrelid::regclass::text||' '||conname||' '||pg_get_constraintdef(oid)
from pg_constraint where connamespace in ('public'::regnamespace,'private'::regnamespace)
union all
select '  INDEX '||schemaname||'.'||indexname||' '||regexp_replace(indexdef, 'USING btree', 'btree')
from pg_indexes where schemaname in ('public','private')
union all
select '  POLICY '||schemaname||'.'||tablename||'.'||policyname||' '||cmd
       ||' roles='||roles::text||' using='||coalesce(qual,'-')||' check='||coalesce(with_check,'-')
from pg_policies where schemaname in ('public','private')
union all
select '  FUNCTION '||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
       ||' vol='||p.provolatile::text||' definer='||p.prosecdef::text
       ||' path='||coalesce(array_to_string(p.proconfig,','),'-')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private')
union all
select '  GRANT '||table_name||' '||grantee||' '||privilege_type
from information_schema.role_table_grants
where table_schema in ('public','private')
  and grantee in ('anon','authenticated','service_role')
union all
select '  REALTIME '||schemaname||'.'||tablename
from pg_publication_tables where pubname = 'supabase_realtime'
`;

async function signature(client) {
  const { rows } = await client.query(SIGNATURE);
  return rows.map((r) => Object.values(r)[0]).sort();
}

const admin = connect('postgres');
await admin.connect();
let scratch = null;
let drift = 0;

try {
  // A stale database from a failed run would make the rebuild lie about success, and
  // the connection pooler keeps sessions alive, so the drop is forced rather than
  // politely asked for.
  await admin.query(`drop database if exists ${SCRATCH} with (force)`);
  await admin.query(`create database ${SCRATCH}`);
  console.log(`  scratch database: ${SCRATCH}\n`);

  scratch = connect(SCRATCH);
  await scratch.connect();
  console.log('  applying the platform shim (auth schema, roles, publication)...');
  await scratch.query(readFileSync(new URL('./verify-shim.sql', import.meta.url), 'utf8'));

  console.log('  applying supabase/schema.sql...');
  const file = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  try {
    await scratch.query(file);
  } catch (e) {
    console.log(`\n  THE FILE DID NOT APPLY\n  ${e.message}`);
    if (e.position) {
      const p = Number(e.position);
      console.log(`  near: ...${file.slice(Math.max(0, p - 160), p + 160).replace(/\n/g, ' ')}...`);
    }
    process.exitCode = 1;
    drift++;
  }

  if (!drift) {
    console.log('  the file applied cleanly\n');
    const built = await signature(scratch);
    const live = await signature(admin);

    const builtSet = new Set(built);
    const liveSet = new Set(live);
    const onlyLive = live.filter((l) => !builtSet.has(l));
    const onlyBuilt = built.filter((b) => !liveSet.has(b));

    console.log(`  rebuilt from the file : ${built.length} structural facts`);
    console.log(`  live in production    : ${live.length} structural facts\n`);

    if (onlyBuilt.length) {
      console.log(`  IN THE FILE BUT NOT IN PRODUCTION (${onlyBuilt.length}):`);
      for (const l of onlyBuilt) console.log(`    + ${l}`);
    }
    if (onlyLive.length) {
      console.log(`  IN PRODUCTION BUT NOT IN THE FILE (${onlyLive.length}):`);
      for (const l of onlyLive) console.log(`    - ${l}`);
    }
    if (!onlyBuilt.length && !onlyLive.length) {
      console.log('  IDENTICAL. The file is the schema of record.\n');
    } else {
      console.log('');
      drift = onlyBuilt.length + onlyLive.length;
    }
  }
} finally {
  if (scratch) {
    try { await scratch.end(); } catch { /* already closed */ }
  }
  // Forced, because the pooler holds sessions open on a database it connected to
  // moments ago and a leftover scratch database would be silently reused next run.
  try { await admin.query(`drop database if exists ${SCRATCH} with (force)`); console.log('  scratch database dropped'); }
  catch (e) { console.log(`  could not drop the scratch database: ${e.message}`); }
  await admin.end();
}

process.exit(drift ? 1 : 0);
