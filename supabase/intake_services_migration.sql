-- ============================================================
-- Migration: "Additional Services" on the Performer Intake form
-- ============================================================
--
-- When an engineer makes a Performer Intake link they choose "Include
-- additional services?". If yes, the intake form asks the performer
-- "Interested in getting your set multi-track recorded?" (Yes / No). No
-- payment; it just lets the engineer know ahead of time so details can be
-- worked out at the event.
--
--   tour_manager_requests.include_services     set by the engineer with the link
--   tour_manager_requests.multitrack_interest  the performer's answer (null = not asked / skipped)
--
-- The answer also lands as a line at the end of the new show's notes, so the
-- engineer sees it on the event.
--
-- get_tour_manager_request: the public (non-owner) view also returns
-- include_services so the form knows whether to ask.
-- submit_tour_manager_request: same as the live version (2026-10-22) plus the
-- answer saved on the request and the notes line.

alter table public.tour_manager_requests add column if not exists include_services boolean not null default false;
alter table public.tour_manager_requests add column if not exists multitrack_interest boolean;

create or replace function public.get_tour_manager_request(p_token uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
    'engineer_name', r.engineer_name,
    'include_services', r.include_services
  );
end;
$function$;

create or replace function public.submit_tour_manager_request(p_token uuid, p_form jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request record;
  v_show_id uuid;
  v_location text;
  v_genre_tag text;
  v_role text;
  v_fx_notes jsonb;
  v_pending_opener record;
  v_event_name text;
  v_date date;
  v_multitrack boolean;
  v_show_notes text;
begin
  select * into v_request from public.tour_manager_requests where invite_token = p_token;
  if v_request is null then
    raise exception 'Invalid invite token';
  end if;

  v_location := trim(both ', ' from concat_ws(', ', nullif(p_form->>'city', ''), nullif(p_form->>'state', '')));
  v_genre_tag := p_form->'genre_tags'->>0;
  v_role := coalesce(nullif(p_form->>'role', ''), 'Headliner');
  -- The intake form never lets the Tour Manager edit event name/date, so
  -- p_form's values are always empty. Fall back to what the engineer set
  -- when they generated the link, instead of blank / today's date.
  v_event_name := coalesce(nullif(p_form->>'event_name', ''), v_request.event_name);
  v_date := coalesce(nullif(p_form->>'date', '')::date, v_request.date, current_date);

  -- Additional services: only when the engineer asked for it on this link.
  if v_request.include_services and p_form->>'multitrack_interest' in ('true', 'false') then
    v_multitrack := (p_form->>'multitrack_interest')::boolean;
  end if;
  v_show_notes := p_form->>'general_notes';
  if v_multitrack is not null then
    v_show_notes := concat_ws(E'\n\n', nullif(btrim(coalesce(v_show_notes, '')), ''),
      case when v_multitrack
        then 'Additional services: YES, interested in getting their set multi-track recorded (details at the event).'
        else 'Additional services: no multi-track recording.'
      end);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('artist_name', bm->>'name', 'notes', bm->>'notes')), '[]'::jsonb)
  into v_fx_notes
  from jsonb_array_elements(coalesce(p_form->'band_members', '[]'::jsonb)) bm
  where coalesce(bm->>'notes', '') <> '' and coalesce(bm->>'name', '') <> '';

  insert into public.shows (
    owner_id, event_name, band_name, venue, date, location, city, state, event_type,
    genre_tag, genre_tags, console,
    wifi_network, wifi_password, contacts, stage_plot_url, stage_plot_files,
    band_members, general_notes, status
  ) values (
    v_request.engineer_user_id,
    v_event_name,
    p_form->>'band_name',
    p_form->>'venue',
    v_date,
    v_location,
    nullif(p_form->>'city', ''),
    nullif(p_form->>'state', ''),
    nullif(p_form->>'event_type', ''),
    v_genre_tag,
    coalesce(p_form->'genre_tags', '[]'::jsonb),
    p_form->>'console',
    p_form->>'wifi_network',
    p_form->>'wifi_password',
    coalesce(p_form->'contacts', '[]'::jsonb),
    p_form->>'stage_plot_url',
    coalesce(p_form->'stage_plot_files', '[]'::jsonb),
    coalesce(p_form->'band_members', '[]'::jsonb),
    v_show_notes,
    'not_started'
  ) returning id into v_show_id;

  insert into public.show_bands (
    show_id, role, sort_order, band_name, genre_tags, genre_tag,
    band_members, set_length_minutes, general_notes, stage_plot_url, stage_plot_files,
    artist_fx_notes, submitter_name, submitter_phone, submitter_email,
    submitter_card_user_id, requested_order
  ) values (
    v_show_id, v_role, 0,
    p_form->>'band_name', coalesce(p_form->'genre_tags', '[]'::jsonb), v_genre_tag,
    coalesce(p_form->'band_members', '[]'::jsonb),
    nullif(p_form->>'set_length_minutes', '')::int,
    p_form->>'general_notes',
    p_form->>'stage_plot_url',
    coalesce(p_form->'stage_plot_files', '[]'::jsonb),
    v_fx_notes,
    p_form->>'submitter_name',
    p_form->>'submitter_phone',
    p_form->>'submitter_email',
    nullif(p_form->>'submitter_card_user_id', '')::uuid,
    nullif(p_form->>'requested_order', '')::int
  );

  for v_pending_opener in
    select * from public.opener_requests
    where tour_manager_request_id = v_request.id and status = 'submitted'
    order by order_index asc
  loop
    insert into public.show_bands (
      show_id, role, sort_order, band_name, genre_tags, genre_tag,
      band_members, set_length_minutes, general_notes, stage_plot_url, stage_plot_files,
      artist_fx_notes, submitter_name, submitter_phone, submitter_email,
      submitter_card_user_id, requested_order
    ) values (
      v_show_id, v_pending_opener.role, v_pending_opener.order_index,
      v_pending_opener.band_name, coalesce(v_pending_opener.genre_tags, '[]'::jsonb),
      v_pending_opener.genre_tags->>0,
      coalesce(v_pending_opener.band_members, '[]'::jsonb),
      v_pending_opener.set_length_minutes, v_pending_opener.general_notes,
      v_pending_opener.stage_plot_url,
      coalesce(v_pending_opener.stage_plot_files, '[]'::jsonb),
      coalesce(v_pending_opener.artist_fx_notes, '[]'::jsonb),
      v_pending_opener.submitter_name,
      v_pending_opener.submitter_phone,
      v_pending_opener.submitter_email,
      v_pending_opener.submitter_card_user_id,
      v_pending_opener.requested_order
    );
  end loop;

  update public.tour_manager_requests
  set status = 'submitted',
      band_name = p_form->>'band_name',
      venue = p_form->>'venue',
      date = v_date,
      location = v_location,
      city = nullif(p_form->>'city', ''),
      state = nullif(p_form->>'state', ''),
      event_type = nullif(p_form->>'event_type', ''),
      console = p_form->>'console',
      wifi_network = p_form->>'wifi_network',
      wifi_password = p_form->>'wifi_password',
      contacts = coalesce(p_form->'contacts', '[]'::jsonb),
      band_members = coalesce(p_form->'band_members', '[]'::jsonb),
      general_notes = p_form->>'general_notes',
      created_show_id = v_show_id,
      submitter_name = p_form->>'submitter_name',
      submitter_phone = p_form->>'submitter_phone',
      submitter_email = p_form->>'submitter_email',
      submitter_card_user_id = nullif(p_form->>'submitter_card_user_id', '')::uuid,
      requested_order = nullif(p_form->>'requested_order', '')::int,
      multitrack_interest = v_multitrack
  where id = v_request.id;

  return v_show_id;
end;
$function$;
