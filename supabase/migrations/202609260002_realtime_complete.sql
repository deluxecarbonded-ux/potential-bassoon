-- Publish the three remaining client-facing tables to realtime, and give every
-- published table a full replica identity.
--
-- Realtime was live on six tables: profiles, wallets, inventory, solo_progress,
-- rooms and room_players. Three more tables are readable by clients through an RLS
-- policy and were not published, which meant a client that subscribed to them would
-- have received nothing:
--
--   round_questions  a player who reloads mid-match, or joins a room already
--                    playing, gets the current round from this table. The policy
--                    already limits it to members, to rounds at or before the
--                    room's active_round, and to the reader's own locale, so
--                    publishing it exposes the same rows the policy already allows.
--   transactions     the player's own coin ledger. The policy limits it to their
--                    own rows, and it is the table a balance animation would watch.
--   catalog          the shop. Public by design - anon reads it - and it is static
--                    seed data, so publishing it is close to free.
--
-- REPLICA IDENTITY FULL is added for round_questions, transactions and catalog to
-- match the six that already had it. Without it a delete or update replicates only
-- the primary key, so a subscriber told "something changed" would have no way to
-- know what. These tables are small, so the storage and write amplification is the
-- right thing to pay.
--
-- The three private tables stay out, and this is the deliberate part rather than an
-- oversight:
--
--   private.round_answers    every answer to every match. Publishing it broadcasts
--                             every answer in the game to every connected client.
--   private.solo_challenges  every live solo answer. Same problem, and these are
--                             open right now.
--   private.ai_usage         one account's daily AI hint usage. Not a secret, but
--                             not anybody else's business either.
--
-- Publishing any of the first two would end the game rather than complete it. The
-- reasoning is written into supabase/schema.sql so the omission is a decision on the
-- record instead of a gap somebody fills in later.
--
-- Idempotent: re-running adds nothing that is already there.
alter publication supabase_realtime add table
  public.round_questions,
  public.transactions,
  public.catalog;

alter table public.round_questions replica identity full;
alter table public.transactions  replica identity full;
alter table public.catalog       replica identity full;

-- EXECUTE on the RLS auto-enable event trigger was granted to PUBLIC, anon and
-- authenticated. No exploit path exists - an event trigger cannot be fired by a
-- query, and only the owner can create DDL - but a SECURITY DEFINER function that
-- anonymous can execute is not something to leave lying around. Tightening it to
-- the owner. The trigger itself is unaffected: it fires as its owner.
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
