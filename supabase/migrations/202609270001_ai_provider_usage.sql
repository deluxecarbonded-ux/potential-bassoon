-- Remembers how much of each free provider's daily allowance has been spent, so the
-- router knows where the headroom is instead of finding out with a 429.
--
-- Why this is a table and not a counter in the function: an edge function isolate is
-- short-lived and there are many of them, so an in-memory tally forgets the moment one
-- recycles and every new isolate rediscovers the same exhausted provider by failing at
-- it. Persisted, a provider that said "no more today" is still known to be finished
-- after a cold start, a deploy, or an hour.
--
-- Why a provider is tracked separately from the per-player AI hint cap in
-- private.ai_usage: those are different questions. ai_usage asks "may this account ask
-- for a hint", which is a product rule - ten a day keeps a shared free tier usable by
-- everyone. This table asks "which provider can still serve anyone", which is an
-- operational fact about the providers' own allowances.
--
-- The daily ceiling recorded per provider is a planning number, deliberately
-- under-stated: the provider's real limit is enforced by the provider, and a figure that
-- is too high means the router keeps sending work to something already spent, so every
-- attempt is wasted. tokens_in is kept because the binding constraint for the build
-- agent is tokens per minute, not requests per day, and a provider with plenty of
-- requests left can still be unable to serve a 20k-token plan.
create table if not exists private.ai_provider_usage (
  provider      text    not null,
  day           date    not null default current_date,
  requests      integer not null default 0,
  tokens_in     integer not null default 0,
  tokens_out    integer not null default 0,
  -- Set when a provider answers 429, so it is skipped for the rest of the day rather than
  -- retried until the request budget for this function runs out.
  exhausted     boolean not null default false,
  exhausted_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (provider, day)
);

comment on table private.ai_provider_usage is
  'Daily spend per free AI provider, so the router can send work where there is still '
  'headroom instead of rediscovering an exhausted provider by being refused by it.';

alter table private.ai_provider_usage enable row level security;

-- No policy, which with RLS on means deny. Nothing in the client can read this: it says
-- how much of the shared free allowance is left, which is nobody's business but the
-- operator's, and the edge functions reach it with the service role.
revoke all on table private.ai_provider_usage from public, anon, authenticated;

-- Records one attempt against a provider. Increments rather than replaces, so a
-- concurrent pair of requests cannot both read the same count and each write it back.
-- An exhausted provider is not resurrected by usage, only by the day rolling over: once
-- a provider says no more today, the rest of today's traffic goes elsewhere.
create or replace function private.record_ai_provider_use(
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

-- Today's spend for every provider, in one read. The router calls this once per request
-- and orders the providers by what is left, so a call never starts by trying something
-- already known to be finished.
create or replace function private.ai_provider_today()
returns table (provider text, requests integer, tokens_in integer, tokens_out integer, exhausted boolean)
language sql
stable
set search_path = ''
as $$
  select u.provider, u.requests, u.tokens_in, u.tokens_out, u.exhausted
  from private.ai_provider_usage u
  where u.day = current_date;
$$;

revoke all on function private.record_ai_provider_use(text, integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function private.ai_provider_today() from public, anon, authenticated;
