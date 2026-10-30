-- Leave an event you were invited to (job 73, 2026-10-30).
--
-- Until now someone on an event they don't own had no way off it: deleting
-- the linked_gigs row only hid it from their lists, while their accepted
-- invite still gave them the profile, its edit rights, its tasks on Needs me
-- and its chat rooms. leave_gig takes them off completely:
--   - the event leaves their lists (linked_gigs),
--   - the profile they held opens up again (their accepted invite is removed,
--     so the owner sees INVITE for it and can invite someone else),
--   - they leave the event's chat rooms,
--   - their own picture for the event goes too.
-- The owner can't leave their own event; they delete (or archive) it instead.

create or replace function public.leave_gig(p_token uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  select id, owner_id into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Invalid share link';
  end if;

  if v_show.owner_id = v_uid then
    raise exception 'You own this event. Delete or archive it instead.';
  end if;

  delete from public.linked_gigs where show_id = v_show.id and user_id = v_uid;
  delete from public.gig_invites where show_id = v_show.id and accepted_by = v_uid;
  delete from public.conversation_participants
    where user_id = v_uid
      and conversation_id in (select id from public.conversations where show_id = v_show.id);
  delete from public.gig_user_icons where show_id = v_show.id and user_id = v_uid;
end;
$function$;

revoke all on function public.leave_gig(uuid) from public, anon;
grant execute on function public.leave_gig(uuid) to authenticated;
