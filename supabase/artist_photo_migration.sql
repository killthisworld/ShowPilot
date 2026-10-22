-- ============================================================
-- Migration: a photo per act (show_bands.photo_url)
-- ============================================================
--
-- Artist / act photos, like the venue photo (job 145): each act on a show has
-- a photo (upload, crop, change, remove) on the Performer section, saved with
-- Artist templates (Load Artist) so it comes back on every show.
--
-- The event web's lineup reads acts through get_shared_gig and saves them
-- through update_shared_gig (which deletes and re-inserts every act), so both
-- carry photo_url; otherwise a lineup save would drop the photos.
-- Both functions are the live 2026-10-22 versions plus photo_url only.
--
-- (The manager / artist profile photo on the event lives in
-- shows.manager_info.photo_url and needs no change here.)

alter table public.show_bands add column if not exists photo_url text;

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
      sb.photo_url,
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
    'done', v_show.done
  );
end;
$function$;

create or replace function public.update_shared_gig(p_token uuid, p_updates jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_show record;
  v_band jsonb;
  v_location text;
  v_is_owner boolean;
  v_has_manager_role boolean;
  v_manager_claimed boolean;
  v_manager_invited boolean;
  v_has_manager_grant boolean;
  v_wants_event_fields boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in required to edit';
  end if;

  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Invalid share link';
  end if;

  v_is_owner := (auth.uid() = v_show.owner_id);

  v_wants_event_fields := (
    p_updates ? 'event_name' or p_updates ? 'band_name' or p_updates ? 'venue' or
    p_updates ? 'date' or p_updates ? 'city' or p_updates ? 'state' or p_updates ? 'event_type'
  );

  if v_wants_event_fields and not v_is_owner then
    raise exception 'Only the owner can edit event details';
  end if;

  if p_updates ? 'bands' and not v_is_owner then
    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid() and invited_role = 'manager'
    ) into v_has_manager_role;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and invited_role = 'manager'
    ) into v_manager_claimed;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and invited_role = 'manager'
    ) into v_manager_invited;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid() and 'manager' = any(coalesce(granted_sections, '{}'))
    ) into v_has_manager_grant;

    if not v_has_manager_role and not v_has_manager_grant then
      raise exception 'You do not have permission to edit the lineup';
    end if;
  end if;

  if v_wants_event_fields then
    v_location := trim(both ', ' from concat_ws(', ', nullif(p_updates->>'city', ''), nullif(p_updates->>'state', '')));

    update public.shows set
      event_name = coalesce(p_updates->>'event_name', event_name),
      band_name = coalesce(nullif(p_updates->>'band_name', ''), band_name),
      venue = coalesce(p_updates->>'venue', venue),
      date = coalesce(nullif(p_updates->>'date', '')::date, date),
      city = coalesce(nullif(p_updates->>'city', ''), city),
      state = coalesce(nullif(p_updates->>'state', ''), state),
      location = coalesce(nullif(v_location, ''), location),
      event_type = coalesce(nullif(p_updates->>'event_type', ''), event_type)
    where id = v_show.id;
  end if;

  if p_updates ? 'bands' then
    delete from public.show_bands where show_id = v_show.id;
    for v_band in select * from jsonb_array_elements(p_updates->'bands')
    loop
      if coalesce(v_band->>'band_name', '') <> '' then
        insert into public.show_bands (
          show_id, role, sort_order, band_name, genre_tags, set_length_minutes,
          band_members, stage_plot_url, stage_plot_files, artist_fx_notes, general_notes,
          submitter_name, submitter_phone, submitter_email, submitter_card_user_id, requested_order,
          photo_url
        )
        values (
          v_show.id,
          coalesce(nullif(v_band->>'role', ''), 'N/A'),
          coalesce((v_band->>'sort_order')::int, 0),
          v_band->>'band_name',
          coalesce(v_band->'genre_tags', '[]'::jsonb),
          nullif(v_band->>'set_length_minutes', '')::int,
          coalesce(v_band->'band_members', '[]'::jsonb),
          v_band->>'stage_plot_url',
          coalesce(v_band->'stage_plot_files', '[]'::jsonb),
          coalesce(v_band->'artist_fx_notes', '[]'::jsonb),
          v_band->>'general_notes',
          v_band->>'submitter_name',
          v_band->>'submitter_phone',
          v_band->>'submitter_email',
          nullif(v_band->>'submitter_card_user_id', '')::uuid,
          nullif(v_band->>'requested_order', '')::int,
          nullif(v_band->>'photo_url', '')
        );
      end if;
    end loop;
  end if;
end;
$function$;
