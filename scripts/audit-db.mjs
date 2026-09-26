// Prints the game's database structure, for reading and for review.
//
//   npm run audit:db
//
// Everything here is read-only. It is the human-facing companion to
// verify:schema: that one proves supabase/schema.sql matches what is running, and
// this one shows you what is running, in a form a person can read without writing a
// query. If the two ever disagree, the file is wrong.
import pg from 'pg';

const c = new pg.Client({
  host: `aws-0-${process.env.SB_REGION || 'us-east-1'}.pooler.supabase.com`,
  port: 5432, user: `postgres.${process.env.SB_REF}`,
  database: 'postgres', password: process.env.SB_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
});
await c.connect();

const q = async (label, sql, show) => {
  const { rows } = await c.query(sql);
  console.log(`\n=== ${label} (${rows.length}) ===`);
  if (show) rows.forEach((r) => console.log('  ' + show(r)));
  return rows;
};

// The three private tables are withheld from realtime on purpose, so they are listed
// separately rather than being quietly missing from the publication output above.
await q('schemas', `select nspname from pg_namespace
  where nspname not like 'pg\\_%' and nspname <> 'information_schema' order by 1`,
  (r) => r.nspname);

const tables = await q('tables', `
  select n.nspname||'.'||c.relname as t, c.relrowsecurity as rls,
         case c.relreplident when 'f' then 'FULL' when 'd' then 'default' else c.relreplident end as repl
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('public','private') order by 1`,
  (r) => `${r.t.padEnd(28)} rls=${String(r.rls).padEnd(5)} replica_identity=${r.repl}`);

for (const t of tables.map((x) => x.t)) {
  const { rows } = await c.query(`
    select a.attname, format_type(a.atttypid,a.atttypmod) as typ, a.attnotnull as nn,
           pg_get_expr(d.adbin,d.adrelid) as def
    from pg_attribute a left join pg_attrdef d
      on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
    order by a.attnum`, [t]);
  console.log(`\n  --- ${t} ---`);
  for (const r of rows) {
    console.log(`    ${r.attname.padEnd(20)} ${String(r.typ).padEnd(26)} ${r.nn ? 'NOT NULL' : '        '} ${r.def || ''}`);
  }
}

await q('policies', `select schemaname||'.'||tablename as t, policyname, cmd, roles::text as roles,
    coalesce(qual,'-') as using, coalesce(with_check,'-') as check
  from pg_policies where schemaname in ('public','private') order by 1,2`,
  (r) => `${r.t.padEnd(24)} ${r.policyname.padEnd(20)} ${r.cmd.padEnd(6)} ${r.roles.padEnd(24)} using=${String(r.using).slice(0, 70)}`);

await q('foreign keys', `
  select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def
  from pg_constraint where contype='f' and connamespace in ('public'::regnamespace,'private'::regnamespace)
  order by 1,2`, (r) => `${r.t.padEnd(24)} ${r.conname}`);

await q('indexes', `select schemaname||'.'||indexname as i, indexdef
  from pg_indexes where schemaname in ('public','private') order by 1`,
  (r) => r.i.padEnd(46) + ' ' + r.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ /, ''));

await q('functions', `
  select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as sig,
         case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as sec,
         p.provolatile::text as vol, coalesce(array_to_string(p.proacl,E'\n'),'-') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private') order by 1`,
  (r) => `${r.sig.padEnd(44)} ${r.sec.padEnd(17)} vol=${r.vol}  ${String(r.acl).replace(/\n/g, ' ')}`);

await q('table grants', `
  select table_name, grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_schema in ('public','private') and grantee in ('anon','authenticated','service_role')
  group by 1,2 order by 1,2`,
  (r) => `${r.table_name.padEnd(24)} ${r.grantee.padEnd(15)} ${r.privs}`);

const published = await q('realtime publication', `
  select schemaname||'.'||tablename as t from pg_publication_tables
  where pubname='supabase_realtime' and schemaname in ('public','private') order by 1`,
  (r) => r.t);
const withheld = tables.map((t) => t.t).filter((t) => !published.some((p) => p.t === t));
console.log(`\n=== withheld from realtime, on purpose (${withheld.length}) ===`);
for (const t of withheld) console.log(`  ${t}`);

await q('row counts', `
  select 'public.profiles' t, count(*) n from public.profiles
  union all select 'public.wallets', count(*) from public.wallets
  union all select 'public.inventory', count(*) from public.inventory
  union all select 'public.transactions', count(*) from public.transactions
  union all select 'public.solo_progress', count(*) from public.solo_progress
  union all select 'public.rooms', count(*) from public.rooms
  union all select 'public.room_players', count(*) from public.room_players
  union all select 'public.round_questions', count(*) from public.round_questions
  union all select 'public.catalog', count(*) from public.catalog
  union all select 'private.solo_challenges', count(*) from private.solo_challenges
  union all select 'private.round_answers', count(*) from private.round_answers
  union all select 'private.ai_usage', count(*) from private.ai_usage`,
  (r) => `${r.t.padEnd(28)} ${r.n}`);

await q('the answers must be unreachable', `
  select has_table_privilege('anon','private.round_answers','select') as anon_answers,
         has_table_privilege('authenticated','private.solo_challenges','select') as player_answers,
         has_schema_privilege('authenticated','private','usage') as player_reaches_private,
         (select count(*) from pg_policies where schemaname='private') as private_policies`,
  (r) => `anon can read match answers: ${r.anon_answers}   player can read solo answers: ${r.player_answers}   player reaches the private schema: ${r.player_reaches_private}   policies in private: ${r.private_policies}`);

await c.end();
