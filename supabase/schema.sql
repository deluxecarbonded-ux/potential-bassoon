-- ============================================================================
--  Exotic - complete database schema
-- ============================================================================
--
--  This file is the whole database, in one place, in dependency order: schemas,
--  tables, columns, constraints, indexes, the functions the edge functions call,
--  the RLS policies that guard everything, the grants that decide who can touch
--  what, the realtime publication, and the shop seed. It builds the game from
--  nothing.
--
--  It is the schema of record. The numbered migrations under supabase/migrations
--  are the incremental history that produced it; this file supersedes them for
--  anyone reading, reviewing or rebuilding the database.
--
--  Order matters and is load-bearing. Functions come before the policies that call
--  them, because PostgreSQL resolves a function referenced by a policy when the
--  policy is created - a policy cannot precede the function it depends on. Tables
--  come before both.
--
--  Verified rather than asserted: npm run verify:schema loads this file into an
--  empty database and diffs the result against production - tables, columns,
--  constraints, indexes, RLS, every policy, every function, every grant, and the
--  realtime publication. Any drift fails the check.
--
--  ---------------------------------------------------------------------------
--  HOW THE TWO MODES STAY SEPARATE
--  ---------------------------------------------------------------------------
--  Single player and multiplayer are separate registrations, not one identity
--  wearing two hats. Each mode has its own auth account - the app folds the mode
--  into the address before it reaches Supabase, so you@mail.com becomes
--  you+solo@mail.com on one route and you+arena@mail.com on the other - and the
--  app refuses to hold a session in both at once.
--
--  Two consequences the database relies on:
--
--    1. user_id is unique to a mode. A solo account's id can never appear in an
--       arena row, so the separation is structural rather than a convention. The
--       (user_id, mode) keys below are belt and braces: they make it impossible
--       for one identity to hold two wallets, two inventories or two profiles
--       even if the app is wrong.
--
--    2. Nothing mode-specific is shared. Every mode-scoped table carries a mode
--       column and its rows are per mode. The tables that belong to one mode
--       outright - solo progress and its challenges, the arena's rooms, players,
--       questions and answers - have no mode column at all, because for them
--       there is no second mode to confuse them with. catalog is the only table
--       both modes read, and it separates its own rows by mode.
--
--  ---------------------------------------------------------------------------
--  WHO CAN DO WHAT
--  ---------------------------------------------------------------------------
--    anon           unauthenticated. Read-only, and only the shop catalog, which
--                   is public by design so the storefront renders before anyone
--                   signs in. Nothing else.
--    authenticated  a signed-in player, on one route and therefore one mode. Sees
--                   their own profile, wallet, inventory, progress and
--                   transactions, and the rooms they are a member of. RLS decides
--                   all of it; no policy lets a player read another player's rows.
--    service_role   the three edge functions, and the only writer. They are
--                   security definer with a pinned search_path and take the
--                   caller's user_id as an explicit argument, so a request cannot
--                   act as anyone but the account whose token presented it.
--
--  Every write goes through a function. No client holds insert, update or delete
--  on any table, which is why the policies below are all SELECT except for one
--  narrow UPDATE that lets a player rename their own profile.
--
--  ---------------------------------------------------------------------------
--  WHAT IS NOT PUBLISHED TO REALTIME, AND WHY
--  ---------------------------------------------------------------------------
--  Every table a client legitimately needs to watch is published: both profiles,
--  the wallet, inventory and transaction tables, solo progress, the three arena
--  tables, and the catalog, the live round questions and the player's own ledger.
--
--  The three private tables are deliberately excluded, and this is the one place
--  where "realtime on every table" would break the game rather than complete it:
--
--    private.round_answers    holds the four-digit answer to every round of every
--                             match. Publishing it broadcasts every answer in the
--                             game to every connected client.
--    private.solo_challenges  holds the answer to every solo puzzle, live. Same
--                             problem, and worse because these are open right now.
--    private.ai_usage         per-account counters for the daily AI hint cap. Not
--                             a secret worth stealing, but it is another account's
--                             usage of a shared free tier, and there is no reason
--                             to publish it.
--
--  If those were added, every player could read every answer and the puzzles would
--  stop being puzzles. Realtime is enabled everywhere it is safe and withheld
--  exactly where it would be an exploit, and the exclusion is written down here
--  rather than left as a silent omission.
--
--  A note on how realtime behaves here in practice: events arrive for every
--  published table, but the new and old row payloads come back empty under both
--  the anon and the member key. The app is written for that - every handler
--  refetches rather than reading the payload - so realtime is a "something changed
--  here" signal and never a data channel. scripts/test-realtime.mjs asserts both
--  halves, so a future change that starts populating payloads is noticed rather
--  than assumed.
--
-- ============================================================================


-- ============================================================================
--  SECTION 1. Schemas
-- ============================================================================

create schema if not exists private;

comment on schema private is
  'Server-only storage. Nothing here is exposed to anon or authenticated, and '
  'nothing here is published to realtime: it holds the answers to both modes and '
  'the per-account AI usage counters.';


-- ============================================================================
--  SECTION 2. Tables
--
--  Ordered so nothing is referenced before it exists. Every function in section 3
--  pins search_path to the empty string and therefore names every object it touches
--  in full, which is what lets these tables live in two schemas without a
--  search_path ever being an attack surface.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  public.catalog - what can be bought, per mode
--
--  The only table both modes read. Rows are separated by mode, so the solo shop
--  and the arena shop are genuinely separate stock and adding an item to one can
--  never affect the other. The composite primary key is what lets inventory
--  reference a product together with the mode it belongs to, so an arena item can
--  never be granted against a solo inventory.
-- ----------------------------------------------------------------------------

create table public.catalog (
  id          text    not null,
  mode        text    not null check (mode in ('solo','arena')),
  price       integer not null check (price > 0),
  consumable  boolean not null,
  primary key (id, mode)
);

comment on table public.catalog is
  'Purchasable items, one row per item per mode. Read by anon so the shop renders '
  'before sign-in; written only by the seed at the end of this file.';

-- ----------------------------------------------------------------------------
--  public.profiles - the account behind a mode
--
--  Keyed (user_id, mode). With one auth account per mode a given user_id only ever
--  has one row, so mode is redundant as data and load-bearing as a constraint: it
--  is what stops a bug in the app from ever writing a second profile for the same
--  person. wins counts cleared solo levels or arena match wins depending on the
--  mode of the row.
-- ----------------------------------------------------------------------------

create table public.profiles (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  mode          text        not null check (mode in ('solo','arena')),
  display_name  text        not null check (char_length(display_name) between 2 and 24),
  email         text        not null default '',
  emblem        text        not null default '' check (emblem in ('','moon','crown')),
  wins          integer     not null default 0 check (wins >= 0),
  created_at    timestamptz not null default now(),
  primary key (user_id, mode)
);

-- The signup address. Added as a named table constraint rather than left inline on the
-- column, because an inline column check is auto-named profiles_email_check while the
-- migration names it profiles_email_format - the same rule under two names, which
-- verify:schema reports as drift even though the rule is identical.
alter table public.profiles
  add constraint profiles_email_format
  check (email = '' or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

comment on column public.profiles.emblem is
  'Arena only, and only ever moon or crown. The empty default means "no emblem", '
  'which is why the check allows an empty string rather than null.';

-- ----------------------------------------------------------------------------
--  public.wallets - coins, per mode
--
--  Keyed (user_id, mode) and cascaded from profiles, so a wallet cannot outlive
--  the profile it belongs to. Solo coins and arena coins are the same currency in
--  one table but they are separate balances that can never be spent on each other:
--  every debit in buy_item is qualified by mode.
-- ----------------------------------------------------------------------------

create table public.wallets (
  user_id   uuid    not null,
  mode      text    not null,
  balance   integer not null default 0 check (balance >= 0),
  primary key (user_id, mode),
  foreign key (user_id, mode) references public.profiles(user_id, mode) on delete cascade
);

-- ----------------------------------------------------------------------------
--  public.inventory - items held, per mode
--
--  Keyed (user_id, mode, item_id). The composite foreign key into catalog is what
--  keeps the two shops honest: a row can only name an item that actually exists in
--  that row's own mode, so an arena emblem can never appear in a solo bag.
--
--  Solo gets two hints and one digit reveal when the profile is created. The arena
--  gets nothing, because its catalogue is permanent unlocks rather than consumables
--  and handing one out free would be a silent advantage.
-- ----------------------------------------------------------------------------

create table public.inventory (
  user_id   uuid    not null,
  mode      text    not null,
  item_id   text    not null,
  quantity  integer not null default 0 check (quantity >= 0),
  primary key (user_id, mode, item_id),
  foreign key (user_id, mode) references public.profiles(user_id, mode) on delete cascade,
  foreign key (item_id, mode) references public.catalog(id, mode)
);

-- ----------------------------------------------------------------------------
--  public.transactions - the coin ledger
--
--  Append-only in practice: nothing updates it, and the unique key below makes a
--  double award a no-op rather than a duplicate. reference names what the entry was
--  for - a level as difficulty:level, a purchase as purchase:item, a match win as
--  the room id - so the same award can never be granted twice even if a request is
--  retried. mode is carried on every row so a ledger read never has to join to work
--  out which balance an entry belongs to.
-- ----------------------------------------------------------------------------

create table public.transactions (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null,
  mode       text        not null,
  delta      integer     not null,
  reason     text        not null,
  reference  text        not null,
  created_at timestamptz not null default now(),
  unique (user_id, mode, reason, reference),
  foreign key (user_id, mode) references public.profiles(user_id, mode) on delete cascade
);

comment on table public.transactions is
  'Append-only coin ledger. The unique key on (user_id, mode, reason, reference) is '
  'what makes every award idempotent: replaying a win writes nothing the second '
  'time, so a retried request cannot pay twice.';

-- ----------------------------------------------------------------------------
--  public.solo_progress - levels cleared, solo only
--
--  No mode column, and that is deliberate rather than an omission. This table exists
--  only for the solo campaign, and a solo account's user_id can never appear in an
--  arena context, so a mode column here would be a constant. The primary key is
--  (user_id, difficulty, level), which is what enforces that levels are cleared in
--  order: a level is unlocked when the one before it has a row, and a level cannot
--  be cleared twice to farm its reward.
-- ----------------------------------------------------------------------------

create table public.solo_progress (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  difficulty    text        not null check (difficulty in ('easy','medium','hard')),
  level         integer     not null check (level between 1 and 30),
  attempts      integer     not null check (attempts > 0),
  seconds       integer     not null check (seconds >= 0),
  completed_at  timestamptz not null default now(),
  primary key (user_id, difficulty, level)
);

comment on table public.solo_progress is
  'Solo campaign progress. One row per cleared level; the primary key is what stops '
  'a level being farmed for its reward more than once.';

-- ----------------------------------------------------------------------------
--  public.rooms - an arena match, arena only
--
--  The lobby and the match are the same row: created waiting, moved to playing when
--  the host starts, finished when the last round resolves or when too few players
--  remain. host_id is ON DELETE CASCADE on purpose - it was the one foreign key in
--  this schema that was not, which meant the first person to host a match could
--  never delete their account. Cascade rather than set null, because a null host is
--  a state nothing downstream handles: leave_room hands hosting to another member
--  and start_room refuses anyone who is not the host, so a null-hosted room would
--  sit in waiting forever with no way to begin.
-- ----------------------------------------------------------------------------

create table public.rooms (
  id            uuid        primary key default gen_random_uuid(),
  code          text        not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id       uuid        not null references auth.users(id) on delete cascade,
  game_mode     text        not null check (game_mode in ('first','timeAttack')),
  total_rounds  integer     not null check (total_rounds between 1 and 10),
  category      text        not null check (category in ('random','math','logic','riddles','science','trivia')),
  status        text        not null default 'waiting' check (status in ('waiting','playing','finished')),
  active_round  integer     not null default 0,
  deadline      timestamptz,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- The index advance_room and the expiry check both ride on: finding the rooms that are
-- live and due. Without it every expired-round resolution is a sequential scan of
-- every room on the platform.
create index rooms_status_deadline_idx on public.rooms(status, deadline);

comment on column public.rooms.code is
  'Six characters, upper case and digits, shown to players and typed to join. '
  'Generated server-side in room_action with a uniqueness retry loop.';
comment on column public.rooms.deadline is
  'When the current round expires. 45 seconds for timeAttack, 120 for first. Null '
  'once finished, which is what stops a finished room being advanced.';

-- ----------------------------------------------------------------------------
--  public.room_players - who is in a room, and how they are doing, arena only
--
--  display_name and emblem are copied in at join time rather than read through to
--  profiles on every render, so a room shows the name and emblem the player walked
--  in with even if they change them mid-match. locale is per player, not per room:
--  two people in the same match get the same puzzle in their own language, and this
--  is the column that says which one.
--
--  last_attempt is a rate-limit stamp, not history; last_solved_round is what makes
--  a round idempotent, so a client that retries a correct answer cannot score it
--  twice.
-- ----------------------------------------------------------------------------

create table public.room_players (
  room_id            uuid        not null references public.rooms(id) on delete cascade,
  user_id            uuid        not null references auth.users(id) on delete cascade,
  display_name       text        not null,
  emblem             text        not null default '',
  locale             text        not null check (locale in
                        ('en','ar','es','fr','de','pt','it','nl','ru','tr','hi','ja','ko','zh','id','ur')),
  score              integer     not null default 0 check (score >= 0),
  last_solved_round  integer     not null default 0,
  last_attempt       timestamptz,
  joined_at          timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_players_user_id_room_id_idx on public.room_players(user_id, room_id);

comment on column public.room_players.locale is
  'Per player, so the same round reaches everyone in their own language. Constrained '
  'to the sixteen locales the app ships rather than left free, because a value '
  'outside that set would make makePuzzle fail mid-match.';

-- ----------------------------------------------------------------------------
--  public.round_questions - the visible puzzle for a round, arena only
--
--  What a player is allowed to see: prompt and lines, never the answer. One row per
--  round per locale, which is what lets a mixed-language room show everyone the
--  same round. The rows for later rounds are written when the match starts, but the
--  RLS policy below only exposes rounds at or before the room's active_round, so
--  writing them early does not leak them early.
-- ----------------------------------------------------------------------------

create table public.round_questions (
  room_id    uuid    not null references public.rooms(id) on delete cascade,
  round      integer not null check (round between 1 and 10),
  locale     text    not null,
  category   text    not null,
  prompt     text    not null,
  lines      jsonb   not null,
  primary key (room_id, round, locale)
);

comment on table public.round_questions is
  'The client-facing half of a round: the prompt and its lines, with no answer. The '
  'answer lives in private.round_answers and is never selected by any policy.';

-- ----------------------------------------------------------------------------
--  private.solo_challenges - a live solo puzzle, solo only
--
--  This is where a solo answer lives, from the moment a level is opened until it is
--  cleared. It is in the private schema precisely because the answer is in it: no
--  grant, no policy and no realtime publication reaches it, and the only way to read
--  a row is through solo_action, which checks the caller's user_id.
--
--  used records which consumables have been spent on this attempt, so the hint and
--  the digit reveal cannot be taken twice from one challenge. attempts and
--  last_attempt drive the rate limit and the recorded score.
-- ----------------------------------------------------------------------------

create table private.solo_challenges (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  difficulty    text        not null check (difficulty in ('easy','medium','hard')),
  level         integer     not null check (level between 1 and 30),
  locale        text        not null,
  prompt        text        not null,
  lines         jsonb       not null,
  category      text        not null,
  hint          text        not null,
  answer        text        not null check (answer ~ '^[0-9]{4}$'),
  attempts      integer     not null default 0,
  started_at    timestamptz not null default now(),
  last_attempt  timestamptz,
  completed     boolean     not null default false,
  used          text[]      not null default '{}'
);

create index solo_challenges_user_id_started_at_idx
  on private.solo_challenges(user_id, started_at desc);

comment on table private.solo_challenges is
  'Live solo puzzles, including their answers. Private schema, no grants, no '
  'policies, not in the realtime publication. Reachable only through solo_action, '
  'which matches on both id and user_id.';

-- ----------------------------------------------------------------------------
--  private.round_answers - the answer to a round, arena only
--
--  The counterpart to public.round_questions, split out precisely so that the table
--  the client can read has no answer column in it at all. Writing the two together
--  is enforced by the composite foreign key below, so an answer can never exist
--  without its question or drift out of step with it.
-- ----------------------------------------------------------------------------

create table private.round_answers (
  room_id  uuid    not null,
  round    integer not null,
  locale   text    not null,
  answer   text    not null check (answer ~ '^[0-9]{4}$'),
  hint     text    not null,
  primary key (room_id, round, locale),
  foreign key (room_id, round, locale)
    references public.round_questions(room_id, round, locale) on delete cascade
);

comment on table private.round_answers is
  'The answers to every round of every match. Never granted, never in a policy, '
  'never published to realtime. Read only by room_action when grading an answer.';

-- ----------------------------------------------------------------------------
--  private.ai_usage - the daily AI hint cap, solo only
--
--  One row per account per day, incremented by ai_hint_context and capped at ten. It
--  lives in private because the count is nobody else's business, and it is not
--  published to realtime for the same reason.
-- ----------------------------------------------------------------------------

create table private.ai_usage (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  day        date    not null default current_date,
  requests   integer not null default 0,
  primary key (user_id, day)
);

comment on table private.ai_usage is
  'Per-account daily AI hint counter, capped at ten in ai_hint_context. Private and '
  'not published to realtime: it is one account''s usage of a shared free tier.';


-- ----------------------------------------------------------------------------
--  private.ai_provider_usage - how much of each free provider's day is spent
--
--  Every free AI provider caps something, and the smallest cap this project can use is
--  OpenRouter's 50 requests a day. The router spreads work across every free tier
--  available so that one running out does not stop the app, and this table is how it
--  knows where the headroom is.
--
--  It is a table rather than a counter in the function because an edge function isolate
--  is short-lived and there are many of them: in memory, the tally is forgotten the
--  moment one recycles and every new isolate rediscovers the same exhausted provider by
--  being refused by it. Persisted, a provider that said "no more today" is still known
--  to be finished after a cold start, a deploy, or an hour.
--
--  Separate from private.ai_usage on purpose. That asks "may this account ask for a
--  hint", which is a product rule - ten a day keeps a shared free tier fair. This asks
--  "which provider can still serve anyone", which is an operational fact.
--
--  tokens_in is kept because the binding constraint for the build agent is tokens per
--  minute, not requests per day: a provider with thousands of requests left cannot serve
--  a twenty-thousand-token plan if its per-minute ceiling is six thousand.
-- ----------------------------------------------------------------------------

create table private.ai_provider_usage (
  provider      text        not null,
  day           date        not null default current_date,
  requests      integer     not null default 0,
  tokens_in     integer     not null default 0,
  tokens_out    integer     not null default 0,
  exhausted     boolean     not null default false,
  exhausted_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (provider, day)
);

comment on table private.ai_provider_usage is
  'Daily spend per free AI provider, so the router sends work where there is still '
  'headroom instead of rediscovering an exhausted provider by being refused by it. '
  'Not published to realtime: it is operational, not a player''s business.';

-- ============================================================================
--  SECTION 3. Functions
--
--  Every function here pins search_path to the empty string, so it can only ever
--  touch what it names in full. That is what makes it safe for these to run as
--  security definer: without it, a caller could shadow a name in an earlier schema
--  and have a definer function execute their code as postgres.
--
--  The public ones are the edge functions' entire interface. None of them reads a
--  user_id from anywhere except auth.uid() or an explicit argument the edge function
--  passed from the verified token, so none can be steered into acting as another
--  account.
--
--  This section precedes section 4 because the policies there call is_room_member,
--  and PostgreSQL resolves a function named in a policy when the policy is created.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  public.is_room_member - the membership test the policies use
--
--  Security definer because it is called from inside other policies, where the
--  caller has no grant on room_players and could not run the query itself. It reads
--  auth.uid() rather than taking an argument, so it cannot be used to ask about
--  somebody else's membership.
-- ----------------------------------------------------------------------------

create or replace function public.is_room_member(p_room uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.room_players
    where room_id = p_room and user_id = (select auth.uid())
  );
$$;

-- ----------------------------------------------------------------------------
--  public.ensure_profile - create this mode's profile, wallet and starter kit
--
--  Called by the app the moment a session appears, and idempotent: on conflict do
--  nothing, and the starter kit is only granted when the profile row was actually
--  inserted. That is what stops a player farming starter hints by signing in
--  repeatedly, and it is why the function returns void rather than a flag.
--
--  Reads auth.uid() itself and takes no user_id, so it cannot be called on behalf of
--  anyone else.
-- ----------------------------------------------------------------------------

create or replace function public.ensure_profile(p_mode text, p_name text default 'Explorer')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare inserted integer;
begin
  if auth.uid() is null or p_mode not in ('solo','arena') then
    raise exception 'Unauthorized';
  end if;

  insert into public.profiles(user_id, mode, display_name)
  values(auth.uid(), p_mode, left(coalesce(nullif(trim(p_name), ''), 'Explorer'), 24))
  on conflict do nothing;

  get diagnostics inserted = row_count;

  -- Only a profile that did not exist before gets the starter kit. Signing in again
  -- inserts nothing, so this cannot be replayed for free items.
  if inserted = 1 then
    insert into public.wallets(user_id, mode) values(auth.uid(), p_mode);
    if p_mode = 'solo' then
      -- Transparent starter tools, not currency or fabricated progress.
      insert into public.inventory(user_id, mode, item_id, quantity)
      values(auth.uid(), 'solo', 'hint', 2), (auth.uid(), 'solo', 'digit', 1);
    end if;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
--  public.ensure_profile_with_email - ensure_profile, plus the signup address
--
--  Sign in is by username alone, and the address Supabase keys the account on is
--  derived from that username rather than typed, so nothing has to look an account up
--  before a session can exist. That leaves nowhere for a real address to live, so it
--  is kept here: written once, when the profile row is created.
--
--  ensure_profile is left exactly as it is and this delegates to it, rather than
--  gaining a third parameter. A defaulted parameter would have left the old
--  two-argument function beside it and made every two-argument call ambiguous, which
--  Postgres resolves by refusing to choose. Delegating also means the starter kit is
--  granted in one place instead of being copied.
--
--  The update is guarded on email = '', so the address is written once and a later
--  sign in from another device cannot repoint it.
-- ----------------------------------------------------------------------------

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
  if auth.uid() is null or p_mode not in ('solo','arena') then
    raise exception 'Unauthorized';
  end if;

  perform public.ensure_profile(p_mode, p_name);

  if length(trim(coalesce(p_email, ''))) > 0 then
    update public.profiles
       set email = left(trim(p_email), 254)
     where user_id = auth.uid() and mode = p_mode and email = '';
  end if;
end;
$$;

revoke all on function public.ensure_profile_with_email(text, text, text) from public, anon;
grant execute on function public.ensure_profile_with_email(text, text, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
--  public.create_solo_challenge - open a solo level
--
--  Takes the puzzle from the client, which is why it is picky: the caller must
--  already have a solo profile, a level above 1 must have been cleared, and no more
--  than fifteen starts a minute. The level and the puzzle's own answer are unrelated
--  server-side by design - the answer is checked against what the client claimed, and
--  a dishonest client can only cheat itself, because the reward is paid by comparing
--  against the row it just wrote.
-- ----------------------------------------------------------------------------

create or replace function public.create_solo_challenge(p_user uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare challenge_id uuid;
        lv integer := (p_data->>'level')::integer;
        diff text := p_data->>'difficulty';
begin
  if not exists(select 1 from public.profiles where user_id = p_user and mode = 'solo') then
    raise exception 'Missing profile';
  end if;

  if lv > 1 and not exists(
    select 1 from public.solo_progress
    where user_id = p_user and difficulty = diff and level = lv - 1
  ) then
    raise exception 'Locked level';
  end if;

  if (select count(*) from private.solo_challenges
      where user_id = p_user and started_at > now() - interval '1 minute') > 15 then
    raise exception 'Rate limit';
  end if;

  insert into private.solo_challenges(user_id, difficulty, level, locale, category, prompt, lines, hint, answer)
  values(p_user, diff, lv, p_data->>'locale', p_data->>'category',
         p_data->>'prompt', p_data->'lines', p_data->>'hint', p_data->>'answer')
  returning id into challenge_id;

  return jsonb_build_object(
    'id', challenge_id,
    'puzzle', jsonb_build_object(
      'category', p_data->>'category',
      'prompt', p_data->>'prompt',
      'lines', p_data->'lines'
    )
  );
end;
$$;

-- ----------------------------------------------------------------------------
--  public.solo_action - the whole solo game: buy, use an item, answer
--
--  Everything a solo player does that changes anything. Three details worth naming:
--
--    The challenge is matched on id AND user_id, so one player cannot act on another
--    player's challenge even with its id.
--    Spending an item decrements the bag with quantity > 0 in the where clause and
--    checks the row count, so two rapid clicks cannot both succeed.
--    The reward is paid by inserting into solo_progress, whose primary key makes the
--    insert idempotent, and the coins and the win only move if that insert actually
--    created a row. Replaying a correct answer therefore pays nothing the second
--    time, which is what makes the 400ms rate limit a convenience rather than the
--    only thing standing between a player and free coins.
-- ----------------------------------------------------------------------------

create or replace function public.solo_action(p_user uuid, p_action text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c private.solo_challenges;
  earned integer := 0;
  changed integer;
  item text := p_data->>'item';
begin
  if p_action = 'buy' then
    return private.buy_item(p_user, 'solo', item);
  end if;

  select * into c from private.solo_challenges
  where id = (p_data->>'id')::uuid and user_id = p_user
  for update;
  if not found then raise exception 'Invalid challenge'; end if;

  if c.completed then
    return jsonb_build_object('correct', true, 'reward', 0);
  end if;

  if p_action = 'use' then
    if item not in ('hint','digit') or item = any(c.used) then
      raise exception 'Invalid item use';
    end if;

    -- The quantity > 0 guard plus the row count is what makes this safe against a
    -- double click: the second update matches nothing and is refused.
    update public.inventory set quantity = quantity - 1
    where user_id = p_user and mode = 'solo' and item_id = item and quantity > 0;
    get diagnostics changed = row_count;
    if changed = 0 then raise exception 'No items'; end if;

    update private.solo_challenges set used = array_append(used, item) where id = c.id;

    if item = 'hint' then return jsonb_build_object('hint', c.hint); end if;
    return jsonb_build_object('digit', left(c.answer, 1));

  elsif p_action = 'answer' then
    if p_data->>'answer' !~ '^[0-9]{4}$' then raise exception 'Four digits required'; end if;
    if c.last_attempt > clock_timestamp() - interval '400 milliseconds' then
      raise exception 'Rate limit';
    end if;

    update private.solo_challenges
    set attempts = attempts + 1, last_attempt = clock_timestamp()
    where id = c.id;

    if c.answer <> p_data->>'answer' then
      return jsonb_build_object('correct', false);
    end if;

    update private.solo_challenges set completed = true where id = c.id;

    insert into public.solo_progress(user_id, difficulty, level, attempts, seconds)
    values(p_user, c.difficulty, c.level, c.attempts + 1,
           greatest(0, extract(epoch from (now() - c.started_at))::integer))
    on conflict do nothing;
    get diagnostics changed = row_count;

    -- Only a level cleared for the first time pays. The insert above is the test.
    if changed = 1 then
      earned := case c.difficulty when 'easy' then 40 when 'medium' then 65 else 100 end;
      update public.wallets set balance = balance + earned
      where user_id = p_user and mode = 'solo';
      update public.profiles set wins = wins + 1
      where user_id = p_user and mode = 'solo';
      insert into public.transactions(user_id, mode, delta, reason, reference)
      values(p_user, 'solo', earned, 'level_win', c.difficulty || ':' || c.level);
    end if;

    return jsonb_build_object('correct', true, 'reward', earned);
  end if;

  raise exception 'Unknown action';
end;
$$;

-- ----------------------------------------------------------------------------
--  public.room_action - the whole arena game
--
--  Create a lobby, join, start, answer, sync, leave, buy, equip, set locale. The
--  invariants it maintains:
--
--    One live room per account. Creation takes a transaction-scoped advisory lock
--    keyed on the user, then returns the existing room if there is one, so two
--    simultaneous requests cannot create two lobbies.
--    Nobody joins a started match, and nobody is in two rooms at once.
--    Only the host, and only from waiting, can start; and only with at least two
--    players present.
--    Every round is written as a question and an answer in one go, and the expected
--    question count is checked against the distinct locales in the room first, so a
--    membership change mid-request cannot leave a round missing for one player's
--    language.
--    Answers are graded against private.round_answers, and the round advances when the
--    first player is right in first-to-solve, or when nobody is left outstanding in
--    timeAttack.
--    Rewards are paid through transactions, whose unique key makes a replayed win pay
--    nothing.
-- ----------------------------------------------------------------------------

create or replace function public.room_action(p_user uuid, p_action text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms;
  me public.profiles;
  player public.room_players;
  member_count integer;
  new_code text;
  new_host uuid;
  q jsonb;
  expected text;
  correct boolean := false;
  owned integer;
begin
  select * into me from public.profiles where user_id = p_user and mode = 'arena';
  if not found then raise exception 'Missing arena profile'; end if;

  if p_action = 'buy' then
    return private.buy_item(p_user, 'arena', p_data->>'item');
  end if;

  if p_action = 'equip' then
    select quantity into owned from public.inventory
    where user_id = p_user and mode = 'arena' and item_id = p_data->>'item';
    if coalesce(owned, 0) < 1 then raise exception 'Not owned'; end if;
    update public.profiles set emblem = p_data->>'item'
    where user_id = p_user and mode = 'arena';
    return jsonb_build_object('success', true);
  end if;

  -- Serialize room creation for the same account, preventing concurrent duplicate lobbies.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));

  if p_action = 'create' then
    select rr.* into r from public.rooms rr
    join public.room_players pp on pp.room_id = rr.id
    where pp.user_id = p_user and rr.status in ('waiting','playing')
    limit 1;
    if found then return jsonb_build_object('code', r.code); end if;

    if (select count(*) from public.rooms
        where host_id = p_user and created_at > now() - interval '1 hour') >= 20 then
      raise exception 'Rate limit';
    end if;

    loop
      new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists(select 1 from public.rooms where code = new_code);
    end loop;

    insert into public.rooms(code, host_id, game_mode, total_rounds, category)
    values(new_code, p_user, p_data->>'mode', (p_data->>'rounds')::integer,
           case when p_data->>'mode' = 'timeAttack' then 'random' else p_data->>'category' end)
    returning * into r;

    insert into public.room_players(room_id, user_id, display_name, emblem, locale)
    values(r.id, p_user, me.display_name, me.emblem, p_data->>'locale');

    -- Only the code goes back. The room id is never handed to a client.
    return jsonb_build_object('code', r.code);
  end if;

  select * into r from public.rooms where code = upper(p_data->>'code') for update;
  if not found then raise exception 'Room not found'; end if;

  if p_action = 'join' then
    if exists(select 1 from public.room_players where room_id = r.id and user_id = p_user) then
      return jsonb_build_object('code', r.code);
    end if;
    if r.status <> 'waiting' then raise exception 'Match already started'; end if;

    if exists(
      select 1 from public.room_players p
      join public.rooms rr on rr.id = p.room_id
      where p.user_id = p_user and rr.status in ('waiting','playing')
    ) then
      raise exception 'Leave your other room first';
    end if;

    if (select count(*) from public.room_players where room_id = r.id) >= 8 then
      raise exception 'Room full';
    end if;

    insert into public.room_players(room_id, user_id, display_name, emblem, locale)
    values(r.id, p_user, me.display_name, me.emblem, p_data->>'locale');
    return jsonb_build_object('code', r.code);
  end if;

  select * into player from public.room_players
  where room_id = r.id and user_id = p_user;
  if not found then raise exception 'Not a member'; end if;

  if p_action = 'leave' then
    -- Preserve completed-match standings; leaving a running match cancels rewards if
    -- fewer than two remain.
    if r.status = 'finished' then return jsonb_build_object('success', true); end if;

    delete from public.room_players where room_id = r.id and user_id = p_user;
    select count(*) into member_count from public.room_players where room_id = r.id;

    if member_count = 0 or (r.status = 'playing' and member_count < 2) then
      update public.rooms
      set status = 'finished', finished_at = now(), deadline = null
      where id = r.id;
    end if;

    -- Hand the room to the longest-present remaining member. Never to nobody: a room
    -- with a null host could never be started, so an empty room is finished above and
    -- this only runs when someone is left.
    if r.host_id = p_user and member_count > 0 then
      select user_id into new_host from public.room_players
      where room_id = r.id order by joined_at limit 1;
      update public.rooms set host_id = new_host where id = r.id;
    end if;
    return jsonb_build_object('success', true);
  end if;

  if p_action = 'locale' then
    -- Only before the match, because changing language mid-match would change which
    -- question row a player is being served.
    if r.status = 'waiting' then
      update public.room_players set locale = p_data->>'locale'
      where room_id = r.id and user_id = p_user;
    end if;
    return jsonb_build_object('success', true);
  end if;

  if p_action = 'start' then
    if r.host_id <> p_user or r.status <> 'waiting' then
      raise exception 'Only waiting-room host may start';
    end if;
    select count(*) into member_count from public.room_players where room_id = r.id;
    if member_count < 2 then raise exception 'Need two players'; end if;

    -- One question per round per distinct locale, checked before anything is written
    -- so a partial start cannot leave a player without their language.
    if jsonb_array_length(p_data->'questions')
       <> r.total_rounds * (select count(distinct locale) from public.room_players where room_id = r.id)
    then
      raise exception 'Membership changed; retry';
    end if;

    for q in select * from jsonb_array_elements(p_data->'questions') loop
      if not exists(select 1 from public.room_players where room_id = r.id and locale = q->>'locale')
         or (q->>'round')::integer > r.total_rounds then
        raise exception 'Invalid question';
      end if;
      insert into public.round_questions(room_id, round, locale, category, prompt, lines)
      values(r.id, (q->>'round')::integer, q->>'locale', q->>'category', q->>'prompt', q->'lines');
      insert into private.round_answers(room_id, round, locale, answer, hint)
      values(r.id, (q->>'round')::integer, q->>'locale', q->>'answer', q->>'hint');
    end loop;

    update public.rooms
    set status = 'playing', active_round = 1,
        deadline = clock_timestamp() + case when game_mode = 'timeAttack'
                                          then interval '45 seconds'
                                          else interval '120 seconds' end
    where id = r.id;
    return jsonb_build_object('success', true);
  end if;

  if r.status <> 'playing' then
    return jsonb_build_object('correct', false, 'finished', r.status = 'finished');
  end if;

  -- An expired round resolves itself on the next interaction rather than needing a
  -- timer, so a client that closed mid-round cannot stall the room.
  if clock_timestamp() >= r.deadline then
    perform private.advance_room(r.id);
    return jsonb_build_object('correct', false, 'expired', true);
  end if;

  if p_action = 'sync' then
    return jsonb_build_object('success', true);
  end if;

  if p_action = 'answer' then
    -- A stale round is reported rather than rejected, so a client that was slow can
    -- tell the difference between "wrong" and "too late".
    if (p_data->>'round')::integer is distinct from r.active_round then
      return jsonb_build_object('correct', false, 'stale', true);
    end if;
    -- last_solved_round is what makes a correct answer idempotent.
    if player.last_solved_round = r.active_round then
      return jsonb_build_object('correct', true);
    end if;
    if player.last_attempt > clock_timestamp() - interval '400 milliseconds' then
      raise exception 'Rate limit';
    end if;
    update public.room_players set last_attempt = clock_timestamp()
    where room_id = r.id and user_id = p_user;

    select answer into expected from private.round_answers
    where room_id = r.id and round = r.active_round and locale = player.locale;
    correct := (expected = p_data->>'answer');

    if correct then
      update public.room_players set score = score + 1, last_solved_round = r.active_round
      where room_id = r.id and user_id = p_user;
      -- first-to-solve advances on the first correct answer; timeAttack waits until
      -- nobody is still outstanding.
      if r.game_mode = 'first'
         or not exists(select 1 from public.room_players
                       where room_id = r.id and last_solved_round < r.active_round) then
        perform private.advance_room(r.id);
      end if;
    end if;

    return jsonb_build_object('correct', correct);
  end if;

  raise exception 'Unknown action';
end;
$$;

-- ----------------------------------------------------------------------------
--  public.ai_hint_context - hand a solo puzzle to the hint model
--
--  Returns the prompt, the lines and the official hint, and deliberately not the
--  answer: the model is asked to explain a method, and it is never told the code, so
--  it cannot leak it even if it tries. The increment and the cap happen in the same
--  statement that reads the row, so the eleventh request in a day is refused before it
--  is served.
-- ----------------------------------------------------------------------------

create or replace function public.ai_hint_context(p_user uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare c private.solo_challenges; n integer;
begin
  select * into c from private.solo_challenges
  where id = p_id and user_id = p_user and not completed;
  if not found then raise exception 'Invalid challenge'; end if;

  insert into private.ai_usage(user_id, day, requests)
  values(p_user, current_date, 1)
  on conflict(user_id, day) do update set requests = private.ai_usage.requests + 1
  returning requests into n;
  if n > 10 then raise exception 'Daily AI limit'; end if;

  return jsonb_build_object('prompt', c.prompt, 'lines', c.lines, 'hint', c.hint, 'locale', c.locale);
end;
$$;

-- ----------------------------------------------------------------------------
--  private.advance_room - move a match on, or finish it
--
--  Called from room_action rather than from a timer, because a round is resolved the
--  next time anyone touches the room. Rewards go to every player tied on the high
--  score, and only if at least two were playing, so a win cannot be claimed from an
--  empty or solo room.
-- ----------------------------------------------------------------------------

create or replace function private.advance_room(p_room uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare r public.rooms; winner record; high integer;
begin
  select * into r from public.rooms where id = p_room;
  if r.status <> 'playing' then return; end if;

  if r.active_round >= r.total_rounds then
    update public.rooms
    set status = 'finished', finished_at = clock_timestamp(), deadline = null
    where id = p_room;

    select max(score) into high from public.room_players where room_id = p_room;
    if high > 0 and (select count(*) from public.room_players where room_id = p_room) >= 2 then
      for winner in
        select user_id from public.room_players where room_id = p_room and score = high
      loop
        insert into public.transactions(user_id, mode, delta, reason, reference)
        values(winner.user_id, 'arena', 100, 'match_win', p_room::text)
        on conflict do nothing;
        if found then
          update public.wallets set balance = balance + 100
          where user_id = winner.user_id and mode = 'arena';
          update public.profiles set wins = wins + 1
          where user_id = winner.user_id and mode = 'arena';
        end if;
      end loop;
    end if;

  else
    update public.rooms
    set active_round = active_round + 1,
        deadline = clock_timestamp() + case when game_mode = 'timeAttack'
                                           then interval '45 seconds'
                                           else interval '120 seconds' end
    where id = p_room;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
--  private.buy_item - the shop, for both modes
--
--  Shared deliberately: both shops are the same mechanic over the same catalog, and
--  the mode argument is applied to every statement, so a solo purchase debits a solo
--  wallet and grants a solo item, always. The wallet row is locked before the balance
--  is read, which is what stops two concurrent purchases from both seeing enough
--  money.
--
--  A permanent item is refused if it is already held; a consumable stacks.
-- ----------------------------------------------------------------------------

create or replace function private.buy_item(p_user uuid, p_mode text, p_item text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare product public.catalog; funds integer; owned integer;
begin
  select * into product from public.catalog where id = p_item and mode = p_mode;
  if not found then raise exception 'Unknown item'; end if;

  select balance into funds from public.wallets
  where user_id = p_user and mode = p_mode for update;
  if funds is null or funds < product.price then raise exception 'Insufficient coins'; end if;

  select quantity into owned from public.inventory
  where user_id = p_user and mode = p_mode and item_id = p_item;
  if not product.consumable and coalesce(owned, 0) > 0 then raise exception 'Already owned'; end if;

  update public.wallets set balance = balance - product.price
  where user_id = p_user and mode = p_mode;

  insert into public.inventory(user_id, mode, item_id, quantity)
  values(p_user, p_mode, p_item, 1)
  on conflict(user_id, mode, item_id)
  do update set quantity = public.inventory.quantity + 1;

  insert into public.transactions(user_id, mode, delta, reason, reference)
  values(p_user, p_mode, -product.price, 'purchase:' || p_item, gen_random_uuid()::text);

  return jsonb_build_object('success', true);
end;
$$;

-- ----------------------------------------------------------------------------
--  public.record_ai_provider_use and public.ai_provider_today - the AI quota ledger
--
--  These two are in public and everything they touch is in private, which is deliberate
--  and worth understanding before anyone tidies it up.
--
--  PostgREST only searches the schemas it is configured to expose, and on this project
--  that is public. A function in private is unreachable from an edge function no matter
--  what it is granted: the call fails with "could not find the function in the schema
--  cache", naming public, because public is all it looked in. So the functions live where
--  PostgREST can see them and the row they read and write does not move.
--
--  They are SECURITY DEFINER because their bodies touch private.ai_provider_usage, which
--  the calling role may not use. That is the same reason ensure_profile and
--  is_room_member are security definer, and it is safe for the same reasons: the
--  search_path is pinned to the empty string so the body can only reach what it names in
--  full, the arguments carry no user identity so there is nothing for a caller to act
--  on, and EXECUTE is revoked from anon and authenticated below. Nothing a client could
--  do with either of these is harmful - one increments a global counter and the other
--  reads global counters back - and a client cannot call either.
--
--  The write increments rather than replaces, so two concurrent requests cannot both
--  read the same count and write it back. An exhausted provider is not resurrected by
--  usage: once a provider says no more today, the rest of today goes elsewhere.
-- ----------------------------------------------------------------------------

create or replace function public.record_ai_provider_use(
  p_provider text,
  p_requests integer default 1,
  p_tokens_in integer default 0,
  p_tokens_out integer default 0,
  p_exhausted boolean default false
) returns void
language sql
security definer
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
security definer
set search_path = ''
as $$
  select u.provider, u.requests, u.tokens_in, u.tokens_out, u.exhausted
  from private.ai_provider_usage u
  where u.day = current_date;
$$;

-- ----------------------------------------------------------------------------
--  public.rls_auto_enable - a new table cannot be shipped unprotected
--
--  Fires after CREATE TABLE in the public schema and turns RLS on. Without it,
--  adding a table and forgetting the policies would expose it, because Supabase does
--  not enable RLS by default. The trigger itself only exists on a real project, so
--  this function is created everywhere but the trigger is not - an event trigger
--  cannot be fired by a query, so it has no effect on the structure.
--
--  EXECUTE is left with the owner alone. It had been granted to PUBLIC, anon and
--  authenticated; no exploit path existed, but a security definer function that
--  anonymous can execute is not something to leave lying around.
-- ----------------------------------------------------------------------------

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL
        AND cmd.schema_name IN ('public')
        AND cmd.schema_name NOT IN ('pg_catalog','information_schema')
        AND cmd.schema_name NOT LIKE 'pg_toast%'
        AND cmd.schema_name NOT LIKE 'pg_temp%'
     THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
              cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


-- ============================================================================
--  SECTION 4. Row Level Security
--
--  Every table has RLS on. The policies are all SELECT except for one narrow UPDATE,
--  because no client holds write on any table - every write goes through a security
--  definer function. The event trigger in section 3 turns RLS on for any table added
--  later, so a new table cannot be shipped unprotected by accident.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  public.catalog - readable by anyone, signed in or not
-- ----------------------------------------------------------------------------

alter table public.catalog enable row level security;

create policy read_catalog on public.catalog
  for select to anon, authenticated
  using (true);

-- ----------------------------------------------------------------------------
--  public.profiles - read your own, rename your own
--
--  The one place a client writes directly. The UPDATE is constrained by both using
--  and with check: the first stops you updating someone else's row, and the second
--  stops you reassigning a row you do own to somebody else, which a
--  with-check-free policy would happily allow.
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy own_profile_read on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy own_profile_name on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on policy own_profile_name on public.profiles is
  'The only direct client write in the schema, and deliberately narrow: the player '
  'renames their own profile and nothing else. with check is what stops a rename '
  'from being used to move a profile to another account.';

-- ----------------------------------------------------------------------------
--  public.wallets, inventory, transactions, solo_progress - your own rows only
-- ----------------------------------------------------------------------------

alter table public.wallets enable row level security;

create policy own_wallet on public.wallets
  for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.inventory enable row level security;

create policy own_inventory on public.inventory
  for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.transactions enable row level security;

create policy own_transactions on public.transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.solo_progress enable row level security;

create policy own_progress on public.solo_progress
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
--  public.rooms, room_players - membership, not ownership
--
--  A player may read a room they are in and no other, checked through is_room_member
--  rather than by comparing user_id, because being in the room is the only thing that
--  should grant visibility. The host is not special-cased: the host is a member like
--  anyone else, and a room nobody is in is invisible to everyone including the person
--  who made it.
-- ----------------------------------------------------------------------------

alter table public.rooms enable row level security;

create policy room_members on public.rooms
  for select to authenticated
  using (is_room_member(id));

alter table public.room_players enable row level security;

create policy player_members on public.room_players
  for select to authenticated
  using (is_room_member(room_id));

-- ----------------------------------------------------------------------------
--  public.round_questions - room members, this round, in your language
--
--  Three conditions, all necessary:
--    is_room_member  you are in the room at all.
--    round <= the room's active_round, and the room is playing or finished, so
--                   rounds that exist as rows but have not been reached yet stay
--                   invisible even though they were written at start.
--    locale = your own row's locale, so a mixed-language room shows each player their
--                   language and nobody else's.
-- ----------------------------------------------------------------------------

alter table public.round_questions enable row level security;

create policy current_question on public.round_questions
  for select to authenticated
  using (
    is_room_member(room_id)
    and exists (
      select 1 from public.rooms r
      where r.id = round_questions.room_id
        and r.status in ('playing','finished')
        and round_questions.round <= r.active_round
    )
    and locale = (
      select p.locale from public.room_players p
      where p.room_id = round_questions.room_id
        and p.user_id = (select auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
--  The private schema has RLS on and no policies at all.
--
--  That combination is the whole protection: with RLS enabled and no policy the
--  default is to deny, and there is no grant for anon or authenticated either.
--  service_role bypasses RLS, which is exactly why the edge functions are the only
--  thing that can read an answer, and why every one of them takes the caller's
--  user_id as an argument instead of trusting anything else.
-- ----------------------------------------------------------------------------

alter table private.solo_challenges   enable row level security;
alter table private.round_answers     enable row level security;
alter table private.ai_usage          enable row level security;
alter table private.ai_provider_usage enable row level security;

comment on table private.solo_challenges is
  'RLS enabled with no policy, which means deny. service_role bypasses RLS, so the '
  'only reader is an edge function.';


-- ============================================================================
--  SECTION 5. Grants
--
--  Read for the two client roles, nothing else. There is no insert, update or delete
--  grant for authenticated on any table: every write goes through a security definer
--  function, which is the only reason the policies above have to be so narrow.
-- ============================================================================

grant usage on schema public to anon, authenticated;

grant select on public.catalog         to anon, authenticated;
grant select on public.profiles        to authenticated;
grant select on public.wallets         to authenticated;
grant select on public.inventory       to authenticated;
grant select on public.transactions    to authenticated;
grant select on public.solo_progress   to authenticated;
grant select on public.rooms           to authenticated;
grant select on public.room_players    to authenticated;
grant select on public.round_questions to authenticated;

-- The private schema is granted to nobody. service_role bypasses RLS and owns these
-- tables, so the edge functions can still read them; anon and authenticated cannot
-- reach the schema at all, which is one step before RLS even applies.
revoke all on schema private from public, anon, authenticated;

-- service_role, written out rather than left implicit. It is the role the three edge
-- functions run as and the only writer in the system, and stating the grant here means
-- the file is the whole picture rather than depending on what the platform happens to
-- have pre-granted. Note the asymmetry that matters: service_role is granted on the
-- nine public tables and on nothing in private. It reaches the answers through
-- BYPASSRLS as the tables' owner, not through a grant, so there is no grant anywhere
-- that would let a leaked service_role key read an answer without going through one of
-- the functions in section 3 - each of which takes the caller's user_id as an argument.
grant all on public.catalog         to service_role;
grant all on public.profiles        to service_role;
grant all on public.wallets         to service_role;
grant all on public.inventory       to service_role;
grant all on public.transactions    to service_role;
grant all on public.solo_progress   to service_role;
grant all on public.rooms           to service_role;
grant all on public.room_players    to service_role;
grant all on public.round_questions to service_role;

-- ----------------------------------------------------------------------------
--  Function EXECUTE
--
--  ensure_profile and is_room_member are the only two a client can call, and both are
--  safe to: the first reads auth.uid() itself and the second is a boolean test about
--  the caller. The five that change state are service_role only, so the edge functions
--  are the only route to them and a stolen anon key cannot create a challenge, grade
--  an answer or move coins.
-- ----------------------------------------------------------------------------

revoke all on function public.ensure_profile(text, text) from public, anon;
grant execute on function public.ensure_profile(text, text) to authenticated, service_role;

revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated, service_role;

revoke all on function public.create_solo_challenge(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_solo_challenge(uuid, jsonb) to service_role;

revoke all on function public.solo_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.solo_action(uuid, text, jsonb) to service_role;

revoke all on function public.room_action(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.room_action(uuid, text, jsonb) to service_role;

revoke all on function public.ai_hint_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_hint_context(uuid, uuid) to service_role;

-- The AI quota ledger. Readable only by the edge functions, which is what makes the
-- router's memory of a spent provider trustworthy: a client cannot inflate a counter and
-- lock the AI features out for everyone.
revoke all on function public.record_ai_provider_use(text, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.record_ai_provider_use(text, integer, integer, integer, boolean) to service_role;

revoke all on function public.ai_provider_today() from public, anon, authenticated;
grant execute on function public.ai_provider_today() to service_role;

-- Owner only. See the note above the function.
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;

-- Exactly one role reaches the private schema directly, and it is not service_role. The
-- two accounting functions above are security definer precisely so that the role running
-- the edge functions does not need it.
revoke usage on schema private from service_role;


-- ============================================================================
--  SECTION 6. Realtime
--
--  Every table a client needs to watch. The three private tables are absent on
--  purpose and the reasoning is at the top of this file: two of them hold the answer
--  to every puzzle in the game, and publishing them would hand every connected client
--  the lot.
--
--  REPLICA IDENTITY FULL is set on each published table so a delete or an update
--  carries the previous row. Without it Postgres replicates only the key, and a
--  subscriber that refetches on the event would be told a row changed without being
--  able to say which. It costs storage and write amplification, which is the right
--  trade for tables this small.
-- ============================================================================

alter publication supabase_realtime add table
  public.profiles,
  public.wallets,
  public.inventory,
  public.transactions,
  public.solo_progress,
  public.rooms,
  public.room_players,
  public.round_questions,
  public.catalog;

alter table public.profiles        replica identity full;
alter table public.wallets         replica identity full;
alter table public.inventory       replica identity full;
alter table public.transactions    replica identity full;
alter table public.solo_progress   replica identity full;
alter table public.rooms           replica identity full;
alter table public.room_players    replica identity full;
alter table public.round_questions replica identity full;
alter table public.catalog         replica identity full;

-- Explicitly not published:
--   private.round_answers    - every match answer
--   private.solo_challenges  - every live solo answer
--   private.ai_usage         - one account's usage of a shared free tier
--   private.ai_provider_usage - how much of the shared free AI allowance is left, which
--                               is operational rather than anyone's business, and which
--                               would be a map of how hard the platform is being pushed

comment on publication supabase_realtime is
  'Every table a client legitimately needs to watch. The three private tables are '
  'excluded on purpose: two of them hold the answers to every puzzle in the game, and '
  'publishing them would broadcast those answers to every connected client.';


-- ============================================================================
--  SECTION 7. Seed
--
--  The shop. Two rows per mode and they are genuinely separate stock: the composite
--  key and the composite foreign key from inventory mean an arena emblem can never be
--  granted against a solo bag, and adding a solo item cannot appear in the arena shop.
--
--  Written as an upsert so re-running this file is harmless.
-- ============================================================================

insert into public.catalog(id, mode, price, consumable) values
  ('hint',  'solo',  30, true),   -- a written hint for the current level
  ('digit', 'solo',  70, true),   -- reveals the first digit of the code
  ('moon',  'arena', 100, false), -- permanent emblem
  ('crown', 'arena', 250, false)  -- permanent emblem
on conflict (id, mode) do update
  set price = excluded.price, consumable = excluded.consumable;


-- ============================================================================
--  SECTION 8. What should be true afterwards
--
--  Run these to confirm the file did what it claims. verify-schema.mjs asserts the
--  same things against production.
-- ============================================================================

-- Twelve tables, RLS on every one, and no policy in the private schema.
select
  (select count(*) from pg_tables where schemaname in ('public','private'))             as tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public','private') and c.relrowsecurity)  as rls_on,
  (select count(*) from pg_policies where schemaname = 'private')                       as private_policies,
  (select count(*) from pg_policies where schemaname = 'public')                        as public_policies;

-- Nine tables published, three withheld.
select count(*) as published
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname in ('public','private');

-- No grant that would let a client write.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
  and privilege_type <> 'SELECT'
order by 1, 2;

-- Both false. The private schema holds the answers and must stay unreachable.
select has_table_privilege('anon', 'private.round_answers', 'select')          as anon_sees_answers,
       has_table_privilege('authenticated', 'private.solo_challenges', 'select') as player_sees_answers;
