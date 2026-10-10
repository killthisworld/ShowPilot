-- Job #2: stop anyone with the public (anon) key from reading every row.
--
-- Before this, five tables had a SELECT policy of USING (true) for every
-- role, and tour_manager_requests also let anyone UPDATE any row. The
-- pages that open shared links only *asked* for the row matching their
-- token; nothing enforced it. This migration:
--   1. adds token-taking SECURITY DEFINER lookups for the three pages that
--      still read those tables directly (shared show, tour manager intake,
--      opener intake), and adds `done` to get_shared_gig so the Cockpit
--      Logbook can use it for linked shows instead of reading shows itself;
--   2. drops the open policies. Owners keep their existing own-row
--      policies; logbook_month_settings gets an owner-only SELECT.
-- Existing lookups (get_shared_gig, get_fan_event, get_public_logbook,
-- submit_* ...) run as postgres, which bypasses RLS, so they keep working.
-- Edge functions use the service role and are unaffected.

begin;

-- 1a. Shared show page (/shared/:id?token=...): only the fields it edits.
create or replace function public.get_shared_show(p_show_id uuid, p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', s.id,
    'band_name', s.band_name,
    'venue', s.venue,
    'location', s.location,
    'date', s.date,
    'console', s.console,
    'contacts', s.contacts,
    'band_members', s.band_members,
    'general_notes', s.general_notes
  )
  from public.shows s
  where p_token is not null and s.id = p_show_id and s.share_token = p_token;
$$;

-- 1b. Tour manager intake (/tm-intake?token=...). The engineer who made the
-- link gets the whole request (their own data); anyone else holding the
-- link gets only what the intake form shows before submitting.
create or replace function public.get_tour_manager_request(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r public.tour_manager_requests;
begin
  if p_token is null then
    return null;
  end if;
  select * into r from public.tour_manager_requests where invite_token = p_token;
  if not found then
    return null;
  end if;
  if auth.uid() is not null and auth.uid() = r.engineer_user_id then
    return to_jsonb(r);
  end if;
  return jsonb_build_object(
    'status', r.status,
    'event_name', r.event_name,
    'date', r.date,
    'engineer_name', r.engineer_name
  );
end;
$$;

-- 1c. Opener intake (/opener-intake?token=...): the opener's status and the
-- headline details of the show they're joining, in the same shape the page
-- used to get from the embedded select.
create or replace function public.get_opener_request(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'status', o.status,
    'tour_manager_requests', case when t.id is null then null else jsonb_build_object(
      'band_name', t.band_name,
      'event_name', t.event_name,
      'venue', t.venue,
      'date', t.date,
      'location', t.location,
      'engineer_user_id', t.engineer_user_id
    ) end
  )
  from public.opener_requests o
  left join public.tour_manager_requests t on t.id = o.tour_manager_request_id
  where p_token is not null and o.invite_token = p_token;
$$;

-- 1d. get_shared_gig: unchanged except it now also returns `done`.
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

revoke all on function public.get_shared_show(uuid, uuid) from public;
revoke all on function public.get_tour_manager_request(uuid) from public;
revoke all on function public.get_opener_request(uuid) from public;
grant execute on function public.get_shared_show(uuid, uuid) to anon, authenticated;
grant execute on function public.get_tour_manager_request(uuid) to anon, authenticated;
grant execute on function public.get_opener_request(uuid) to anon, authenticated;

-- 2. Close the open policies.
drop policy if exists "Public can view shows via share_token" on public.shows;
drop policy if exists "Public can view bands via parent show" on public.show_bands;
drop policy if exists "Public can view a request via invite_token" on public.tour_manager_requests;
drop policy if exists "Public can submit a request via invite_token" on public.tour_manager_requests;
drop policy if exists "Anyone with the token can view an opener request" on public.opener_requests;
drop policy if exists "Anyone can view logbook month settings" on public.logbook_month_settings;

drop policy if exists "Users can view their own logbook month settings" on public.logbook_month_settings;
create policy "Users can view their own logbook month settings"
  on public.logbook_month_settings for select
  using (auth.uid() = user_id);

commit;
