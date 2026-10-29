-- Every circle on the event web shows its person's profile photo (job 187, 2026-10-29)
--
-- Job 74 made Audio / Lighting show the tech's profile photo when the section
-- has no picture of its own (tech_photos = { audio, lighting }). This does the
-- same for the other profiles, in the same object:
--   tech_photos = { audio, lighting, venue, manager, band }
-- Who counts, first match wins: the event owner if their account is that
-- profile, else whoever accepted that profile's invite (invited_role venue /
-- manager / band). A picture set on the section itself still comes first
-- (in the app, lib/sectionPhotos.js). The event picture stays the one thing
-- someone uploads.
--
-- get_shared_gig is otherwise exactly as it is live (2026-10-29, body checked
-- byte-for-byte against the live function). Same signature and security, so
-- existing grants stay.

create or replace function public.get_shared_gig(p_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_show record;
  v_bands jsonb;
  v_requirements jsonb;
  v_tasks jsonb;
  v_owner_name text;
  v_tech_photos jsonb := '{}'::jsonb;
  r record;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    return null;
  end if;

  select up.display_name into v_owner_name
  from public.user_preferences up
  where up.user_id = v_show.owner_id;

  -- The tech(s) on this event and their profile photos.
  for r in
    select k, photo from (
      select 0 as ord, case when up.account_type = 'lighting' then 'lighting' else 'audio' end as k,
             up.profile_photo_url as photo, null::timestamptz as at
      from public.user_preferences up
      where up.user_id = v_show.owner_id and up.account_type in ('engineer', 'lighting')
      union all
      select 1, case when up.account_type = 'lighting' or (up.account_type is distinct from 'engineer' and gi.invited_role = 'lighting') then 'lighting' else 'audio' end,
             up.profile_photo_url, gi.accepted_at
      from public.gig_invites gi
      join public.user_preferences up on up.user_id = gi.accepted_by
      where gi.show_id = v_show.id and gi.status = 'accepted'
        and gi.invited_role in ('engineer', 'lighting')
    ) t
    where coalesce(photo, '') <> ''
    order by ord, at nulls first
  loop
    if not (v_tech_photos ? r.k) then
      v_tech_photos := v_tech_photos || jsonb_build_object(r.k, r.photo);
    end if;
  end loop;

  -- The venue, manager and artist on this event and their profile photos
  -- (job 187), same idea: the owner if their account is that profile, else
  -- whoever accepted that profile's invite.
  for r in
    select k, photo from (
      select 0 as ord, up.account_type as k, up.profile_photo_url as photo, null::timestamptz as at
      from public.user_preferences up
      where up.user_id = v_show.owner_id and up.account_type in ('venue', 'manager', 'band')
      union all
      select 1, gi.invited_role, up.profile_photo_url, gi.accepted_at
      from public.gig_invites gi
      join public.user_preferences up on up.user_id = gi.accepted_by
      where gi.show_id = v_show.id and gi.status = 'accepted'
        and gi.invited_role in ('venue', 'manager', 'band')
    ) t
    where coalesce(photo, '') <> ''
    order by ord, at nulls first
  loop
    if not (v_tech_photos ? r.k) then
      v_tech_photos := v_tech_photos || jsonb_build_object(r.k, r.photo);
    end if;
  end loop;

  select coalesce(jsonb_agg(row_to_json(b) order by b.sort_order), '[]'::jsonb) into v_bands
  from (
    select
      sb.role, sb.band_name, sb.genre_tags, sb.set_length_minutes, sb.sort_order,
      sb.band_members, sb.stage_plot_url, sb.stage_plot_files, sb.artist_fx_notes, sb.general_notes,
      sb.submitter_name, sb.submitter_phone, sb.submitter_email, sb.requested_order,
      sb.photo_url,
      up.card_share_token as submitter_card_share_token,
      up.display_name as submitter_card_display_name
    from public.show_bands sb
    left join public.user_preferences up on up.user_id = sb.submitter_card_user_id
    where sb.show_id = v_show.id
    order by sb.sort_order
  ) b;

  select coalesce(jsonb_agg(row_to_json(r2) order by r2.section, r2.sort_order), '[]'::jsonb) into v_requirements
  from (
    select id, section, name, value, status, note, sort_order, created_at, updated_at
    from public.show_requirements
    where show_id = v_show.id
    order by section, sort_order
  ) r2;

  select coalesce(jsonb_agg(row_to_json(t) order by t.section, t.sort_order), '[]'::jsonb) into v_tasks
  from (
    select gt.id, gt.section, gt.title, gt.status, gt.created_by, gt.completed_by, gt.completed_at,
      gt.sort_order, gt.created_at, gt.updated_at, gt.due_date, gt.details, gt.claimed_by, gt.claimed_at,
      cb.display_name as created_by_name,
      cl.display_name as claimed_by_name
    from public.gig_tasks gt
    left join public.user_preferences cb on cb.user_id = gt.created_by
    left join public.user_preferences cl on cl.user_id = gt.claimed_by
    where gt.show_id = v_show.id
    order by gt.section, gt.sort_order
  ) t;

  return jsonb_build_object(
    'id', v_show.id,
    'event_name', v_show.event_name,
    'band_name', v_show.band_name,
    'venue', v_show.venue,
    'date', v_show.date,
    'city', v_show.city,
    'state', v_show.state,
    'event_type', v_show.event_type,
    'icon_url', v_show.icon_url,
    'bands', v_bands,
    'requirements', v_requirements,
    'tasks', v_tasks,
    'wifi_network', v_show.wifi_network,
    'wifi_password', v_show.wifi_password,
    'console', v_show.console,
    'power_notes', v_show.power_notes,
    'venue_checklist', v_show.venue_checklist,
    'venue_documents', v_show.venue_documents,
    'venue_info', v_show.venue_info,
    'manager_info', v_show.manager_info,
    'promoter_info', v_show.promoter_info,
    'booking_agent_info', v_show.booking_agent_info,
    'engineer_info', v_show.engineer_info,
    'owner_id', v_show.owner_id,
    'owner_display_name', v_owner_name,
    'included_sections', v_show.included_sections,
    'done', v_show.done,
    'tech_photos', v_tech_photos
  );
end;
$function$;
