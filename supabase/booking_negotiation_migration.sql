-- Job 347: booking back-and-forth.
--
-- A package no longer ends after one offer. Either side can send dates and the
-- other can confirm one or counter with its own, until one side books it.
--   sent      the act sent months / nights (or specific dates); waiting on the venue
--   offered   the venue sent dates (several, each with its own times); waiting on the act
--   countered the act sent other dates; waiting on the venue
--   booked    one date confirmed by either side; the event exists
--   declined  the venue passed
-- offers_from says who wrote the dates now in `offers` ('venue' or 'act').
-- rounds is the history, newest last.

alter table public.booking_packages
  add column if not exists offers_from text not null default 'venue',
  add column if not exists sender_message text not null default '',
  add column if not exists rounds jsonb not null default '[]'::jsonb;

-- The sender can send specific dates instead of months (wants.dates).
create or replace function public.send_booking_package(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.booking_packages;
  v_code text;
  v_try integer := 0;
begin
  select * into v_row from public.booking_packages where id = p_id and created_by = v_uid;
  if v_row.id is null or v_row.status = 'withdrawn' then
    raise exception 'package not found';
  end if;
  if btrim(v_row.act_name) = '' then
    raise exception 'needs the artist name';
  end if;
  if not (
       (jsonb_typeof(v_row.wants->'months') = 'array' and jsonb_array_length(v_row.wants->'months') > 0)
    or (jsonb_typeof(v_row.wants->'dates') = 'array' and jsonb_array_length(v_row.wants->'dates') > 0)
  ) then
    raise exception 'needs the dates wanted';
  end if;
  if btrim(v_row.to_name) = '' or (btrim(v_row.to_email) = '' and btrim(v_row.to_phone) = '') then
    raise exception 'needs who it goes to';
  end if;
  v_code := v_row.code;
  while v_code is null loop
    v_try := v_try + 1;
    v_code := public.gen_booking_code();
    if exists (select 1 from public.booking_packages where code = v_code) then
      v_code := null;
      if v_try > 20 then raise exception 'could not make a code'; end if;
    end if;
  end loop;
  update public.booking_packages
     set code = v_code, status = 'sent', sent_at = coalesce(sent_at, now()), updated_at = now()
   where id = p_id
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- Dates as stored: up to 10, each { date, set_time, load_in, billing }.
create or replace function public._clean_booking_dates(p_offers jsonb)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  v_out jsonb := '[]'::jsonb;
  v_o jsonb;
begin
  if jsonb_typeof(p_offers) is distinct from 'array' then
    return v_out;
  end if;
  for v_o in select * from jsonb_array_elements(p_offers) limit 10 loop
    if coalesce(v_o->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'date', v_o->>'date',
        'set_time', left(coalesce(v_o->>'set_time', ''), 20),
        'load_in', left(coalesce(v_o->>'load_in', ''), 20),
        'billing', left(coalesce(v_o->>'billing', ''), 40)));
    end if;
  end loop;
  return v_out;
end;
$function$;

-- The venue answers: dates that work (several, each with its own times), or a pass.
-- Works the first time and again after the act counters.
create or replace function public.respond_booking_package(p_code text, p_offers jsonb, p_message text, p_decline boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.booking_packages;
  v_offers jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into v_row from public.booking_packages where code = upper(btrim(coalesce(p_code, ''))) for update;
  if v_row.id is null or v_row.status not in ('sent', 'offered', 'countered', 'declined') then
    raise exception 'package not found';
  end if;
  if v_row.created_by = v_uid then
    raise exception 'this is your own package';
  end if;
  if v_row.venue_user_id is not null and v_row.venue_user_id <> v_uid then
    raise exception 'another account already answered this';
  end if;
  if not coalesce(p_decline, false) then
    v_offers := public._clean_booking_dates(p_offers);
    if jsonb_array_length(v_offers) = 0 then
      raise exception 'needs at least one date';
    end if;
  end if;
  update public.booking_packages
     set venue_user_id = v_uid,
         offers = case when coalesce(p_decline, false) then '[]'::jsonb else v_offers end,
         offers_from = 'venue',
         venue_message = left(coalesce(p_message, ''), 2000),
         status = case when coalesce(p_decline, false) then 'declined' else 'offered' end,
         responded_at = now(), updated_at = now(),
         rounds = rounds || jsonb_build_array(jsonb_build_object(
           'by', 'venue', 'at', now(), 'kind', case when coalesce(p_decline, false) then 'decline' else 'offer' end,
           'dates', case when coalesce(p_decline, false) then '[]'::jsonb else v_offers end,
           'message', left(coalesce(p_message, ''), 2000)))
   where id = v_row.id
  returning * into v_row;
  return jsonb_build_object('status', v_row.status, 'offers', v_row.offers);
end;
$function$;

-- The act counters with other dates after the venue's offer.
create or replace function public.counter_booking_package(p_id uuid, p_offers jsonb, p_message text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.booking_packages;
  v_offers jsonb;
begin
  select * into v_row from public.booking_packages where id = p_id and created_by = v_uid for update;
  if v_row.id is null then
    raise exception 'package not found';
  end if;
  if v_row.status not in ('offered', 'countered') or v_row.venue_user_id is null then
    raise exception 'nothing to answer yet';
  end if;
  v_offers := public._clean_booking_dates(p_offers);
  if jsonb_array_length(v_offers) = 0 then
    raise exception 'needs at least one date';
  end if;
  update public.booking_packages
     set offers = v_offers, offers_from = 'act', sender_message = left(coalesce(p_message, ''), 2000),
         status = 'countered', updated_at = now(),
         rounds = rounds || jsonb_build_array(jsonb_build_object(
           'by', 'act', 'at', now(), 'kind', 'counter', 'dates', v_offers, 'message', left(coalesce(p_message, ''), 2000)))
   where id = v_row.id
  returning * into v_row;
  return jsonb_build_object('status', v_row.status, 'offers', v_row.offers);
end;
$function$;

-- Makes the event for a confirmed date (the work confirm_booking_package did
-- by itself before): the venue owns it, the act's side is on it.
create or replace function public._book_booking_package(p_id uuid, p_date date, p_offer jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.booking_packages;
  v_offer jsonb := p_offer;
  v_venue_name text;
  v_sender_type text;
  v_show_id uuid;
  v_share uuid;
  v_d jsonb;
  v_hosp text;
  v_mi jsonb;
  v_vi jsonb := '{}'::jsonb;
  v_fx jsonb;
  v_billing text;
  v_deal jsonb;
  v_ask text;
  v_terms jsonb;
  v_back text;
begin
  select * into v_row from public.booking_packages where id = p_id for update;
  if v_row.status = 'booked' and v_row.show_id is not null then
    select share_token into v_share from public.shows where id = v_row.show_id;
    return jsonb_build_object('show_id', v_row.show_id, 'share_token', v_share, 'already', true);
  end if;

  v_d := v_row.data;
  select nullif(btrim(display_name), '') into v_venue_name from public.user_preferences where user_id = v_row.venue_user_id;
  select account_type into v_sender_type from public.user_preferences where user_id = v_row.created_by;
  v_billing := coalesce(nullif(v_offer->>'billing', ''), 'Headliner');

  v_deal := coalesce(v_d->'deal', '{}'::jsonb);
  v_ask := v_deal->>'ask';
  select string_agg(case b when 'own' then 'Bringing everything' when 'drums' then 'Needs drums' when 'bass' then 'Needs a bass amp'
                              when 'guitar' then 'Needs a guitar amp' when 'keys' then 'Needs keys' end, ', ')
    into v_back
    from jsonb_array_elements_text(case when jsonb_typeof(v_deal->'backline') = 'array' then v_deal->'backline' else '[]'::jsonb end) b;
  if coalesce((v_deal->>'share_backline')::boolean, false) then
    v_back := concat_ws(' · ', v_back, 'happy to share');
  end if;

  v_hosp := concat_ws(' · ',
    case when coalesce(v_d->'hospitality'->>'meals', '') <> '' then 'Meals: ' || (v_d->'hospitality'->>'meals') end,
    nullif(v_d->'hospitality'->>'dietary', ''),
    nullif(v_d->'hospitality'->>'drinks', ''),
    case when coalesce(v_d->'hospitality'->>'guests', '') <> '' then 'Guest list: ' || (v_d->'hospitality'->>'guests') end);
  v_hosp := concat_ws(E'\n',
    nullif(v_hosp, ''),
    case when coalesce(v_deal->>'hometown', '') <> '' then 'Based in: ' || (v_deal->>'hometown') end,
    case when coalesce(v_deal->>'draw', '') <> '' then 'Expected draw: ' || (v_deal->>'draw') end,
    case when coalesce(v_deal->>'recent', '') <> '' then 'Recent shows: ' || (v_deal->>'recent') end,
    case v_deal->>'age' when 'all' then 'Ages: all ages' when '18' then 'Ages: 18+' when '21' then 'Ages: 21+' end,
    case when coalesce(v_back, '') <> '' then 'Backline: ' || v_back end);

  v_mi := jsonb_strip_nulls(jsonb_build_object(
    'contact_name', nullif(v_d->>'submitter_name', ''),
    'contact_phone', nullif(v_d->>'submitter_phone', ''),
    'contact_email', nullif(v_d->>'submitter_email', ''),
    'merch_table', case v_d->'merch'->>'table' when 'own' then 'Our own table + seller' when 'venue' then 'Venue sells it' when 'none' then 'No merch' end,
    'merch_seller', case v_d->'merch'->>'table' when 'own' then 'Artist sells' when 'venue' then 'Venue seller' end,
    'merch_split', nullif(v_d->'merch'->>'split', ''),
    'advancing_notes', nullif(v_hosp, ''),
    'set_times', case when coalesce(v_offer->>'set_time', '') <> '' then jsonb_build_object(v_row.act_name, v_offer->>'set_time') end
  ));
  if coalesce(v_offer->>'load_in', '') <> '' then
    v_vi := jsonb_build_object('schedule', jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'time', v_offer->>'load_in', 'label', 'Load-in')));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('artist_name', bm->>'name', 'notes', bm->>'notes')), '[]'::jsonb)
    into v_fx
    from jsonb_array_elements(coalesce(v_d->'band_members', '[]'::jsonb)) bm
   where coalesce(bm->>'notes', '') <> '' and coalesce(bm->>'name', '') <> '';

  insert into public.shows (
    owner_id, band_name, venue, date, genre_tag, genre_tags, band_members, stage_plot_url, stage_plot_files,
    icon_url, manager_info, venue_info, promoter_info, status
  ) values (
    v_row.venue_user_id, v_row.act_name, coalesce(v_venue_name, nullif(v_row.to_name, '')), p_date,
    v_d->'genre_tags'->>0, coalesce(v_d->'genre_tags', '[]'::jsonb), coalesce(v_d->'band_members', '[]'::jsonb),
    nullif(v_d->>'stage_plot_url', ''), coalesce(v_d->'stage_plot_files', '[]'::jsonb),
    nullif(v_d->>'photo_url', ''), coalesce(v_mi, '{}'::jsonb), v_vi,
    case when coalesce(v_deal->>'ticket_price', '') <> '' then jsonb_build_object('ticket_price', v_deal->>'ticket_price') else '{}'::jsonb end,
    'not_started'
  ) returning id, share_token into v_show_id, v_share;

  if v_ask in ('flat', 'door', 'vs') then
    v_terms := jsonb_strip_nulls(jsonb_build_object(
      'deal_type', v_ask,
      'guarantee', case when v_ask in ('flat', 'vs') then nullif(v_deal->>'guarantee', '') end,
      'door_percent', case when v_ask in ('door', 'vs') then nullif(v_deal->>'door_percent', '') end,
      'merch_split', nullif(v_d->'merch'->>'split', '')));
    insert into public.event_deals (show_id, terms, status, updated_by)
    values (v_show_id, v_terms, 'draft', v_row.venue_user_id)
    on conflict (show_id) do nothing;
  end if;

  insert into public.show_bands (
    show_id, role, sort_order, band_name, genre_tags, genre_tag, band_members, set_length_minutes, general_notes,
    stage_plot_url, stage_plot_files, artist_fx_notes, submitter_name, submitter_phone, submitter_email,
    submitter_card_user_id, photo_url
  ) values (
    v_show_id, v_billing, 0, v_row.act_name, coalesce(v_d->'genre_tags', '[]'::jsonb), v_d->'genre_tags'->>0,
    coalesce(v_d->'band_members', '[]'::jsonb), nullif(v_d->>'set_length_minutes', '')::int, nullif(v_d->>'general_notes', ''),
    nullif(v_d->>'stage_plot_url', ''), coalesce(v_d->'stage_plot_files', '[]'::jsonb), v_fx,
    nullif(v_d->>'submitter_name', ''), nullif(v_d->>'submitter_phone', ''), nullif(v_d->>'submitter_email', ''),
    v_row.created_by, nullif(v_d->>'photo_url', '')
  );

  insert into public.gig_invites (show_id, invited_role, label, created_by, status, accepted_by, accepted_at, opened_at)
  values (v_show_id, case when v_sender_type = 'band' then 'band' else 'manager' end, 'Booking package',
          v_row.venue_user_id, 'accepted', v_row.created_by, now(), now());
  insert into public.linked_gigs (user_id, show_id, share_token)
  values (v_row.created_by, v_show_id, v_share)
  on conflict (user_id, show_id) do nothing;

  update public.booking_packages
     set status = 'booked', picked_date = p_date, show_id = v_show_id, confirmed_at = now(), updated_at = now(),
         rounds = rounds || jsonb_build_array(jsonb_build_object('by', 'confirm', 'at', now(), 'kind', 'confirm', 'dates', jsonb_build_array(v_offer), 'message', ''))
   where id = v_row.id;
  return jsonb_build_object('show_id', v_show_id, 'share_token', v_share);
end;
$function$;

-- Not callable from the app: only the confirm functions below use it.
revoke all on function public._book_booking_package(uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public._clean_booking_dates(jsonb) from public, anon, authenticated;

-- The act confirms one of the dates the venue offered.
create or replace function public.confirm_booking_package(p_id uuid, p_date date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.booking_packages;
  v_offer jsonb;
  v_share uuid;
begin
  select * into v_row from public.booking_packages where id = p_id and created_by = v_uid for update;
  if v_row.id is null then
    raise exception 'package not found';
  end if;
  if v_row.status = 'booked' and v_row.show_id is not null then
    select share_token into v_share from public.shows where id = v_row.show_id;
    return jsonb_build_object('show_id', v_row.show_id, 'share_token', v_share, 'already', true);
  end if;
  if v_row.status <> 'offered' or v_row.venue_user_id is null or v_row.offers_from <> 'venue' then
    raise exception 'no dates to confirm yet';
  end if;
  select o into v_offer from jsonb_array_elements(v_row.offers) o where o->>'date' = p_date::text limit 1;
  if v_offer is null then
    raise exception 'that date was not offered';
  end if;
  return public._book_booking_package(v_row.id, p_date, v_offer);
end;
$function$;

-- The venue confirms one of the dates the act sent: its specific dates (first
-- answer) or its counter. Books at once.
create or replace function public.venue_confirm_booking_package(p_code text, p_date date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.booking_packages;
  v_offer jsonb;
  v_src jsonb;
  v_share uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into v_row from public.booking_packages where code = upper(btrim(coalesce(p_code, ''))) for update;
  if v_row.id is null then
    raise exception 'package not found';
  end if;
  if v_row.created_by = v_uid then
    raise exception 'this is your own package';
  end if;
  if v_row.venue_user_id is not null and v_row.venue_user_id <> v_uid then
    raise exception 'another account already answered this';
  end if;
  if v_row.status = 'booked' and v_row.show_id is not null then
    select share_token into v_share from public.shows where id = v_row.show_id;
    return jsonb_build_object('show_id', v_row.show_id, 'share_token', v_share, 'already', true);
  end if;
  if v_row.status = 'countered' then
    v_src := v_row.offers;
  elsif v_row.status in ('sent', 'offered') and jsonb_typeof(v_row.wants->'dates') = 'array' then
    v_src := v_row.wants->'dates';
  else
    raise exception 'no dates to confirm';
  end if;
  select o into v_offer from jsonb_array_elements(v_src) o where o->>'date' = p_date::text limit 1;
  if v_offer is null then
    raise exception 'that date was not sent';
  end if;
  update public.booking_packages set venue_user_id = v_uid where id = v_row.id;
  return public._book_booking_package(v_row.id, p_date, v_offer);
end;
$function$;

-- What each side sees, with the new fields.
create or replace function public.get_booking_package_public(p_code text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_row public.booking_packages;
  v_sender jsonb;
  v_venue jsonb;
  v_uid uuid := auth.uid();
begin
  select * into v_row from public.booking_packages where code = upper(btrim(coalesce(p_code, '')));
  if v_row.id is null or v_row.status in ('draft', 'withdrawn') then
    return null;
  end if;
  select jsonb_build_object('name', nullif(p.display_name, ''), 'photo', nullif(p.profile_photo_url, ''),
                            'card', nullif(p.card_share_token::text, ''), 'type', p.account_type)
    into v_sender
    from public.user_preferences p where p.user_id = v_row.created_by;
  if v_row.venue_user_id is not null then
    select jsonb_build_object('name', nullif(p.display_name, ''), 'photo', nullif(p.profile_photo_url, ''))
      into v_venue
      from public.user_preferences p where p.user_id = v_row.venue_user_id;
  end if;
  return jsonb_build_object(
    'id', case when v_uid = v_row.created_by then v_row.id end,
    'code', v_row.code, 'status', v_row.status, 'act_name', v_row.act_name,
    'data', v_row.data, 'wants', v_row.wants, 'to_name', v_row.to_name,
    'sent_at', v_row.sent_at, 'sender', v_sender, 'venue', v_venue,
    'offers', v_row.offers, 'offers_from', v_row.offers_from,
    'venue_message', v_row.venue_message, 'sender_message', v_row.sender_message,
    'responded_at', v_row.responded_at,
    'picked_date', v_row.picked_date,
    'show_id', case when v_uid is not null and v_uid in (v_row.venue_user_id, v_row.created_by) then v_row.show_id end,
    'is_sender', v_uid is not null and v_uid = v_row.created_by,
    'is_venue', v_uid is not null and v_uid = v_row.venue_user_id,
    'taken', v_row.venue_user_id is not null and (v_uid is null or v_uid <> v_row.venue_user_id)
  );
end;
$function$;

create or replace function public.list_incoming_booking_packages()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', b.code, 'act_name', b.act_name, 'status', b.status, 'wants', b.wants,
           'offers', b.offers, 'offers_from', b.offers_from, 'sent_at', b.sent_at, 'responded_at', b.responded_at,
           'picked_date', b.picked_date, 'show_id', b.show_id,
           'photo_url', b.data->>'photo_url',
           'sender_name', (select nullif(p.display_name, '') from public.user_preferences p where p.user_id = b.created_by),
           'sender_type', (select p.account_type from public.user_preferences p where p.user_id = b.created_by)
         ) order by coalesce(b.responded_at, b.sent_at) desc), '[]'::jsonb)
    from public.booking_packages b
   where b.status in ('sent', 'offered', 'countered', 'declined', 'booked')
     and b.created_by <> auth.uid()
     and (b.venue_user_id = auth.uid()
          or (b.venue_user_id is null and b.to_email <> ''
              and lower(b.to_email) = lower((select u.email from auth.users u where u.id = auth.uid()))));
$function$;

create or replace function public.list_my_booking_packages()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'code', b.code, 'act_name', b.act_name, 'status', b.status,
           'to_name', b.to_name, 'wants', b.wants, 'sent_at', b.sent_at, 'updated_at', b.updated_at,
           'photo_url', b.data->>'photo_url', 'offers', b.offers, 'offers_from', b.offers_from, 'responded_at', b.responded_at,
           'picked_date', b.picked_date, 'show_id', b.show_id
         ) order by b.updated_at desc), '[]'::jsonb)
    from public.booking_packages b
   where b.created_by = auth.uid() and b.status <> 'withdrawn';
$function$;
