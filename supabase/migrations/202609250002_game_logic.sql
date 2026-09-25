-- All mutating game operations are transactional and callable ONLY by service_role.
-- Edge functions authenticate the bearer token before passing p_user.
create function private.buy_item(p_user uuid,p_mode text,p_item text) returns jsonb language plpgsql set search_path='' as $$
declare product public.catalog; funds integer; owned integer;
begin
 select * into product from public.catalog where id=p_item and mode=p_mode;
 if not found then raise exception 'Unknown item'; end if;
 select balance into funds from public.wallets where user_id=p_user and mode=p_mode for update;
 if funds is null or funds<product.price then raise exception 'Insufficient coins'; end if;
 select quantity into owned from public.inventory where user_id=p_user and mode=p_mode and item_id=p_item;
 if not product.consumable and coalesce(owned,0)>0 then raise exception 'Already owned'; end if;
 update public.wallets set balance=balance-product.price where user_id=p_user and mode=p_mode;
 insert into public.inventory(user_id,mode,item_id,quantity) values(p_user,p_mode,p_item,1)
 on conflict(user_id,mode,item_id) do update set quantity=inventory.quantity+1;
 insert into public.transactions(user_id,mode,delta,reason,reference) values(p_user,p_mode,-product.price,'purchase:'||p_item,gen_random_uuid()::text);
 return jsonb_build_object('success',true);
end $$;

create function public.create_solo_challenge(p_user uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare challenge_id uuid; lv integer := (p_data->>'level')::integer; diff text := p_data->>'difficulty';
begin
 if not exists(select 1 from public.profiles where user_id=p_user and mode='solo') then raise exception 'Missing profile'; end if;
 if lv>1 and not exists(select 1 from public.solo_progress where user_id=p_user and difficulty=diff and level=lv-1) then raise exception 'Locked level'; end if;
 if (select count(*) from private.solo_challenges where user_id=p_user and started_at>now()-interval '1 minute')>15 then raise exception 'Rate limit'; end if;
 insert into private.solo_challenges(user_id,difficulty,level,locale,category,prompt,lines,hint,answer)
 values(p_user,diff,lv,p_data->>'locale',p_data->>'category',p_data->>'prompt',p_data->'lines',p_data->>'hint',p_data->>'answer') returning id into challenge_id;
 return jsonb_build_object('id',challenge_id,'puzzle',jsonb_build_object('category',p_data->>'category','prompt',p_data->>'prompt','lines',p_data->'lines'));
end $$;

create function public.solo_action(p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.solo_challenges; earned integer:=0; changed integer; item text:=p_data->>'item';
begin
 if p_action='buy' then return private.buy_item(p_user,'solo',item); end if;
 select * into c from private.solo_challenges where id=(p_data->>'id')::uuid and user_id=p_user for update;
 if not found then raise exception 'Invalid challenge'; end if;
 if c.completed then return jsonb_build_object('correct',true,'reward',0); end if;
 if p_action='use' then
  if item not in ('hint','digit') or item=any(c.used) then raise exception 'Invalid item use'; end if;
  update public.inventory set quantity=quantity-1 where user_id=p_user and mode='solo' and item_id=item and quantity>0;
  get diagnostics changed=row_count;
  if changed=0 then raise exception 'No items'; end if;
  update private.solo_challenges set used=array_append(used,item) where id=c.id;
  if item='hint' then return jsonb_build_object('hint',c.hint); end if;
  return jsonb_build_object('digit',left(c.answer,1));
 elsif p_action='answer' then
  if p_data->>'answer' !~ '^[0-9]{4}$' then raise exception 'Four digits required'; end if;
  if c.last_attempt>clock_timestamp()-interval '400 milliseconds' then raise exception 'Rate limit'; end if;
  update private.solo_challenges set attempts=attempts+1,last_attempt=clock_timestamp() where id=c.id;
  if c.answer<>p_data->>'answer' then return jsonb_build_object('correct',false); end if;
  update private.solo_challenges set completed=true where id=c.id;
  insert into public.solo_progress(user_id,difficulty,level,attempts,seconds) values(p_user,c.difficulty,c.level,c.attempts+1,greatest(0,extract(epoch from (now()-c.started_at))::integer)) on conflict do nothing;
  get diagnostics changed=row_count;
  if changed=1 then
   earned:=case c.difficulty when 'easy' then 40 when 'medium' then 65 else 100 end;
   update public.wallets set balance=balance+earned where user_id=p_user and mode='solo';
   update public.profiles set wins=wins+1 where user_id=p_user and mode='solo';
   insert into public.transactions(user_id,mode,delta,reason,reference) values(p_user,'solo',earned,'level_win',c.difficulty||':'||c.level);
  end if;
  return jsonb_build_object('correct',true,'reward',earned);
 end if;
 raise exception 'Unknown action';
end $$;

-- The room row is locked by room_action before this helper runs.
create function private.advance_room(p_room uuid) returns void language plpgsql set search_path='' as $$
declare r public.rooms; winner record; high integer;
begin
 select * into r from public.rooms where id=p_room;
 if r.status<>'playing' then return; end if;
 if r.active_round>=r.total_rounds then
  update public.rooms set status='finished',finished_at=clock_timestamp(),deadline=null where id=p_room;
  select max(score) into high from public.room_players where room_id=p_room;
  if high>0 and (select count(*) from public.room_players where room_id=p_room)>=2 then
   for winner in select user_id from public.room_players where room_id=p_room and score=high loop
    insert into public.transactions(user_id,mode,delta,reason,reference) values(winner.user_id,'arena',100,'match_win',p_room::text) on conflict do nothing;
    if found then
     update public.wallets set balance=balance+100 where user_id=winner.user_id and mode='arena';
     update public.profiles set wins=wins+1 where user_id=winner.user_id and mode='arena';
    end if;
   end loop;
  end if;
 else
  update public.rooms set active_round=active_round+1,deadline=clock_timestamp()+case when game_mode='timeAttack' then interval '45 seconds' else interval '120 seconds' end where id=p_room;
 end if;
end $$;

create function public.room_action(p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms; me public.profiles; player public.room_players; member_count integer; new_code text; new_host uuid; q jsonb; expected text; correct boolean:=false; owned integer;
begin
 select * into me from public.profiles where user_id=p_user and mode='arena';
 if not found then raise exception 'Missing arena profile'; end if;
 if p_action='buy' then return private.buy_item(p_user,'arena',p_data->>'item'); end if;
 if p_action='equip' then
  select quantity into owned from public.inventory where user_id=p_user and mode='arena' and item_id=p_data->>'item';
  if coalesce(owned,0)<1 then raise exception 'Not owned'; end if;
  update public.profiles set emblem=p_data->>'item' where user_id=p_user and mode='arena';
  return jsonb_build_object('success',true);
 end if;
 -- Serialize room creation for the same account, preventing concurrent duplicate lobbies.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,1));
 if p_action='create' then
  select rr.* into r from public.rooms rr join public.room_players pp on pp.room_id=rr.id where pp.user_id=p_user and rr.status in ('waiting','playing') limit 1;
  if found then return jsonb_build_object('code',r.code); end if;
  if (select count(*) from public.rooms where host_id=p_user and created_at>now()-interval '1 hour')>=20 then raise exception 'Rate limit'; end if;
  loop
   new_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
   exit when not exists(select 1 from public.rooms where code=new_code);
  end loop;
  insert into public.rooms(code,host_id,game_mode,total_rounds,category) values(new_code,p_user,p_data->>'mode',(p_data->>'rounds')::integer,case when p_data->>'mode'='timeAttack' then 'random' else p_data->>'category' end) returning * into r;
  insert into public.room_players(room_id,user_id,display_name,emblem,locale) values(r.id,p_user,me.display_name,me.emblem,p_data->>'locale');
  return jsonb_build_object('code',r.code);
 end if;
 select * into r from public.rooms where code=upper(p_data->>'code') for update;
 if not found then raise exception 'Room not found'; end if;
 if p_action='join' then
  if exists(select 1 from public.room_players where room_id=r.id and user_id=p_user) then return jsonb_build_object('code',r.code); end if;
  if r.status<>'waiting' then raise exception 'Match already started'; end if;
  if exists(select 1 from public.room_players p join public.rooms rr on rr.id=p.room_id where p.user_id=p_user and rr.status in ('waiting','playing')) then raise exception 'Leave your other room first'; end if;
  if (select count(*) from public.room_players where room_id=r.id)>=8 then raise exception 'Room full'; end if;
  insert into public.room_players(room_id,user_id,display_name,emblem,locale) values(r.id,p_user,me.display_name,me.emblem,p_data->>'locale');
  return jsonb_build_object('code',r.code);
 end if;
 select * into player from public.room_players where room_id=r.id and user_id=p_user;
 if not found then raise exception 'Not a member'; end if;
 if p_action='leave' then
  -- Preserve completed-match standings; leaving a running match cancels rewards if fewer than two remain.
  if r.status='finished' then return jsonb_build_object('success',true); end if;
  delete from public.room_players where room_id=r.id and user_id=p_user;
  select count(*) into member_count from public.room_players where room_id=r.id;
  if member_count=0 or (r.status='playing' and member_count<2) then
   update public.rooms set status='finished',finished_at=now(),deadline=null where id=r.id;
  end if;
  if r.host_id=p_user and member_count>0 then
   select user_id into new_host from public.room_players where room_id=r.id order by joined_at limit 1;
   update public.rooms set host_id=new_host where id=r.id;
  end if;
  return jsonb_build_object('success',true);
 end if;
 if p_action='locale' then
  if r.status='waiting' then update public.room_players set locale=p_data->>'locale' where room_id=r.id and user_id=p_user; end if;
  return jsonb_build_object('success',true);
 end if;
 if p_action='start' then
  if r.host_id<>p_user or r.status<>'waiting' then raise exception 'Only waiting-room host may start'; end if;
  select count(*) into member_count from public.room_players where room_id=r.id;
  if member_count<2 then raise exception 'Need two players'; end if;
  if jsonb_array_length(p_data->'questions')<>r.total_rounds*(select count(distinct locale) from public.room_players where room_id=r.id) then raise exception 'Membership changed; retry'; end if;
  for q in select * from jsonb_array_elements(p_data->'questions') loop
   if not exists(select 1 from public.room_players where room_id=r.id and locale=q->>'locale') or (q->>'round')::integer>r.total_rounds then raise exception 'Invalid question'; end if;
   insert into public.round_questions(room_id,round,locale,category,prompt,lines) values(r.id,(q->>'round')::integer,q->>'locale',q->>'category',q->>'prompt',q->'lines');
   insert into private.round_answers(room_id,round,locale,answer,hint) values(r.id,(q->>'round')::integer,q->>'locale',q->>'answer',q->>'hint');
  end loop;
  update public.rooms set status='playing',active_round=1,deadline=clock_timestamp()+case when game_mode='timeAttack' then interval '45 seconds' else interval '120 seconds' end where id=r.id;
  return jsonb_build_object('success',true);
 end if;
 if r.status<>'playing' then return jsonb_build_object('correct',false,'finished',r.status='finished'); end if;
 if clock_timestamp()>=r.deadline then
  perform private.advance_room(r.id);
  return jsonb_build_object('correct',false,'expired',true);
 end if;
 if p_action='sync' then return jsonb_build_object('success',true); end if;
 if p_action='answer' then
  if (p_data->>'round')::integer is distinct from r.active_round then return jsonb_build_object('correct',false,'stale',true); end if;
  if player.last_solved_round=r.active_round then return jsonb_build_object('correct',true); end if;
  if player.last_attempt>clock_timestamp()-interval '400 milliseconds' then raise exception 'Rate limit'; end if;
  update public.room_players set last_attempt=clock_timestamp() where room_id=r.id and user_id=p_user;
  select answer into expected from private.round_answers where room_id=r.id and round=r.active_round and locale=player.locale;
  correct:=(expected=p_data->>'answer');
  if correct then
   update public.room_players set score=score+1,last_solved_round=r.active_round where room_id=r.id and user_id=p_user;
   if r.game_mode='first' or not exists(select 1 from public.room_players where room_id=r.id and last_solved_round<r.active_round) then perform private.advance_room(r.id); end if;
  end if;
  return jsonb_build_object('correct',correct);
 end if;
 raise exception 'Unknown action';
end $$;

create function public.ai_hint_context(p_user uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.solo_challenges; n integer;
begin
 select * into c from private.solo_challenges where id=p_id and user_id=p_user and not completed;
 if not found then raise exception 'Invalid challenge'; end if;
 insert into private.ai_usage(user_id,day,requests) values(p_user,current_date,1)
 on conflict(user_id,day) do update set requests=ai_usage.requests+1 returning requests into n;
 if n>10 then raise exception 'Daily AI limit'; end if;
 return jsonb_build_object('prompt',c.prompt,'lines',c.lines,'hint',c.hint,'locale',c.locale);
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.create_solo_challenge(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.solo_action(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.room_action(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.ai_hint_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_solo_challenge(uuid,jsonb), public.solo_action(uuid,text,jsonb), public.room_action(uuid,text,jsonb),public.ai_hint_context(uuid,uuid) to service_role;
