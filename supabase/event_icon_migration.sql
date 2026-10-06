-- Custom event icon: an image the owner uploads for an event. Stored in the
-- existing public profile-photos bucket under <user_id>/event-icons/, so no
-- new bucket or storage policy is needed. Linked users see it through
-- get_shared_gig.
alter table public.shows add column if not exists icon_url text;

CREATE OR REPLACE FUNCTION public.get_shared_gig(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_show record;
  v_bands jsonb;
  v_requirements jsonb;
  v_tasks jsonb;
  v_owner_name text;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    return null;
  end if;

  select up.display_name into v_owner_name
  from public.user_preferences up
  where up.user_id = v_show.owner_id;

  select coalesce(jsonb_agg(row_to_json(b) order by b.sort_order), '[]'::jsonb) into v_bands
  from (
    select
      sb.role, sb.band_name, sb.genre_tags, sb.set_length_minutes, sb.sort_order,
      sb.band_members, sb.stage_plot_url, sb.stage_plot_files, sb.artist_fx_notes, sb.general_notes,
      sb.submitter_name, sb.submitter_phone, sb.submitter_email, sb.requested_order,
      up.card_share_token as submitter_card_share_token,
      up.display_name as submitter_card_display_name
    from public.show_bands sb
    left join public.user_preferences up on up.user_id = sb.submitter_card_user_id
    where sb.show_id = v_show.id
    order by sb.sort_order
  ) b;

  select coalesce(jsonb_agg(row_to_json(r) order by r.section, r.sort_order), '[]'::jsonb) into v_requirements
  from (
    select id, section, name, value, status, note, sort_order, created_at, updated_at
    from public.show_requirements
    where show_id = v_show.id
    order by section, sort_order
  ) r;

  select coalesce(jsonb_agg(row_to_json(t) order by t.section, t.sort_order), '[]'::jsonb) into v_tasks
  from (
    select id, section, title, status, created_by, completed_by, completed_at, sort_order, created_at, updated_at
    from public.gig_tasks
    where show_id = v_show.id
    order by section, sort_order
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
    'manager_info', v_show.manager_info,
    'promoter_info', v_show.promoter_info,
    'booking_agent_info', v_show.booking_agent_info,
    'engineer_info', v_show.engineer_info,
    'owner_id', v_show.owner_id,
    'owner_display_name', v_owner_name,
    'included_sections', v_show.included_sections
  );
end;
$function$;
