// Read-only connectivity probe. Touches nothing.
// Usage: node scripts/db-probe.mjs
import pg from 'pg';

const REF = 'xcldkdvbfsvfveqioarj';
const PW = process.env.SB_DB_PASSWORD;
const REGION = process.env.SB_REGION || 'us-east-1';

// Supabase pooler (IPv4) requires the username postgres.<project-ref>.
const CANDIDATES = [
  { label: `pooler ${REGION}:5432 (session)`, cfg: { host: `aws-0-${REGION}.pooler.supabase.com`, port: 5432, user: `postgres.${REF}`, database: 'postgres' } },
  { label: `pooler ${REGION}:6543 (transaction)`, cfg: { host: `aws-0-${REGION}.pooler.supabase.com`, port: 6543, user: `postgres.${REF}`, database: 'postgres' } },
  { label: 'direct db.<ref>:5432 (needs IPv6)', cfg: { host: `db.${REF}.supabase.co`, port: 5432, user: 'postgres', database: 'postgres' } },
];

async function probe({ label, cfg }) {
  const client = new pg.Client({ ...cfg, password: PW, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
  try {
    await client.connect();
    const { rows } = await client.query(`
      select current_user       as connected_as,
             current_database() as db,
             inet_server_addr()::text as server_addr,
             (select count(*) from auth.users) as auth_users
    `);
    const info = rows[0];

    // Table inventory, tolerant of an empty (unmigrated) database.
    const { rows: tables } = await client.query(`
      select table_schema || '.' || table_name as t
      from information_schema.tables
      where table_schema in ('public','private')
      order by 1
    `);
    info.public_tables = tables.map((r) => r.t);
    info.migrated = info.public_tables.includes('public.profiles');
    await client.end();
    return { label, ok: true, info: rows[0] };
  } catch (e) {
    try { await client.end(); } catch {}
    return { label, ok: false, info: { error: e.message, code: e.code } };
  }
}

if (!PW) {
  console.error('Set SB_DB_PASSWORD before running.');
  process.exit(2);
}

for (const c of CANDIDATES) {
  const r = await probe(c);
  console.log(r.ok ? `OK   ${r.label}` : `FAIL ${r.label}  ->  ${r.info.error}`);
  if (r.ok) console.log(JSON.stringify(r.info, null, 2));
  if (r.ok) break;
}
