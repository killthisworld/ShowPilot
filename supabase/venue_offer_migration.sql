-- Job 348: the venue sends first. A venue builds an offer (dates with times,
-- the deal, room, hospitality, logistics, what it needs) and sends it to an
-- act. The act answers with the dates that work and attaches its own package;
-- the venue confirms or counters, back and forth until booked (same flow as
-- job 347, roles swapped). Needs supabase/booking_negotiation_migration.sql first.
--
-- Columns keep their job 246 names, but "venue_user_id" is simply the
-- RECIPIENT of the package (the venue on an act's package, the act on a
-- venue's offer), and "created_by" is always the sender.
--   kind        'act' (default, an act's package) | 'venue' (a venue's offer)
--   reply_data  the act's own package, attached when it answers a venue offer
--   offers_from who made the dates in `offers`: 'venue' | 'act'

-- ---------- Part 1: columns, save, answer, counter, confirm ----------
alter table public.booking_packages
  add column if not exists kind text not null default 'act',
  add column if not exists reply_data jsonb not null default '{}'::jsonb,
  add column if not exists reply_act text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'booking_packages_kind_check') then
    alter table public.booking_packages add constraint booking_packages_kind_check check (kind in ('act', 'venue'));
  end if;
end $$;

-- A venue saves its offer as a draft (it is sent with send_booking_package).
create or replace function public.save_venue_offer(p_id uuid, p_act text, p_data jsonb, p_wants jsonb, p_to_name text, p_to_email text, p_to_phone text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.booking_packages;
  v_wants jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from public.user_preferences where user_id = v_uid and account_type = 'venue') then
    raise exception 'only a venue can send an offer';
  end if;
  v_wants := jsonb_build_object(
    'dates', public._clean_booking_dates(coalesce(p_wants->'dates', '[]'::jsonb)),
    'note', left(coalesce(p_wants->>'note', ''), 2000));
  if p_id is null then
    insert into public.booking_packages (created_by, kind, act_name, data, wants, to_name, to_email, to_phone)
    values (v_uid, 'venue', coalesce(btrim(p_act), ''), coalesce(p_data, '{}'::jsonb), v_wants,
            coalesce(btrim(p_to_name), ''), coalesce(btrim(p_to_email), ''), coalesce(btrim(p_to_phone), ''))
    returning * into v_row;
  else
    update public.booking_packages
       set act_name = coalesce(btrim(p_act), ''), data = coalesce(p_data, '{}'::jsonb), wants = v_wants,
           to_name = coalesce(btrim(p_to_name), ''), to_email = coalesce(btrim(p_to_email), ''),
           to_phone = coalesce(btrim(p_to_phone), ''), updated_at = now()
     where id = p_id and created_by = v_uid and kind = 'venue' and status = 'draft'
    returning * into v_row;
    if v_row.id is null then
      raise exception 'package not found';
    end if;
  end if;
  return to_jsonb(v_row);
end;
$function$;

-- The act answers a venue's offer: the dates that work (or other dates) and
-- its own package, or a pass. The venue then confirms or counters.
create or replace function public.respond_venue_offer(p_code text, p_dates jsonb, p_message text, p_decline boolean, p_reply jsonb, p_act text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.booking_packages;
  v_dates jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into v_row from public.booking_packages where code = upper(btrim(coalesce(p_code, ''))) for update;
  if v_row.id is null or v_row.kind <> 'venue' or v_row.status not in ('sent', 'offered', 'countered', 'declined') then
    raise exception 'package not found';
  end if;
  if v_row.created_by = v_uid then
    raise exception 'this is your own package';
  end if;
  if v_row.venue_user_id is not null and v_row.venue_user_id <> v_uid then
    raise exception 'another account already answered this';
  end if;
  if not coalesce(p_decline, false) then
    v_dates := public._clean_booking_dates(p_dates);
    if jsonb_array_length(v_dates) = 0 then
      raise exception 'needs at least one date';
    end if;
  end if;
  update public.booking_packages
     set venue_user_id = v_uid,
         offers = v_dates, offers_from = 'act',
         venue_message = left(coalesce(p_message, ''), 2000),
         reply_data = case when coalesce(p_reply, '{}'::jsonb) = '{}'::jsonb then reply_data else p_reply end,
         reply_act = left(coalesce(nullif(btrim(p_act), ''), reply_act), 200),
         status = case when coalesce(p_decline, false) then 'declined' else 'offered' end,
         responded_at = now(), updated_at = now(),
         rounds = rounds || jsonb_build_array(jsonb_build_object(
           'by', 'act', 'at', now(), 'kind', case when coalesce(p_decline, false) then 'decline' else 'offer' end,
           'dates', v_dates, 'message', left(coalesce(p_message, ''), 2000)))
   where id = v_row.id
  returning * into v_row;
  return jsonb_build_object('status', v_row.status, 'offers', v_row.offers);
end;
$function$;
revoke all on function public.save_venue_offer(uuid, text, jsonb, jsonb, text, text, text) from public, anon;
revoke all on function public.respond_venue_offer(text, jsonb, text, boolean, jsonb, text) from public, anon;
grant execute on function public.save_venue_offer(uuid, text, jsonb, jsonb, text, text, text) to authenticated;
grant execute on function public.respond_venue_offer(text, jsonb, text, boolean, jsonb, text) to authenticated;

-- The sender sends other dates: now says who made them.
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
  v_who text;
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
  v_who := case when v_row.kind = 'venue' then 'venue' else 'act' end;
  update public.booking_packages
     set offers = v_offers, offers_from = v_who, sender_message = left(coalesce(p_message, ''), 2000),
         status = 'countered', updated_at = now(),
         rounds = rounds || jsonb_build_array(jsonb_build_object(
           'by', v_who, 'at', now(), 'kind', 'counter', 'dates', v_offers, 'message', left(coalesce(p_message, ''), 2000)))
   where id = v_row.id
  returning * into v_row;
  return jsonb_build_object('status', v_row.status, 'offers', v_row.offers);
end;
$function$;

-- The sender confirms one of the dates the recipient sent.
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
  if v_row.status <> 'offered' or v_row.venue_user_id is null then
    raise exception 'no dates to confirm yet';
  end if;
  select o into v_offer from jsonb_array_elements(v_row.offers) o where o->>'date' = p_date::text limit 1;
  if v_offer is null then
    raise exception 'that date was not offered';
  end if;
  return public._book_booking_package(v_row.id, p_date, v_offer);
end;
$function$;

-- ---------- Part 2: the event, made from either kind of package ----------
-- The venue owns the event; the act's side is linked to it. On an act's
-- package the act's info is `data`; on a venue offer it is `reply_data` and
-- the venue's deal, hospitality and logistics are `data`.
create or replace function public._book_booking_package(p_id uuid, p_date date, p_offer jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.booking_packages;
  v_offer jsonb := p_offer;
  v_is_v boolean;
  v_owner uuid;
  v_act_user uuid;
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
  v_h jsonb;
  v_l jsonb;
  v_room jsonb;
begin
  select * into v_row from public.booking_packages where id = p_id for update;
  if v_row.status = 'booked' and v_row.show_id is not null then
    select share_token into v_share from public.shows where id = v_row.show_id;
    return jsonb_build_object('show_id', v_row.show_id, 'share_token', v_share, 'already', true);
  end if;

  v_is_v := v_row.kind = 'venue';
  v_owner := case when v_is_v then v_row.created_by else v_row.venue_user_id end;
  v_act_user := case when v_is_v then v_row.venue_user_id else v_row.created_by end;
  v_d := case when v_is_v then coalesce(v_row.reply_data, '{}'::jsonb) else v_row.data end;
  select nullif(btrim(display_name), '') into v_venue_name from public.user_preferences where user_id = v_owner;
  select account_type into v_sender_type from public.user_preferences where user_id = v_act_user;
  v_billing := coalesce(nullif(v_offer->>'billing', ''),
    (select nullif(w->>'billing', '') from jsonb_array_elements(case when jsonb_typeof(v_row.wants->'dates') = 'array' then v_row.wants->'dates' else '[]'::jsonb end) w where w->>'date' = p_date::text limit 1),
    'Headliner');

  v_deal := case when v_is_v then coalesce(v_row.data->'deal', '{}'::jsonb) else coalesce(v_d->'deal', '{}'::jsonb) end;
  v_ask := v_deal->>'ask';
  select string_agg(case b when 'own' then 'Bringing everything' when 'drums' then 'Needs drums' when 'bass' then 'Needs a bass amp'
                              when 'guitar' then 'Needs a guitar amp' when 'keys' then 'Needs keys' end, ', ')
    into v_back
    from jsonb_array_elements_text(case when jsonb_typeof(v_d->'deal'->'backline') = 'array' then v_d->'deal'->'backline' else '[]'::jsonb end) b;
  if coalesce((v_d->'deal'->>'share_backline')::boolean, false) then
    v_back := concat_ws(' · ', v_back, 'happy to share');
  end if;

  if v_is_v then
    -- The venue's offer: hospitality, logistics and room, as advancing notes.
    v_h := coalesce(v_row.data->'hosp', '{}'::jsonb);
    v_l := coalesce(v_row.data->'logi', '{}'::jsonb);
    v_room := coalesce(v_row.data->'room', '{}'::jsonb);
    v_hosp := concat_ws(E'\n',
      nullif(concat_ws(' · ',
        case when coalesce(v_h->>'meals', '') <> '' then 'Meals: ' || (v_h->>'meals') end,
        case when coalesce(v_h->>'drinks', '') <> '' then 'Drinks: ' || (v_h->>'drinks') end,
        case when coalesce(v_h->>'green_room', '') <> '' then 'Green room: ' || (v_h->>'green_room') end,
        case when coalesce(v_h->>'guests', '') <> '' then 'Guest list: ' || (v_h->>'guests') end,
        case when coalesce(v_h->>'lodging', '') <> '' then 'Lodging: ' || (v_h->>'lodging') end), ''),
      nullif(concat_ws(' · ',
        case when coalesce(v_l->>'load_in', '') <> '' then 'Load-in: ' || (v_l->>'load_in') end,
        case when coalesce(v_l->>'soundcheck', '') <> '' then 'Soundcheck: ' || (v_l->>'soundcheck') end,
        case when coalesce(v_l->>'curfew', '') <> '' then 'Curfew: ' || (v_l->>'curfew') end,
        case when coalesce(v_l->>'contact', '') <> '' then 'Day-of contact: ' || (v_l->>'contact') end), ''),
      nullif(concat_ws(' · ',
        case when coalesce(v_room->>'capacity', '') <> '' then 'Capacity: ' || (v_room->>'capacity') end,
        case when coalesce(v_room->>'stage', '') <> '' then 'Stage: ' || (v_room->>'stage') end,
        case when coalesce(v_room->>'pa', '') <> '' then 'PA: ' || (v_room->>'pa') end,
        case when coalesce(v_room->>'backline', '') <> '' then 'Backline: ' || (v_room->>'backline') end), ''),
      case v_deal->>'age' when 'all' then 'Ages: all ages' when '18' then 'Ages: 18+' when '21' then 'Ages: 21+' end,
      case when coalesce(v_row.wants->>'note', '') <> '' then 'Note from the venue: ' || (v_row.wants->>'note') end);
  else
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
  end if;

  v_mi := jsonb_strip_nulls(jsonb_build_object(
    'contact_name', nullif(v_d->>'submitter_name', ''),
    'contact_phone', nullif(v_d->>'submitter_phone', ''),
    'contact_email', nullif(v_d->>'submitter_email', ''),
    'merch_table', case v_d->'merch'->>'table' when 'own' then 'Our own table + seller' when 'venue' then 'Venue sells it' when 'none' then 'No merch' end,
    'merch_seller', case v_d->'merch'->>'table' when 'own' then 'Artist sells' when 'venue' then 'Venue seller' end,
    'merch_split', coalesce(nullif(v_d->'merch'->>'split', ''), case when v_is_v then nullif(v_deal->>'merch_split', '') end),
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
    v_owner, v_row.act_name,
    coalesce(v_venue_name, case when not v_is_v then nullif(v_row.to_name, '') end),
    p_date,
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
      'merch_split', coalesce(nullif(v_d->'merch'->>'split', ''), nullif(v_deal->>'merch_split', ''))));
    insert into public.event_deals (show_id, terms, status, updated_by)
    values (v_show_id, v_terms, 'draft', v_owner)
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
    v_act_user, nullif(v_d->>'photo_url', '')
  );

  insert into public.gig_invites (show_id, invited_role, label, created_by, status, accepted_by, accepted_at, opened_at)
  values (v_show_id, case when v_sender_type = 'band' then 'band' else 'manager' end, 'Booking package',
          v_owner, 'accepted', v_act_user, now(), now());
  insert into public.linked_gigs (user_id, show_id, share_token)
  values (v_act_user, v_show_id, v_share)
  on conflict (user_id, show_id) do nothing;

  update public.booking_packages
     set status = 'booked', picked_date = p_date, show_id = v_show_id, confirmed_at = now(), updated_at = now(),
         rounds = rounds || jsonb_build_array(jsonb_build_object('by', 'confirm', 'at', now(), 'kind', 'confirm', 'dates', jsonb_build_array(v_offer), 'message', ''))
   where id = v_row.id;
  return jsonb_build_object('show_id', v_show_id, 'share_token', v_share);
end;
$function$;
revoke all on function public._book_booking_package(uuid, date, jsonb) from public, anon, authenticated;

-- ---------- Part 3: what each side reads ----------
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
  v_mine boolean;
begin
  select * into v_row from public.booking_packages where code = upper(btrim(coalesce(p_code, '')));
  if v_row.id is null or v_row.status in ('draft', 'withdrawn') then
    return null;
  end if;
  v_mine := v_uid is not null and v_uid in (v_row.venue_user_id, v_row.created_by);
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
    'code', v_row.code, 'status', v_row.status, 'kind', v_row.kind, 'act_name', v_row.act_name,
    'data', v_row.data, 'wants', v_row.wants, 'to_name', v_row.to_name,
    'sent_at', v_row.sent_at, 'sender', v_sender, 'venue', v_venue,
    'offers', v_row.offers, 'offers_from', v_row.offers_from,
    'venue_message', v_row.venue_message, 'sender_message', v_row.sender_message,
    'reply_data', case when v_mine then v_row.reply_data else '{}'::jsonb end,
    'reply_act', case when v_mine then v_row.reply_act else '' end,
    'responded_at', v_row.responded_at,
    'picked_date', v_row.picked_date,
    'show_id', case when v_mine then v_row.show_id end,
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
           'code', b.code, 'kind', b.kind, 'act_name', b.act_name, 'status', b.status, 'wants', b.wants,
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
           'id', b.id, 'code', b.code, 'kind', b.kind, 'act_name', b.act_name, 'status', b.status,
           'to_name', b.to_name, 'wants', b.wants, 'sent_at', b.sent_at, 'updated_at', b.updated_at,
           'photo_url', b.data->>'photo_url', 'offers', b.offers, 'offers_from', b.offers_from, 'responded_at', b.responded_at,
           'picked_date', b.picked_date, 'show_id', b.show_id
         ) order by b.updated_at desc), '[]'::jsonb)
    from public.booking_packages b
   where b.created_by = auth.uid() and b.status <> 'withdrawn';
$function$;
