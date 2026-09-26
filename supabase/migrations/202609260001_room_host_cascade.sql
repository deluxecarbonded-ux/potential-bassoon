-- Let an account that has hosted a match actually be deleted.
--
-- Every other foreign key in this schema that points at auth.users cascades:
-- profiles, room_players, solo_progress, private.ai_usage, and auth's own sessions and
-- identities. rooms.host_id did not, and it was the only one left, which meant the
-- first person to host a game could never erase their account - the delete failed on
-- this constraint and the room was orphaned behind it. That is not a preference about
-- match history, it is a dead end: the one account that has done the most is the one
-- account that can never be removed.
--
-- Cascade rather than set null. A null host is a third state nothing downstream knows
-- how to handle: leave_room hands hosting to another member, and start_room refuses
-- anyone who is not the host, so a null-hosted room would sit in 'waiting' forever
-- with no way to begin. Trading an unstartable lobby for retained match history is a
-- bad trade. A room is a lobby that dies with its match anyway, and erasing an account
-- is a stronger and explicitly requested right than keeping a co-players' game log.
--
-- host_id stays not null, so nothing in room_action or advance_room changes.
alter table public.rooms drop constraint if exists rooms_host_id_fkey;
alter table public.rooms
  add constraint rooms_host_id_fkey
  foreign key (host_id) references auth.users(id) on delete cascade;
