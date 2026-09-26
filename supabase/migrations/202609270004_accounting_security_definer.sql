-- Makes the accounting functions SECURITY DEFINER, and makes a failed read visible.
--
-- The previous migration moved these two functions into public and revoked USAGE on the
-- private schema from service_role. Both were right on their own and wrong together: the
-- functions are plain SQL, so they execute as their caller, which is service_role, and
-- service_role was about to have no USAGE on the private schema their bodies touch. The
-- result was "permission denied for schema private".
--
-- SECURITY DEFINER is the correct answer and is the pattern the rest of this schema
-- already uses for the same reason - ensure_profile and is_room_member both need to read
-- something the caller cannot. The function then runs as its owner, postgres, and reaches
-- private.ai_provider_usage. It is safe here for the same reasons it is safe there: the
-- search_path is pinned to the empty string so it can only touch what it names in full,
-- the arguments carry no user identity so there is nothing for a caller to act on, and
-- EXECUTE is revoked from anon and authenticated so only the edge functions can call it.
alter function public.record_ai_provider_use(text, integer, integer, integer, boolean) security definer;
alter function public.ai_provider_today() security definer;

comment on function public.ai_provider_today() is
  'Today''s spend per free AI provider. SECURITY DEFINER because it reads a table in the '
  'private schema that the calling role may not use, and safe because it returns only '
  'operational counters - no player data - and is revoked from anon and authenticated.';

-- The USAGE grant is not restored: these functions no longer need it, since they no
-- longer run as the caller. Leaving it revoked keeps exactly one role able to reach the
-- private schema directly, which is the property worth preserving.
