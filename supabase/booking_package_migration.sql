-- ============================================================
-- Migration: booking packages, step 1 (job 246)
-- Run this in Supabase SQL Editor
-- ============================================================
--
-- An artist / manager fills in a "package" (their act, inputs, stage plot,
-- hospitality, promo, contact and the dates they want) and sends it to a
-- venue, as if asking to book a date. The venue offers a few dates or
-- declines; the sender confirms one, which makes the event on the venue's
-- side with the act filled in and the sender on it. The venue can then ask a
-- tech if they're free; a yes puts the event on the tech's side too.
--
--   booking_packages  one per package: the act's info (data), when they
--                     want to play (wants), who it goes to (to_*), its
--                     status, the venue's offers, and a short code for the
--                     link showpilot.space/p/<code>
--   booking_tech_asks one per "are you free?" a venue sends a tech for an
--                     event: showpilot.space/t/<code>
--
-- The table is closed to the app; everything goes through the
-- security-definer functions below. Only the person who made a package can
-- read or change it, and the public read (for whoever opens the link) shows
-- only what the package is meant to show.

create table if not exists public.booking_packages (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  code text unique,                               -- set when sent
  act_name text not null default '',
  data jsonb not null default '{}'::jsonb,        -- photo_url, genre_tags, set_length_minutes, band_members,
                                                  -- stage_plot_files, general_notes, artist_fx_notes,
                                                  -- hospitality, merch, promo, contact
  wants jsonb not null default '{}'::jsonb,       -- { months: ['2027-03'], days: ['thu','fri'], note }
  to_name text not null default '',               -- the venue's name as the sender typed it
  to_email text not null default '',
  to_phone text not null default '',
  status text not null default 'draft',           -- draft | sent | offered | declined | booked | withdrawn
  sent_at timestamptz,
  -- The venue's answer (step 2): who answered, the dates they offered
  -- [{date:'2027-03-19', set_time:'9:30 PM', load_in:'5:30 PM', billing:'Headliner'}]
  -- and a note. Then the sender picks one (step 3) and the event is made.
  venue_user_id uuid references auth.users(id) on delete set null,
  offers jsonb not null default '[]'::jsonb,
  venue_message text not null default '',
  responded_at timestamptz,
  picked_date date,
  show_id uuid references public.shows(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists booking_packages_owner_idx on public.booking_packages (created_by, updated_at desc);
alter table public.booking_packages enable row level security;
revoke all on public.booking_packages from anon, authenticated;

-- Save a package (new when p_id is null). Only its maker can change it,
-- and not once it's been withdrawn.
create or replace function public.save_booking_package(
  p_id uuid, p_act text, p_data jsonb, p_wants jsonb, p_to_name text, p_to_email text, p_to_phone text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.booking_packages;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_id is null then
    insert into public.booking_packages (created_by, act_name, data, wants, to_name, to_email, to_phone)
    values (v_uid, coalesce(btrim(p_act), ''), coalesce(p_data, '{}'::jsonb), coalesce(p_wants, '{}'::jsonb),
            coalesce(btrim(p_to_name), ''), coalesce(btrim(p_to_email), ''), coalesce(btrim(p_to_phone), ''))
    returning * into v_row;
  else
    update public.booking_packages
       set act_name = coalesce(btrim(p_act), ''),
           data = coalesce(p_data, '{}'::jsonb),
           wants = coalesce(p_wants, '{}'::jsonb),
           to_name = coalesce(btrim(p_to_name), ''),
           to_email = coalesce(btrim(p_to_email), ''),
           to_phone = coalesce(btrim(p_to_phone), ''),
           updated_at = now()
     where id = p_id and created_by = v_uid and status <> 'withdrawn'
    returning * into v_row;
    if v_row.id is null then
      raise exception 'package not found';
    end if;
  end if;
  return to_jsonb(v_row);
end;
$function$;

-- One of my packages, in full.
create or replace function public.get_booking_package(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select to_jsonb(b) from public.booking_packages b
   where b.id = p_id and b.created_by = auth.uid();
$function$;

-- All my packages, newest first (for the Bookings list).
create or replace function public.list_my_booking_packages()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'code', b.code, 'act_name', b.act_name, 'status', b.status,
           'to_name', b.to_name, 'wants', b.wants, 'sent_at', b.sent_at, 'updated_at', b.updated_at,
           'photo_url', b.data->>'photo_url', 'offers', b.offers, 'responded_at', b.responded_at,
           'picked_date', b.picked_date, 'show_id', b.show_id
         ) order by b.updated_at desc), '[]'::jsonb)
    from public.booking_packages b
   where b.created_by = auth.uid() and b.status <> 'withdrawn';
$function$;

-- 6 characters, no look-alikes (same alphabet as the other short links).
create or replace function public.gen_booking_code()
returns text
language plpgsql
volatile
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1);
  end loop;
  return v_code;
end;
$function$;

-- Send it: needs the act's name, at least one month (or 'any') and who it
-- goes to (a name plus an email or a phone). Gives it its link code.
-- Sending again (after an edit) keeps the same code.
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
  if jsonb_typeof(v_row.wants->'months') is distinct from 'array' or jsonb_array_length(v_row.wants->'months') = 0 then
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

-- Take a package back.
create or replace function public.withdraw_booking_package(p_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.booking_packages set status = 'withdrawn', updated_at = now()
   where id = p_id and created_by = auth.uid();
$function$;

-- What whoever opens the link sees (no sign-in needed): the act, the dates
-- wanted, who it's for, the venue's answer, and the sender's public card.
-- Null for a draft, a withdrawn package or a code that doesn't exist.
create or replace function public.get_booking_package_public(p_code text)
returns jsonb
language plpgsql
stable
security definer
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
    'offers', v_row.offers, 'venue_message', v_row.venue_message, 'responded_at', v_row.responded_at,
    'picked_date', v_row.picked_date,
    'show_id', case when v_uid is not null and v_uid in (v_row.venue_user_id, v_row.created_by) then v_row.show_id end,
    'is_sender', v_uid is not null and v_uid = v_row.created_by,
    'is_venue', v_uid is not null and v_uid = v_row.venue_user_id,
    -- Answered by another account: this one can only look.
    'taken', v_row.venue_user_id is not null and (v_uid is null or v_uid <> v_row.venue_user_id)
  );
end;
$function$;

-- ------------------------------------------------------------
-- Step 2: the venue answers (signed in)
-- ------------------------------------------------------------

-- Offer up to 3 dates (each with optional set time, load-in and billing),
-- or decline. The first venue account to answer owns the answer; it can
-- change it until the sender confirms.
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
  v_o jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into v_row from public.booking_packages where code = upper(btrim(coalesce(p_code, ''))) for update;
  if v_row.id is null or v_row.status not in ('sent', 'offered', 'declined') then
    raise exception 'package not found';
  end if;
  if v_row.created_by = v_uid then
    raise exception 'this is your own package';
  end if;
  if v_row.venue_user_id is not null and v_row.venue_user_id <> v_uid then
    raise exception 'another account already answered this';
  end if;
  if not coalesce(p_decline, false) then
    if jsonb_typeof(p_offers) is distinct from 'array' then
      raise exception 'needs at least one date';
    end if;
    for v_o in select * from jsonb_array_elements(p_offers) limit 3 loop
      if coalesce(v_o->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
        v_offers := v_offers || jsonb_build_array(jsonb_build_object(
          'date', v_o->>'date',
          'set_time', left(coalesce(v_o->>'set_time', ''), 20),
          'load_in', left(coalesce(v_o->>'load_in', ''), 20),
          'billing', left(coalesce(v_o->>'billing', ''), 40)));
      end if;
    end loop;
    if jsonb_array_length(v_offers) = 0 then
      raise exception 'needs at least one date';
    end if;
  end if;
  update public.booking_packages
     set venue_user_id = v_uid,
         offers = case when coalesce(p_decline, false) then '[]'::jsonb else v_offers end,
         venue_message = left(coalesce(p_message, ''), 2000),
         status = case when coalesce(p_decline, false) then 'declined' else 'offered' end,
         responded_at = now(), updated_at = now()
   where id = v_row.id
  returning * into v_row;
  return jsonb_build_object('status', v_row.status, 'offers', v_row.offers);
end;
$function$;

-- Packages sent to me as a venue: ones I've answered, plus unanswered ones
-- sent to my account's email.
create or replace function public.list_incoming_booking_packages()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', b.code, 'act_name', b.act_name, 'status', b.status, 'wants', b.wants,
           'offers', b.offers, 'sent_at', b.sent_at, 'responded_at', b.responded_at,
           'picked_date', b.picked_date, 'show_id', b.show_id,
           'photo_url', b.data->>'photo_url',
           'sender_name', (select nullif(p.display_name, '') from public.user_preferences p where p.user_id = b.created_by),
           'sender_type', (select p.account_type from public.user_preferences p where p.user_id = b.created_by)
         ) order by coalesce(b.responded_at, b.sent_at) desc), '[]'::jsonb)
    from public.booking_packages b
   where b.status in ('sent', 'offered', 'declined', 'booked')
     and b.created_by <> auth.uid()
     and (b.venue_user_id = auth.uid()
          or (b.venue_user_id is null and b.to_email <> ''
              and lower(b.to_email) = lower((select u.email from auth.users u where u.id = auth.uid()))));
$function$;

-- ------------------------------------------------------------
-- Step 3: the sender confirms a date -> the event is made
-- ------------------------------------------------------------

-- Makes the event on the venue's side (owned by the venue account that
-- answered) with the act in the lineup, the set time, load-in, contact,
-- merch and hospitality filled in, and puts the sender on it (an accepted
-- invite plus the linked event, the same way joining from an invite does).
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

  v_d := v_row.data;
  select nullif(btrim(display_name), '') into v_venue_name from public.user_preferences where user_id = v_row.venue_user_id;
  select account_type into v_sender_type from public.user_preferences where user_id = v_uid;
  v_billing := coalesce(nullif(v_offer->>'billing', ''), 'Headliner');

  -- What the act asked for on the deal and draw (job 248): it goes in the
  -- event's notes, the venue's deal starts as a draft with their ask, and the
  -- suggested ticket price goes on the event.
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

  -- The venue's deal for this event starts from what the act asked for (a
  -- draft only the venue sees until they send it).
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
    v_uid, nullif(v_d->>'photo_url', '')
  );

  -- The sender is on the event as its manager (or the artist).
  insert into public.gig_invites (show_id, invited_role, label, created_by, status, accepted_by, accepted_at, opened_at)
  values (v_show_id, case when v_sender_type = 'band' then 'band' else 'manager' end, 'Booking package',
          v_row.venue_user_id, 'accepted', v_uid, now(), now());
  insert into public.linked_gigs (user_id, show_id, share_token)
  values (v_uid, v_show_id, v_share)
  on conflict (user_id, show_id) do nothing;

  update public.booking_packages
     set status = 'booked', picked_date = p_date, show_id = v_show_id, confirmed_at = now(), updated_at = now()
   where id = v_row.id;
  return jsonb_build_object('show_id', v_show_id, 'share_token', v_share);
end;
$function$;

-- ------------------------------------------------------------
-- Step 4: the venue asks a tech if they're free
-- ------------------------------------------------------------

create table if not exists public.booking_tech_asks (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  asked_by uuid not null references auth.users(id) on delete cascade,
  role text not null default 'engineer',          -- engineer | lighting
  to_user_id uuid references auth.users(id) on delete set null,
  to_name text not null default '',
  to_email text not null default '',
  to_phone text not null default '',
  code text not null unique,
  status text not null default 'asked',           -- asked | in | declined | pulled
  answered_by uuid references auth.users(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists booking_tech_asks_show_idx on public.booking_tech_asks (show_id);
alter table public.booking_tech_asks enable row level security;
revoke all on public.booking_tech_asks from anon, authenticated;

-- Techs who've worked my events before (for the picker), most shows first.
create or replace function public.list_my_past_techs(p_role text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(t order by t.shows desc), '[]'::jsonb) from (
    select gi.accepted_by as user_id, count(distinct gi.show_id) as shows,
           max(nullif(p.display_name, '')) as name, max(nullif(p.profile_photo_url, '')) as photo
      from public.gig_invites gi
      join public.shows s on s.id = gi.show_id and s.owner_id = auth.uid()
      left join public.user_preferences p on p.user_id = gi.accepted_by
     where gi.status = 'accepted' and gi.accepted_by is not null
       and gi.invited_role = case when p_role = 'lighting' then 'lighting' else 'engineer' end
     group by gi.accepted_by
  ) t;
$function$;

-- Ask: a tech I've worked with (p_user), or someone new by name + email / phone.
create or replace function public.ask_booking_tech(p_show uuid, p_role text, p_user uuid, p_name text, p_email text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_try integer := 0;
  v_row public.booking_tech_asks;
begin
  if not exists (select 1 from public.shows where id = p_show and owner_id = v_uid) then
    raise exception 'not your event';
  end if;
  if p_user is null and (btrim(coalesce(p_name, '')) = '' or (btrim(coalesce(p_email, '')) = '' and btrim(coalesce(p_phone, '')) = '')) then
    raise exception 'needs who to ask';
  end if;
  while v_code is null loop
    v_try := v_try + 1;
    v_code := public.gen_booking_code();
    if exists (select 1 from public.booking_tech_asks where code = v_code) then
      v_code := null;
      if v_try > 20 then raise exception 'could not make a code'; end if;
    end if;
  end loop;
  insert into public.booking_tech_asks (show_id, asked_by, role, to_user_id, to_name, to_email, to_phone, code)
  values (p_show, v_uid, case when p_role = 'lighting' then 'lighting' else 'engineer' end, p_user,
          coalesce(nullif(btrim(p_name), ''), (select display_name from public.user_preferences where user_id = p_user), ''),
          btrim(coalesce(p_email, '')), btrim(coalesce(p_phone, '')), v_code)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- The asks on one of my events (newest first).
create or replace function public.list_booking_tech_asks(p_show uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'role', a.role, 'to_name', a.to_name, 'status', a.status,
                                               'created_at', a.created_at, 'answered_at', a.answered_at) order by a.created_at desc), '[]'::jsonb)
    from public.booking_tech_asks a
    join public.shows s on s.id = a.show_id and s.owner_id = auth.uid()
   where a.show_id = p_show;
$function$;

-- What the tech sees (no sign-in needed): a short rundown of the event.
create or replace function public.get_booking_tech_ask(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_ask public.booking_tech_asks;
  v_show public.shows;
  v_venue jsonb;
  v_bands jsonb;
begin
  select * into v_ask from public.booking_tech_asks where code = upper(btrim(coalesce(p_code, '')));
  if v_ask.id is null or v_ask.status = 'pulled' then
    return null;
  end if;
  select * into v_show from public.shows where id = v_ask.show_id;
  select jsonb_build_object('name', nullif(p.display_name, ''), 'photo', nullif(p.profile_photo_url, ''))
    into v_venue from public.user_preferences p where p.user_id = v_ask.asked_by;
  select coalesce(jsonb_agg(jsonb_build_object(
           'band_name', b.band_name, 'role', b.role, 'set_length_minutes', b.set_length_minutes,
           'members', jsonb_array_length(coalesce(b.band_members, '[]'::jsonb)),
           'inputs', (select count(*) from jsonb_array_elements(coalesce(b.band_members, '[]'::jsonb)) m,
                        jsonb_array_elements(case when jsonb_typeof(m->'instruments') = 'array' then m->'instruments' else '[]'::jsonb end) i
                       where coalesce(i->>'name', '') <> ''),
           'set_time', v_show.manager_info->'set_times'->>b.band_name
         ) order by b.sort_order nulls last, b.created_at), '[]'::jsonb)
    into v_bands
    from public.show_bands b where b.show_id = v_show.id and coalesce(btrim(b.band_name), '') <> '';
  return jsonb_build_object(
    'code', v_ask.code, 'role', v_ask.role, 'status', v_ask.status, 'to_name', v_ask.to_name,
    'title', coalesce(nullif(btrim(v_show.event_name), ''), nullif(btrim(v_show.band_name), '')),
    'venue', v_show.venue, 'date', v_show.date,
    'image', coalesce(nullif(v_show.icon_url, ''), nullif(v_show.venue_info->>'photo_url', '')),
    'schedule', coalesce(v_show.venue_info->'schedule', '[]'::jsonb),
    'bands', v_bands, 'asked_by', v_venue,
    'is_mine', auth.uid() is not null and auth.uid() = v_ask.answered_by
  );
end;
$function$;

-- The tech answers (signed in). A yes puts the event on their side: an
-- accepted invite in their role plus the linked event. Returns the share
-- token so the page can open it.
create or replace function public.answer_booking_tech_ask(p_code text, p_yes boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ask public.booking_tech_asks;
  v_share uuid;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  select * into v_ask from public.booking_tech_asks where code = upper(btrim(coalesce(p_code, ''))) for update;
  if v_ask.id is null or v_ask.status = 'pulled' then
    raise exception 'this ask is no longer open';
  end if;
  if v_ask.to_user_id is not null and v_ask.to_user_id <> v_uid then
    raise exception 'this ask is for someone else';
  end if;
  if v_ask.answered_by is not null and v_ask.answered_by <> v_uid then
    raise exception 'someone else already answered this';
  end if;
  select share_token into v_share from public.shows where id = v_ask.show_id;
  if coalesce(p_yes, false) then
    if not exists (select 1 from public.gig_invites where show_id = v_ask.show_id and accepted_by = v_uid and status = 'accepted') then
      insert into public.gig_invites (show_id, invited_role, label, created_by, status, accepted_by, accepted_at, opened_at)
      values (v_ask.show_id, v_ask.role, 'Asked to work', v_ask.asked_by, 'accepted', v_uid, now(), now());
    end if;
    insert into public.linked_gigs (user_id, show_id, share_token)
    values (v_uid, v_ask.show_id, v_share)
    on conflict (user_id, show_id) do nothing;
  end if;
  update public.booking_tech_asks
     set status = case when coalesce(p_yes, false) then 'in' else 'declined' end,
         answered_by = v_uid, answered_at = now()
   where id = v_ask.id;
  return jsonb_build_object('status', case when coalesce(p_yes, false) then 'in' else 'declined' end,
                            'share_token', case when coalesce(p_yes, false) then v_share end);
end;
$function$;

-- Asks waiting on me as a tech (sent to my account, or to my email).
create or replace function public.list_my_tech_asks()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', a.code, 'role', a.role, 'status', a.status,
           'title', coalesce(nullif(btrim(s.event_name), ''), nullif(btrim(s.band_name), '')),
           'venue', s.venue, 'date', s.date,
           'load_in', (select e->>'time' from jsonb_array_elements(coalesce(s.venue_info->'schedule', '[]'::jsonb)) e where e->>'label' ilike 'load%' limit 1),
           'inputs', (select count(*) from public.show_bands b, jsonb_array_elements(coalesce(b.band_members, '[]'::jsonb)) m,
                        jsonb_array_elements(case when jsonb_typeof(m->'instruments') = 'array' then m->'instruments' else '[]'::jsonb end) i
                       where b.show_id = s.id and coalesce(i->>'name', '') <> '')
         ) order by s.date), '[]'::jsonb)
    from public.booking_tech_asks a
    join public.shows s on s.id = a.show_id
   where a.status = 'asked'
     and (a.to_user_id = auth.uid()
          or (a.to_user_id is null and a.to_email <> ''
              and lower(a.to_email) = lower((select u.email from auth.users u where u.id = auth.uid()))));
$function$;

revoke all on function public.save_booking_package(uuid, text, jsonb, jsonb, text, text, text) from public, anon;
revoke all on function public.get_booking_package(uuid) from public, anon;
revoke all on function public.list_my_booking_packages() from public, anon;
revoke all on function public.send_booking_package(uuid) from public, anon;
revoke all on function public.withdraw_booking_package(uuid) from public, anon;
revoke all on function public.gen_booking_code() from public, anon, authenticated;
grant execute on function public.save_booking_package(uuid, text, jsonb, jsonb, text, text, text) to authenticated;
grant execute on function public.get_booking_package(uuid) to authenticated;
grant execute on function public.list_my_booking_packages() to authenticated;
grant execute on function public.send_booking_package(uuid) to authenticated;
grant execute on function public.withdraw_booking_package(uuid) to authenticated;
grant execute on function public.get_booking_package_public(text) to anon, authenticated;
revoke all on function public.respond_booking_package(text, jsonb, text, boolean) from public, anon;
revoke all on function public.list_incoming_booking_packages() from public, anon;
revoke all on function public.confirm_booking_package(uuid, date) from public, anon;
revoke all on function public.list_my_past_techs(text) from public, anon;
revoke all on function public.ask_booking_tech(uuid, text, uuid, text, text, text) from public, anon;
revoke all on function public.list_booking_tech_asks(uuid) from public, anon;
revoke all on function public.answer_booking_tech_ask(text, boolean) from public, anon;
revoke all on function public.list_my_tech_asks() from public, anon;
grant execute on function public.respond_booking_package(text, jsonb, text, boolean) to authenticated;
grant execute on function public.list_incoming_booking_packages() to authenticated;
grant execute on function public.confirm_booking_package(uuid, date) to authenticated;
grant execute on function public.list_my_past_techs(text) to authenticated;
grant execute on function public.ask_booking_tech(uuid, text, uuid, text, text, text) to authenticated;
grant execute on function public.list_booking_tech_asks(uuid) to authenticated;
grant execute on function public.answer_booking_tech_ask(text, boolean) to authenticated;
grant execute on function public.list_my_tech_asks() to authenticated;
grant execute on function public.get_booking_tech_ask(text) to anon, authenticated;
