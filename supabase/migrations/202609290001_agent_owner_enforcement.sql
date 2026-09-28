-- Agent ownership, and the username it is looked up by.
--
-- public.agent_owners arrived in 202609280002_agent_owner and nothing ever read it. The agent
-- edge function authenticated any signed-in player and the /agent route carried no gate at
-- all, so the table was a list of names rather than a permission, and reading it was in fact
-- open to every signed-in player. This makes it the thing it was named after.
--
-- Two things are needed for that. Ownership has to be findable from something the caller
-- actually holds, and a session is the only thing that is: the address Supabase keys the
-- account on is derived from the username and is not the one the player types, so a row
-- keyed on an address alone cannot be matched from the browser. Hence a canonical
-- `username` on the profile, and a row that may name its owner by either that or an address.
--
-- The check itself cannot live here. It runs where the request arrives - the edge function
-- and the route - and this only has to make the answer available to both, which is the
-- is_agent_owner() below.
--
-- The file for 202609280002 is missing from this repository although the migration log
-- records it as applied, so this creates the table when it is absent as well as upgrading
-- it. That is what lets a freshly pushed database arrive correct rather than a table short.

-- ------------------------------------------------------------------ the canonical name

-- display_name cannot be what an owner is named by. It is the cosmetic name, the player can
-- rename it, and the name shown to other people is deliberately not the sign-in form. An
-- owner row pointing at it would hand the agent to whoever picked up the name next.
create or replace function public.username_slug(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v text;
begin
  v := lower(btrim(coalesce(p_name, '')));
  v := regexp_replace(v, '[^a-z0-9._-]+', '-', 'g');
  v := btrim(v, '._-');
  v := btrim(left(v, 24), '._-');
  -- Two players may pick the same display name, and a two-letter name cannot satisfy the
  -- format on its own, so the floor is a real name rather than a rejected insert.
  if char_length(v) < 3 then v := 'player'; end if;
  return v;
end;
$$;

alter table public.profiles add column if not exists username text;

-- Backfilled from display_name, which is the closest thing to a username that already
-- existed: signup derives the account address from it, so it was the identity in all but
-- name. The loop rather than a single update because two rows may slug to the same string
-- and the index below will not allow it - the suffix keeps the row and says which it was.
do $$
declare r record; taken text[] := '{}'; base text; candidate text; n int;
begin
  for r in select user_id, mode, display_name from public.profiles order by user_id, mode loop
    base := public.username_slug(r.display_name);
    candidate := base; n := 1;
    while candidate = any(taken) loop
      n := n + 1;
      candidate := left(base, 24 - char_length('-' || n)) || '-' || n;
    end loop;
    taken := taken || candidate;
    update public.profiles set username = candidate
     where user_id = r.user_id and mode = r.mode and username is distinct from candidate;
  end loop;
end;
$$;

alter table public.profiles alter column username set not null;

-- The same shape src/state.tsx accepts, so a name that passed the form still passes here.
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' and char_length(username) between 3 and 24);

-- Unique across the whole table, not per mode, and that is a deliberate change.
-- profiles is keyed (user_id, mode) because solo and arena are separate registrations, and
-- the same username has always been allowed in both - two accounts, two passwords, two
-- rows. A global index forbids that: the second registration now collides on the username.
-- It is the cost of an owner lookup that resolves to exactly one person, which a per-mode
-- index cannot promise. If registering one name in both modes matters more than that, drop
-- this index and make agent_owner_match match on (o.username, p.mode) instead.
create unique index if not exists profiles_username_key on public.profiles(username);

comment on column public.profiles.username is
  'The account name, lowercased, and what an agent owner row is matched on. Written once '
  'when the profile is created and not editable afterwards, unlike display_name which the '
  'player may rename and which is what other people see.';

-- The signup path, so a new account carries a name that ownership can be matched against.
-- The conflict target is named because an unqualified on conflict do nothing would swallow
-- the username collision as quietly as the row it was meant to skip, leaving a player with
-- a session and no profile.
create or replace function public.ensure_profile(p_mode text, p_name text default 'Explorer')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare inserted integer;
begin
  if auth.uid() is null or p_mode not in ('solo','arena') then raise exception 'Unauthorized'; end if;
  begin
    insert into public.profiles(user_id,mode,display_name,username)
    values(auth.uid(),p_mode,left(coalesce(nullif(trim(p_name),''),'Explorer'),24),public.username_slug(p_name))
    on conflict (user_id,mode) do nothing;
  exception when unique_violation then
    -- Phrased for the one test the signup form makes, so a taken name is reported as a
    -- taken name instead of arriving as a failed request.
    raise exception 'That username is already registered';
  end;
  get diagnostics inserted=row_count;
  if inserted=1 then
    insert into public.wallets(user_id,mode) values(auth.uid(),p_mode);
    if p_mode='solo' then
     -- Transparent starter tools, not currency or fabricated progress.
     insert into public.inventory(user_id,mode,item_id,quantity) values(auth.uid(),'solo','hint',2),(auth.uid(),'solo','digit',1);
    end if;
  end if;
end;
$$;

-- ------------------------------------------------------------------------ the owners

create table if not exists public.agent_owners (
  email text primary key,
  granted_at timestamptz not null default now(),
  note text,
  constraint agent_owners_email_clean check (email = lower(btrim(email)) and email like '%@%')
);

alter table public.agent_owners enable row level security;

-- The second way to name an owner, for the case that matters most: the account address is
-- derived from the username and is not an address the player typed, so an owner row holding
-- only one cannot be checked from the browser without also holding the derivation.
alter table public.agent_owners add column if not exists username text;

alter table public.agent_owners drop constraint if exists agent_owners_username_clean;
alter table public.agent_owners
  add constraint agent_owners_username_clean
  check (username is null or (username ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' and char_length(username) between 3 and 24));

-- Unique, so a username resolves to one owner row and the match below cannot be ambiguous.
create unique index if not exists agent_owners_username_key
  on public.agent_owners(username) where username is not null;

comment on column public.agent_owners.username is
  'Matches public.profiles.username, so an owner can be named by the name they sign in '
  'with as well as by an address. At least one of email and username must be present for '
  'the row to mean anything, which is why neither is allowed to be the whole identity.';

-- Reading the table used to be open to any signed-in player, which published every owner's
-- address to anyone who asked. Ownership is a yes/no question about the caller, so it is
-- answered by a function instead and the rows themselves are no longer readable.
drop policy if exists read_agent_owners on public.agent_owners;
revoke all on public.agent_owners from anon, authenticated;
grant select on public.agent_owners to service_role;

-- The match itself, in one place, so the browser and the edge function cannot disagree
-- about who the owner is. p_email is passed in rather than read from the JWT because the
-- edge function authenticates with the service role and has no auth.uid() of its own.
create or replace function public.agent_owner_match(p_user uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.agent_owners o
     where (p_email is not null and o.email = lower(btrim(p_email)))
        or exists (select 1 from public.profiles p
                    where p.user_id = p_user and p.username = o.username)
  );
$$;

revoke all on function public.agent_owner_match(uuid, text) from public, anon, authenticated;
grant execute on function public.agent_owner_match(uuid, text) to service_role;

-- What the browser asks. It can only ever be answered about the caller, because the
-- arguments come from the session rather than from the request.
create or replace function public.is_agent_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.agent_owner_match(auth.uid(), auth.jwt() ->> 'email');
$$;

revoke all on function public.is_agent_owner() from public, anon;
grant execute on function public.is_agent_owner() to authenticated;
