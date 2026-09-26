-- Removes every trace of hosted AI.
--
-- The project no longer calls a model. Hints are written on the reader's own device by
-- src/ai, from committed weights, and the build agent plans in the browser too. That
-- leaves three kinds of leftover here, and all of them are dead weight:
--
--   private.ai_provider_usage   the per-provider ledger the router wrote to, so it could
--                               remember which provider had already said no for the day
--   record_ai_provider_use     written only by _shared/router.ts
--   ai_provider_today          read only by _shared/router.ts
--
-- And two that predate the router:
--
--   public.ai_hint_context      existed to hand a model the puzzle as JSON, and to cap
--                               requests per player per day. The cap is gone with the thing
--                               it was capping, and the function had no other caller: the
--                               browser asks solo-action for a hint, which returns the
--                               stored one.
--   private.ai_usage            the per-player daily counter that cap wrote to
--
-- Nothing in the application reads any of these after this migration, and the grants go
-- with the objects rather than being left behind, so a future function cannot pick up an
-- execute privilege on something that no longer has a purpose.
--
-- Reversible in the sense that matters: this is a drop, and the data in these tables was
-- only ever an accounting of requests this project made to itself. Nothing a player typed
-- is in here, and no puzzle, profile, wallet or progress row is touched.

-- ── the provider ledger and its two functions ────────────────────────────────────────────
drop table if exists private.ai_provider_usage;
drop function if exists public.record_ai_provider_use(text, integer, integer, integer, boolean);
drop function if exists public.ai_provider_today();
-- The private twins were dropped and recreated in public by 202609270003; these drop
-- statements are for a database that never got that far.
drop function if exists private.record_ai_provider_use(text, integer, integer, integer, boolean);
drop function if exists private.ai_provider_today();

-- ── the per-player hint allowance ───────────────────────────────────────────────────────
drop function if exists public.ai_hint_context(uuid, uuid);
drop table if exists private.ai_usage;

-- Nothing else needs adjusting. public.rls_auto_enable() is an event trigger that reads
-- pg_event_trigger_ddl_commands() and matches on schema name, so it never named these
-- tables and does not care that they are gone; the two private tables had no policies and
-- no grants to anon or authenticated, so there is no policy or grant to drop alongside
-- them.
