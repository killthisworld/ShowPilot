-- ============================================================
-- Migration: Performer Intake link for an event that already exists (job 159)
-- ============================================================
--
-- When an engineer makes an intake link they can now pick one of their own
-- events instead of "New event". The performer fills in the same form; on
-- submit the act goes into THAT event's lineup instead of a new event being
-- created.
--
--   tour_manager_requests.target_show_id  the event picked for the link (null = new event)
--
-- submit_tour_manager_request: the live version (2026-10-25) unchanged for a
-- new event. With a target event (only when the engineer who made the link
-- owns it):
--   - the act fills the event's first empty lineup slot, else is added at the end
--   - the event's headliner fields (band_name, members, stage plot, genre)
--     are set only when the event has no headliner yet
--   - venue / city / state / location / console / wifi are filled only where
--     the event has them blank; event name, type, date, notes are left alone
--   - openers already submitted for the link are added after it
--   - created_show_id points at the target event
-- A target that's gone or not the engineer's falls back to a new event.

alter table public.tour_manager_requests
  add column if not exists target_show_id uuid references public.shows(id) on delete set null;

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
  v_target_id uuid;
  v_target_date date;
  v_slot uuid;
  v_next int;
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
  -- The answer is shown on Manage Links, not in the show's notes.
  v_show_notes := p_form->>'general_notes';

  select coalesce(jsonb_agg(jsonb_build_object('artist_name', bm->>'name', 'notes', bm->>'notes')), '[]'::jsonb)
  into v_fx_notes
  from jsonb_array_elements(coalesce(p_form->'band_members', '[]'::jsonb)) bm
  where coalesce(bm->>'notes', '') <> '' and coalesce(bm->>'name', '') <> '';

  -- An existing event picked for the link (job 159): only the engineer's own.
  if v_request.target_show_id is not null then
    select id, date into v_target_id, v_target_date from public.shows
    where id = v_request.target_show_id and owner_id = v_request.engineer_user_id;
  end if;

  if v_target_id is not null then
    v_show_id := v_target_id;
    v_date := coalesce(v_target_date, v_date);

    update public.shows set
      band_name        = case when coalesce(band_name, '') = '' then p_form->>'band_name' else band_name end,
      band_members     = case when coalesce(band_name, '') = '' then coalesce(p_form->'band_members', '[]'::jsonb) else band_members end,
      stage_plot_url   = case when coalesce(band_name, '') = '' then p_form->>'stage_plot_url' else stage_plot_url end,
      stage_plot_files = case when coalesce(band_name, '') = '' then coalesce(p_form->'stage_plot_files', '[]'::jsonb) else stage_plot_files end,
      genre_tag        = case when coalesce(band_name, '') = '' then v_genre_tag else genre_tag end,
      genre_tags       = case when coalesce(band_name, '') = '' then coalesce(p_form->'genre_tags', '[]'::jsonb) else genre_tags end,
      venue            = coalesce(nullif(venue, ''), nullif(p_form->>'venue', '')),
      city             = coalesce(nullif(city, ''), nullif(p_form->>'city', '')),
      state            = coalesce(nullif(state, ''), nullif(p_form->>'state', '')),
      location         = coalesce(nullif(location, ''), nullif(v_location, '')),
      console          = coalesce(nullif(console, ''), nullif(p_form->>'console', '')),
      wifi_network     = coalesce(nullif(wifi_network, ''), nullif(p_form->>'wifi_network', '')),
      wifi_password    = coalesce(nullif(wifi_password, ''), nullif(p_form->>'wifi_password', '')),
      updated_at       = now()
    where id = v_show_id;

    -- The first empty lineup slot (e.g. the blank act a new event starts with), else the end.
    select id into v_slot from public.show_bands
    where show_id = v_show_id and coalesce(band_name, '') = ''
    order by sort_order asc limit 1;

    if v_slot is not null then
      update public.show_bands set
        role = v_role,
        band_name = p_form->>'band_name',
        genre_tags = coalesce(p_form->'genre_tags', '[]'::jsonb),
        genre_tag = v_genre_tag,
        band_members = coalesce(p_form->'band_members', '[]'::jsonb),
        set_length_minutes = nullif(p_form->>'set_length_minutes', '')::int,
        general_notes = p_form->>'general_notes',
        stage_plot_url = p_form->>'stage_plot_url',
        stage_plot_files = coalesce(p_form->'stage_plot_files', '[]'::jsonb),
        artist_fx_notes = v_fx_notes,
        submitter_name = p_form->>'submitter_name',
        submitter_phone = p_form->>'submitter_phone',
        submitter_email = p_form->>'submitter_email',
        submitter_card_user_id = nullif(p_form->>'submitter_card_user_id', '')::uuid,
        requested_order = nullif(p_form->>'requested_order', '')::int,
        updated_at = now()
      where id = v_slot;
    else
      select coalesce(max(sort_order), -1) + 1 into v_next from public.show_bands where show_id = v_show_id;
      insert into public.show_bands (
        show_id, role, sort_order, band_name, genre_tags, genre_tag,
        band_members, set_length_minutes, general_notes, stage_plot_url, stage_plot_files,
        artist_fx_notes, submitter_name, submitter_phone, submitter_email,
        submitter_card_user_id, requested_order
      ) values (
        v_show_id, v_role, v_next,
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
    end if;

    -- Openers already submitted for this link go after it.
    select coalesce(max(sort_order), -1) + 1 into v_next from public.show_bands where show_id = v_show_id;
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
        v_show_id, v_pending_opener.role, v_next,
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
      v_next := v_next + 1;
    end loop;
  else
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
  end if;

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
