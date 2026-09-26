-- Moves the AI accounting functions into public, where the edge functions can reach them.
--
-- PostgREST only searches the schemas it is configured to expose, and on this project
-- that is public. A function in private is unreachable no matter what it is granted: the
-- call fails with "Could not find the function public.ai_provider_today in the schema
-- cache" - naming public, because public is all it looked in. Adding a USAGE grant for
-- service_role on the private schema, which was the first attempt, changed nothing.
--
-- The other private functions are unaffected because they are never called through
-- PostgREST: advance_room and buy_item are invoked from inside room_action and
-- solo_action, which are SECURITY DEFINER owned by postgres, so postgres runs them as
-- ordinary SQL and a schema grant is irrelevant.
--
-- The data does not move. private.ai_provider_usage stays in the private schema with RLS
-- on and no policy, so it cannot be read or written through PostgREST by anything. Only
-- these two thin functions touch it, and only as postgres.
--
-- They are safe to expose in public precisely because they carry no user identity: there
-- is nothing in the arguments for a caller to act on, and the numbers are operational
-- counters rather than anyone's data. EXECUTE is still revoked from anon and
-- authenticated, so record_ai_provider_use cannot be called by a client to inflate a
-- counter and lock the AI features out for everyone.
drop function if exists private.record_ai_provider_use(text, integer, integer, integer, boolean);
drop function if exists private.ai_provider_today();

create or replace function public.record_ai_provider_use(
  p_provider text,
  p_requests integer default 1,
  p_tokens_in integer default 0,
  p_tokens_out integer default 0,
  p_exhausted boolean default false
) returns void
language sql
set search_path = ''
as $$
  insert into private.ai_provider_usage(provider, day, requests, tokens_in, tokens_out, exhausted, exhausted_at, updated_at)
  values (
    p_provider, current_date, p_requests, p_tokens_in, p_tokens_out,
    p_exhausted, case when p_exhausted then clock_timestamp() else null end, clock_timestamp()
  )
  on conflict (provider, day) do update
    set requests = private.ai_provider_usage.requests + excluded.requests,
        tokens_in = private.ai_provider_usage.tokens_in + excluded.tokens_in,
        tokens_out = private.ai_provider_usage.tokens_out + excluded.tokens_out,
        exhausted = private.ai_provider_usage.exhausted or excluded.exhausted,
        exhausted_at = case
          when excluded.exhausted and private.ai_provider_usage.exhausted_at is null
            then clock_timestamp()
          else private.ai_provider_usage.exhausted_at
        end,
        updated_at = clock_timestamp();
$$;

create or replace function public.ai_provider_today()
returns table (provider text, requests integer, tokens_in integer, tokens_out integer, exhausted boolean)
language sql
stable
set search_path = ''
as $$
  select u.provider, u.requests, u.tokens_in, u.tokens_out, u.exhausted
  from private.ai_provider_usage u
  where u.day = current_date;
$$;

revoke all on function public.record_ai_provider_use(text, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.record_ai_provider_use(text, integer, integer, integer, boolean) to service_role;

revoke all on function public.ai_provider_today() from public, anon, authenticated;
grant execute on function public.ai_provider_today() to service_role;

comment on function public.record_ai_provider_use(text, integer, integer, integer, boolean) is
  'Records one attempt against a free AI provider. Lives in public only because PostgREST '
  'cannot reach the private schema; the data it writes stays in private, and EXECUTE is '
  'withheld from anon and authenticated so a client cannot inflate a counter.';

-- The USAGE grant from the previous migration is not needed now that nothing in private
-- is called through PostgREST, and leaving it would mean one fewer thing to reason about
-- if the private schema is ever opened up by accident.
revoke usage on schema private from service_role;
