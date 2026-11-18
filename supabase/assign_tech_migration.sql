-- Add a tech to an event (job 326): the venue side or the manager / artist
-- side can put an audio engineer or lighting tech on an event, either from
-- their Fellow Pilots (the tech's digital card) or as a name, phone and
-- email. Before this only the event's owner and the techs themselves could
-- change the Audio / Lighting section (update_gig_section replaces all of
-- engineer_info).
--
-- assign_gig_tech(token, 'audio' | 'lighting', tech) merges into
-- engineer_info[role] only these fields: contact_name, contact_phone,
-- contact_email, card_user_id (a uuid), card_share_token (the card's link).
-- A field sent as null or "" is cleared; fields not sent stay as they are;
-- everything else in engineer_info is left alone. Returns the new
-- engineer_info.
--
-- Who can: the event's owner, and anyone who joined it through an invite
-- (venue, manager, artist, or a tech), or was granted the venue / manager /
-- audio section. Safe to run more than once.

create or replace function public.assign_gig_tech(p_token uuid, p_role text, p_tech jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_show record;
  v_ok boolean;
  v_clean jsonb;
  v_cur jsonb;
  v_new jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add a tech';
  end if;
  if p_role is null or p_role not in ('audio', 'lighting') then
    raise exception 'Unknown tech: %', p_role;
  end if;

  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Event not found';
  end if;

  v_ok := auth.uid() = v_show.owner_id or exists (
    select 1 from public.gig_invites gi
    where gi.show_id = v_show.id and gi.status = 'accepted' and gi.accepted_by = auth.uid()
      and (gi.invited_role in ('venue', 'manager', 'band', 'engineer', 'lighting')
           or coalesce(gi.granted_sections, '{}') && array['venue', 'manager', 'engineer'])
  );
  if not v_ok then
    raise exception 'You can''t add a tech to this event';
  end if;

  -- Only the contact fields, as short text; "" and null clear a field.
  select coalesce(jsonb_object_agg(
           e.key,
           case when jsonb_typeof(e.value) = 'null' or coalesce(e.value #>> '{}', '') = '' then 'null'::jsonb
                else to_jsonb(left(e.value #>> '{}', 300)) end
         ), '{}'::jsonb)
    into v_clean
  from jsonb_each(coalesce(p_tech, '{}'::jsonb)) e
  where e.key in ('contact_name', 'contact_phone', 'contact_email', 'card_user_id', 'card_share_token');

  -- A card must be a real id.
  if v_clean->>'card_user_id' is not null then
    perform (v_clean->>'card_user_id')::uuid;
  end if;

  v_cur := coalesce(v_show.engineer_info, '{}'::jsonb);
  if jsonb_typeof(v_cur) <> 'object' then v_cur := '{}'::jsonb; end if;
  v_new := v_cur || jsonb_build_object(
    p_role,
    (case when jsonb_typeof(v_cur->p_role) = 'object' then v_cur->p_role else '{}'::jsonb end) || v_clean
  );

  update public.shows set engineer_info = v_new where id = v_show.id;
  return v_new;
end;
$$;

revoke all on function public.assign_gig_tech(uuid, text, jsonb) from public, anon;
grant execute on function public.assign_gig_tech(uuid, text, jsonb) to authenticated;
