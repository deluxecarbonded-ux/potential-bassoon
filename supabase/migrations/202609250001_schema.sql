-- Exotic • relational model, permissions, policies and real-time publication.
-- Apply with `supabase db push`. No demo users, opponents, scores or balances.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
 user_id uuid not null references auth.users(id) on delete cascade,
 mode text not null check (mode in ('solo','arena')),
 display_name text not null check (char_length(display_name) between 2 and 24),
 emblem text not null default '' check (emblem in ('','moon','crown')),
 wins integer not null default 0 check(wins>=0),
 created_at timestamptz not null default now(),
 primary key(user_id,mode)
);
create table public.wallets (
 user_id uuid not null, mode text not null,
 balance integer not null default 0 check(balance>=0),
 primary key(user_id,mode),
 foreign key(user_id,mode) references public.profiles(user_id,mode) on delete cascade
);
create table public.catalog (
 id text not null, mode text not null check(mode in ('solo','arena')),
 price integer not null check(price>0), consumable boolean not null,
 primary key(id,mode)
);
insert into public.catalog values ('hint','solo',30,true),('digit','solo',70,true),('moon','arena',100,false),('crown','arena',250,false);
create table public.inventory (
 user_id uuid not null, mode text not null, item_id text not null,
 quantity integer not null default 0 check(quantity>=0),
 primary key(user_id,mode,item_id),
 foreign key(user_id,mode) references public.profiles(user_id,mode) on delete cascade,
 foreign key(item_id,mode) references public.catalog(id,mode)
);
create table public.transactions (
 id bigint generated always as identity primary key,
 user_id uuid not null,mode text not null,delta integer not null,
 reason text not null, reference text not null, created_at timestamptz not null default now(),
 foreign key(user_id,mode) references public.profiles(user_id,mode) on delete cascade,
 unique(user_id,mode,reason,reference)
);
create table public.solo_progress (
 user_id uuid not null references auth.users(id) on delete cascade,
 difficulty text not null check(difficulty in ('easy','medium','hard')),
 level integer not null check(level between 1 and 30),
 attempts integer not null check(attempts>0),seconds integer not null check(seconds>=0),
 completed_at timestamptz not null default now(),
 primary key(user_id,difficulty,level)
);
create table private.solo_challenges (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 difficulty text not null check(difficulty in ('easy','medium','hard')),level integer not null check(level between 1 and 30),
 locale text not null,prompt text not null,lines jsonb not null,category text not null,hint text not null,
 answer text not null check(answer~'^[0-9]{4}$'),attempts integer not null default 0,
 started_at timestamptz not null default now(),last_attempt timestamptz,completed boolean not null default false,
 used text[] not null default '{}'
);
create index on private.solo_challenges(user_id,started_at desc);
create table public.rooms (
 id uuid primary key default gen_random_uuid(),code text not null unique check(code~'^[A-Z0-9]{6}$'),
 host_id uuid not null references auth.users(id),game_mode text not null check(game_mode in ('first','timeAttack')),
 total_rounds integer not null check(total_rounds between 1 and 10),
 category text not null check(category in ('random','math','logic','riddles','science','trivia')),
 status text not null default 'waiting' check(status in ('waiting','playing','finished')),
 active_round integer not null default 0,deadline timestamptz,
 created_at timestamptz not null default now(),finished_at timestamptz
);
create index on public.rooms(status,deadline);
create table public.room_players (
 room_id uuid not null references public.rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null,emblem text not null default '',locale text not null check (locale in ('en','ar','es','fr','de','pt','it','nl','ru','tr','hi','ja','ko','zh','id','ur')),
 score integer not null default 0 check(score>=0),last_solved_round integer not null default 0,
 last_attempt timestamptz,joined_at timestamptz not null default now(),
 primary key(room_id,user_id)
);
create index on public.room_players(user_id,room_id);
create table public.round_questions (
 room_id uuid not null references public.rooms(id) on delete cascade,
 round integer not null check(round between 1 and 10),locale text not null,
 category text not null,prompt text not null,lines jsonb not null,
 primary key(room_id,round,locale)
);
create table private.round_answers (
 room_id uuid not null,round integer not null,locale text not null,
 answer text not null check(answer~'^[0-9]{4}$'),hint text not null,
 primary key(room_id,round,locale),
 foreign key(room_id,round,locale) references public.round_questions(room_id,round,locale) on delete cascade
);
create table private.ai_usage (
 user_id uuid not null references auth.users(id) on delete cascade,day date not null default current_date,
 requests integer not null default 0, primary key(user_id,day)
);

-- Own identity only. Lobby participants see the safe name/emblem snapshots instead.
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.catalog enable row level security;
alter table public.inventory enable row level security;
alter table public.transactions enable row level security;
alter table public.solo_progress enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.round_questions enable row level security;
alter table private.solo_challenges enable row level security;
alter table private.round_answers enable row level security;
alter table private.ai_usage enable row level security;

create policy own_profile_read on public.profiles for select to authenticated using(user_id=(select auth.uid()));
create policy own_profile_name on public.profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_wallet on public.wallets for select to authenticated using(user_id=(select auth.uid()));
create policy read_catalog on public.catalog for select to anon,authenticated using(true);
create policy own_inventory on public.inventory for select to authenticated using(user_id=(select auth.uid()));
create policy own_transactions on public.transactions for select to authenticated using(user_id=(select auth.uid()));
create policy own_progress on public.solo_progress for select to authenticated using(user_id=(select auth.uid()));

create function public.is_room_member(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.room_players where room_id=p_room and user_id=(select auth.uid()));
$$;
revoke all on function public.is_room_member(uuid) from public,anon;
grant execute on function public.is_room_member(uuid) to authenticated;
create policy room_members on public.rooms for select to authenticated using(public.is_room_member(id));
create policy player_members on public.room_players for select to authenticated using(public.is_room_member(room_id));
create policy current_question on public.round_questions for select to authenticated using(
 public.is_room_member(room_id) and exists(select 1 from public.rooms r where r.id=room_id and r.status in ('playing','finished') and round<=r.active_round)
 and locale=(select p.locale from public.room_players p where p.room_id=round_questions.room_id and p.user_id=(select auth.uid()))
);
revoke all on all tables in schema public from anon,authenticated;
grant select on public.catalog to anon,authenticated;
grant select on public.profiles,public.wallets,public.inventory,public.transactions,public.solo_progress,public.rooms,public.room_players,public.round_questions to authenticated;
grant update(display_name) on public.profiles to authenticated;

create function public.ensure_profile(p_mode text,p_name text default 'Explorer') returns void language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
 if auth.uid() is null or p_mode not in ('solo','arena') then raise exception 'Unauthorized'; end if;
 insert into public.profiles(user_id,mode,display_name) values(auth.uid(),p_mode,left(coalesce(nullif(trim(p_name),''),'Explorer'),24)) on conflict do nothing;
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
revoke all on function public.ensure_profile(text,text) from public,anon;
grant execute on function public.ensure_profile(text,text) to authenticated;

alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
alter table public.wallets replica identity full;
alter table public.inventory replica identity full;
alter table public.profiles replica identity full;
alter table public.solo_progress replica identity full;
do $$ declare t text; begin
 foreach t in array array['rooms','room_players','wallets','inventory','profiles','solo_progress'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;
