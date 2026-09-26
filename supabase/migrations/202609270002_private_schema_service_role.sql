-- Lets the edge functions reach the private schema's own functions.
--
-- private.ai_provider_usage, private.record_ai_provider_use and
-- private.ai_provider_today were created with no USAGE grant for service_role, because
-- the pattern copied from the rest of this schema is "the private schema is granted to
-- nobody". That is right for anon and authenticated and wrong for service_role.
--
-- The other private functions - advance_room and buy_item - are never called by an edge
-- function directly. They are called from inside room_action and solo_action, which are
-- SECURITY DEFINER owned by postgres, so postgres executes them and never needs a grant.
-- The accounting functions are different: the router calls them straight through PostgREST
-- as service_role, and PostgREST resolves a call by searching the schemas the calling role
-- may use. With no USAGE, the call failed with "Could not find the function in the schema
-- cache" - and because the router treats a failed read as "no spend recorded", every
-- provider looked permanently untouched and the exhaustion memory never worked.
--
-- service_role is the role the three edge functions run as, it already owns these tables
-- and bypasses RLS on them, and it is the Supabase platform role. Granting it USAGE on the
-- schema grants no access to anon or authenticated, which are still revoked and still have
-- no policy on anything here.
grant usage on schema private to service_role;

-- Stated explicitly rather than left implied, because the failure mode is silent: a
-- missing EXECUTE grant looks exactly like a table with no rows.
grant execute on function private.record_ai_provider_use(text, integer, integer, integer, boolean) to service_role;
grant execute on function private.ai_provider_today() to service_role;
