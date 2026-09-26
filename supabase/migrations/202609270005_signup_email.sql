-- The address a player gives when signing up.
--
-- Sign in is by username alone, and the address Supabase keys the account on is
-- derived from that username rather than typed, so nothing has to look an account up
-- before a session can exist. That leaves nowhere for a real address to live:
-- auth.users holds the derived one, and profiles held only a display name. This adds
-- the column the signup form writes to.
--
-- ensure_profile is deliberately left alone. Giving it a defaulted third parameter
-- would have left the old two-argument function sitting beside it, and every
-- two-argument call would then be ambiguous, which Postgres resolves by refusing to
-- choose. A second function that delegates avoids that, and keeps the starter kit
-- granted in one place instead of copying that logic.

alter table public.profiles
  add column if not exists email text not null default '';

-- Loose on purpose. The signup form checks the shape before it submits; this is a
-- backstop against a blank or malformed value reaching the column, not a ruling on
-- which addresses are real.
alter table public.profiles drop constraint if exists profiles_email_format;
alter table public.profiles
  add constraint profiles_email_format
  check (email = '' or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

create or replace function public.ensure_profile_with_email(
  p_mode  text,
  p_name  text default 'Explorer',
  p_email text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_mode not in ('solo','arena') then raise exception 'Unauthorized'; end if;

  perform public.ensure_profile(p_mode, p_name);

  -- Guarded on email = '', so the address is written once. A later sign in from
  -- another device carries no address and cannot repoint this one, which is what
  -- would otherwise make the column a way to redirect somebody else's login.
  if length(trim(coalesce(p_email, ''))) > 0 then
    update public.profiles
       set email = left(trim(p_email), 254)
     where user_id = auth.uid() and mode = p_mode and email = '';
  end if;
end;
$$;

revoke all on function public.ensure_profile_with_email(text, text, text) from public, anon;
grant execute on function public.ensure_profile_with_email(text, text, text) to authenticated, service_role;

comment on column public.profiles.email is
  'The address given at signup. Written once, when the profile row is created, and not '
  'editable afterwards. Not the account key: sign in is by username, and the address '
  'Supabase holds is derived from it. Empty on any profile created before this column '
  'existed, which is why the check allows an empty string rather than null.';
