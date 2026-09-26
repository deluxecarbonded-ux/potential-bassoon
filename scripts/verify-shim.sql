-- Rebuilds supabase/schema.sql into an empty database and diffs the result against
-- production: table by table, column by column, constraint by constraint, policy by
-- policy, function by function, grant by grant.
--
-- A schema file that has never been executed is a document. This makes it a test:
-- if the file and the running database disagree anywhere, this fails and says where.
--
-- The scratch database needs four things Supabase normally provides. They are set up
-- here and are deliberately NOT part of schema.sql, because they are the platform's
-- job and not the game's:
--   auth.users        so the foreign keys resolve
--   auth.uid()        so the policies and ensure_profile can be created
--   anon, authenticated, service_role   so every grant in section 5 has a role
--   supabase_realtime the publication, so section 6 can add tables to it
--
-- The rls_auto_enable event trigger is created by the file but its trigger is not,
-- because an event trigger cannot be fired by a query and therefore has no effect on
-- the structure being compared.
--
--   npm run verify:schema

create schema if not exists auth;

-- The minimum of Supabase's auth schema the game depends on.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
  language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role', true), 'anon') $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
