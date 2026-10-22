-- ============================================================
-- Migration: Additional Services on opener links too; answers shown on
-- Manage Links; rating after the opener form
-- ============================================================
--
-- Follow-up to intake_services_migration.sql (job 138):
--
-- 1. Opener links ("Generate Additional Link" on Manage Links) get the same
--    "Include additional services?" choice, and the opener's Set Info form
--    asks "Interested in getting your set multi-track recorded?" when it's on.
--      opener_requests.include_services, opener_requests.multitrack_interest
--    get_opener_request returns include_services; submit_opener_request
--    saves the answer (same as the live 2026-10-22 version otherwise).
--
-- 2. The engineer sees every answer on Manage Links, beside each submitted
--    link. So submit_tour_manager_request no longer adds an "Additional
--    services: ..." line to the new show's notes (keeps the Performer tab
--    clean); the answer stays on tour_manager_requests.multitrack_interest.
--
-- 3. submit_intake_rating also takes an opener link's token (source
--    'opener_intake'), for the rating box after the opener form.

alter table public.opener_requests add column if not exists include_services boolean not null default false;
alter table public.opener_requests add column if not exists multitrack_interest boolean;

create or replace function public.get_opener_request(p_token uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'status', o.status,
    'include_services', o.include_services,
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
$function$;

create or replace function public.submit_opener_request(p_token uuid, p_form jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request record;
  v_role text;
  v_fx_notes jsonb;
  v_multitrack boolean;
begin
  select * into v_request from public.opener_requests where invite_token = p_token;
  if v_request is null then
    raise exception 'Invalid invite token';
  end if;

  v_role := coalesce(nullif(p_form->>'role', ''), 'Opener');

  -- Additional services: only when the engineer asked for it on this link.
  if v_request.include_services and p_form->>'multitrack_interest' in ('true', 'false') then
    v_multitrack := (p_form->>'multitrack_interest')::boolean;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('artist_name', bm->>'name', 'notes', bm->>'notes')), '[]'::jsonb)
  into v_fx_notes
  from jsonb_array_elements(coalesce(p_form->'band_members', '[]'::jsonb)) bm
  where coalesce(bm->>'notes', '') <> '' and coalesce(bm->>'name', '') <> '';

  update public.opener_requests
  set status = 'submitted',
      role = v_role,
      band_name = p_form->>'band_name',
      genre_tags = coalesce(p_form->'genre_tags', '[]'::jsonb),
      band_members = coalesce(p_form->'band_members', '[]'::jsonb),
      set_length_minutes = nullif(p_form->>'set_length_minutes', '')::int,
      general_notes = p_form->>'general_notes',
      stage_plot_url = p_form->>'stage_plot_url',
      stage_plot_files = coalesce(p_form->'stage_plot_files', '[]'::jsonb),
      artist_fx_notes = v_fx_notes,
      submitted_at = now(),
      submitter_name = p_form->>'submitter_name',
      submitter_phone = p_form->>'submitter_phone',
      submitter_email = p_form->>'submitter_email',
      submitter_card_user_id = nullif(p_form->>'submitter_card_user_id', '')::uuid,
      requested_order = nullif(p_form->>'requested_order', '')::int,
      multitrack_interest = v_multitrack
  where id = v_request.id;

  insert into public.show_bands (
    show_id, role, sort_order, band_name, genre_tags,
    genre_tag, band_members, set_length_minutes, general_notes,
    stage_plot_url, stage_plot_files, artist_fx_notes,
    submitter_name, submitter_phone, submitter_email,
    submitter_card_user_id, requested_order
  )
  select
    tmr.created_show_id, v_role, v_request.order_index,
    p_form->>'band_name', coalesce(p_form->'genre_tags', '[]'::jsonb),
    p_form->'genre_tags'->>0,
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
  from public.tour_manager_requests tmr
  where tmr.id = v_request.tour_manager_request_id
    and tmr.created_show_id is not null;
end;
$function$;

-- Rating after either form: a performer intake token or an opener link token.
create or replace function public.submit_intake_rating(p_token uuid, p_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request record;
  v_opener record;
  v_email text;
  v_source text := 'performer_intake';
  v_context text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1 to 5';
  end if;

  select * into v_request from public.tour_manager_requests where invite_token = p_token;
  if v_request is null then
    select * into v_opener from public.opener_requests where invite_token = p_token;
    if v_opener is null then
      raise exception 'Invalid intake link';
    end if;
    if v_opener.status is distinct from 'submitted' then
      raise exception 'Submit the form before rating';
    end if;
    select * into v_request from public.tour_manager_requests where id = v_opener.tour_manager_request_id;
    v_source := 'opener_intake';
    v_context := concat_ws(' / ', nullif(v_opener.band_name, ''), 'opening for ' || nullif(v_request.band_name, ''),
      nullif(v_request.venue, ''), v_request.date::text);
  else
    if v_request.status is distinct from 'submitted' then
      raise exception 'Submit the form before rating';
    end if;
    v_context := concat_ws(' / ', nullif(v_request.band_name, ''), nullif(v_request.venue, ''), v_request.date::text);
  end if;

  if auth.uid() is not null then
    select email into v_email from auth.users where id = auth.uid();
  end if;

  insert into public.app_ratings (rating, comment, user_email, submitted_at, source, context)
  values (
    p_rating,
    nullif(left(btrim(coalesce(p_comment, '')), 2000), ''),
    coalesce(v_email, ''),
    now(),
    v_source,
    left(v_context, 300)
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
  -- The answer is shown on Manage Links, not in the show's notes.
  v_show_notes := p_form->>'general_notes';

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
