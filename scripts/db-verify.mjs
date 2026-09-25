// Verifies the migrated database: objects, RLS, grants, realtime publication, seed data.
import pg from 'pg';

const REF = 'xcldkdvbfsvfveqioarj';
const client = new pg.Client({
  host: `aws-0-${process.env.SB_REGION || 'us-east-1'}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${REF}`,
  database: 'postgres',
  password: process.env.SB_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();
const q = async (sql) => (await client.query(sql)).rows;

console.log('MIGRATIONS');
console.table(await q('select version, name from supabase_migrations.schema_migrations order by version'));

console.log('TABLES');
console.table(
  (await q(`select table_schema, table_name from information_schema.tables
            where table_schema in ('public','private') order by 1,2`))
);

console.log('RLS ENABLED?');
console.table(
  (await q(`select c.relname as table, c.relrowsecurity as rls
            from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind='r' order by 1`))
);

console.log('POLICIES');
console.table((await q(`select tablename, policyname from pg_policies order by 1,2`)));

console.log('FUNCTIONS');
console.table(
  (await q(`select n.nspname as schema, p.proname as function,
                   array_to_string(p.proconfig,',') as search_path, p.prosecdef as security_definer
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','private') and p.proname in
              ('is_room_member','ensure_profile','buy_item','create_solo_challenge',
               'solo_action','advance_room','room_action','ai_hint_context')
            order by 1,2`))
);

console.log('CATALOG SEED');
console.table(await q('select * from public.catalog order by mode, id'));

console.log('REALTIME PUBLICATION');
console.table(await q(`select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1`));

console.log('PRIVATE SCHEMA LEAKED TO anon/authenticated? (want none)');
console.table(
  (await q(`select table_schema, table_name, grantee
            from information_schema.role_table_grants
            where table_schema='private' and grantee in ('anon','authenticated')`))
);

console.log('PUBLIC anon/authenticated GRANTS');
console.table(
  (await q(`select table_name, grantee, string_agg(privilege_type,',' order by privilege_type) as privs
            from information_schema.role_table_grants
            where table_schema='public' and grantee in ('anon','authenticated')
            group by 1,2 order by 1,2`))
);

await client.end();
