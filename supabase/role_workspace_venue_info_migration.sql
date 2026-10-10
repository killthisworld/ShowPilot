-- Role workspaces (desktop): the venue's section gains address, load-in,
-- schedule, house gear and hospitality details. Promoter, booking agent
-- and manager already keep their whole section in one jsonb column, so
-- only the venue needs a new home for its extra fields: shows.venue_info.
--
-- Rebuilt from the live definitions of update_gig_section and
-- get_shared_gig (same permission checks, same fields) with venue_info
-- added to each. Safe to re-run.

alter table public.shows add column if not exists venue_info jsonb not null default '{}'::jsonb;

create or replace function public.update_gig_section(p_token uuid, p_section text, p_updates jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_is_owner boolean;
  v_has_role boolean;
  v_role_claimed boolean;
  v_role_invited boolean;
  v_has_grant boolean;
  v_role_match text[];
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Gig not found';
  end if;

  v_is_owner := (auth.uid() is not null and auth.uid() = v_show.owner_id);

  if not v_is_owner then
    if auth.uid() is null then
      raise exception 'Must be signed in to edit';
    end if;

    if p_section in ('engineer', 'lighting') then
      v_role_match := array['engineer', 'lighting'];
    else
      v_role_match := array[p_section];
    end if;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid() and invited_role = any(v_role_match)
    ) into v_has_role;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and invited_role = any(v_role_match)
    ) into v_role_claimed;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and invited_role = any(v_role_match)
    ) into v_role_invited;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid() and p_section = any(coalesce(granted_sections, '{}'))
    ) into v_has_grant;

    if not v_has_role and not v_has_grant and (v_role_claimed or not v_role_invited) then
      raise exception 'You do not have permission to edit this section';
    end if;
  end if;

  if p_section = 'venue' then
    update public.shows set
      venue = coalesce(p_updates->>'venue', venue),
      city = coalesce(p_updates->>'city', city),
      state = coalesce(p_updates->>'state', state),
      wifi_network = coalesce(p_updates->>'wifi_network', wifi_network),
      wifi_password = coalesce(p_updates->>'wifi_password', wifi_password),
      console = coalesce(p_updates->>'console', console),
      power_notes = coalesce(p_updates->>'power_notes', power_notes),
      venue_checklist = coalesce(p_updates->'venue_checklist', venue_checklist),
      venue_documents = coalesce(p_updates->'venue_documents', venue_documents),
      venue_info = case when jsonb_typeof(p_updates->'venue_info') = 'object' then p_updates->'venue_info' else venue_info end
    where id = v_show.id;
  elsif p_section = 'manager' then
    update public.shows set manager_info = p_updates where id = v_show.id;
  elsif p_section = 'promoter' then
    update public.shows set promoter_info = p_updates where id = v_show.id;
  elsif p_section = 'booking_agent' then
    update public.shows set booking_agent_info = p_updates where id = v_show.id;
  elsif p_section in ('engineer', 'lighting') then
    update public.shows set engineer_info = p_updates where id = v_show.id;
  else
    raise exception 'Unknown section: %', p_section;
  end if;
end;
$function$;

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
    'venue_info', v_show.venue_info,
    'manager_info', v_show.manager_info,
    'promoter_info', v_show.promoter_info,
    'booking_agent_info', v_show.booking_agent_info,
    'engineer_info', v_show.engineer_info,
    'owner_id', v_show.owner_id,
    'owner_display_name', v_owner_name,
    'included_sections', v_show.included_sections,
    'done', v_show.done
  );
end;
$function$;
