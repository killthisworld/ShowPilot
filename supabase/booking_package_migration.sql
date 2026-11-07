-- ============================================================
-- Migration: booking packages, step 1 (job 246)
-- Run this in Supabase SQL Editor
-- ============================================================
--
-- An artist / manager fills in a "package" (their act, inputs, stage plot,
-- hospitality, promo, contact and the dates they want) and sends it to a
-- venue, as if asking to book a date. Step 1 is building and sending it;
-- the venue's side (offer dates / decline), confirming and asking a tech
-- come in later steps and add to this table.
--
--   booking_packages  one per package: the act's info (data), when they
--                     want to play (wants), who it goes to (to_*), its
--                     status, and a short code for the link
--                     showpilot.space/p/<code>
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
  status text not null default 'draft',           -- draft | sent | withdrawn (more in later steps)
  sent_at timestamptz,
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
           'photo_url', b.data->>'photo_url'
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
-- wanted, who it's for, and the sender's public card. Null for a draft, a
-- withdrawn package or a code that doesn't exist.
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
begin
  select * into v_row from public.booking_packages where code = upper(btrim(coalesce(p_code, '')));
  if v_row.id is null or v_row.status in ('draft', 'withdrawn') then
    return null;
  end if;
  select jsonb_build_object('name', nullif(p.display_name, ''), 'photo', nullif(p.profile_photo_url, ''),
                            'card', nullif(p.card_share_token::text, ''), 'type', p.account_type)
    into v_sender
    from public.user_preferences p where p.user_id = v_row.created_by;
  return jsonb_build_object(
    'code', v_row.code, 'status', v_row.status, 'act_name', v_row.act_name,
    'data', v_row.data, 'wants', v_row.wants, 'to_name', v_row.to_name,
    'sent_at', v_row.sent_at, 'sender', v_sender
  );
end;
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
