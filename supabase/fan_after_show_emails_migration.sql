-- ============================================================
-- Migration: countdown emails after the show + Stellar Birth attached (job 244)
-- ============================================================
--
-- A countdown notch can now go out after the show: days_before below zero
-- (-1 = the day after, -7 = a week after; -30 to 30 allowed). A notch can
-- carry "film": true, which puts a Watch Stellar Birth button in that email.
-- When any notch of an event carries the film, the automatic morning-after
-- Stellar Birth email (fan_film_due) is skipped for that event: the host's
-- own email delivers it.
--
-- Changed from the live bodies (checked 2026-11-06), only where noted:
--   countdown_opens_at(date, int, text)   clamp -30..30 (was 0..30)
--   countdown_for_fan, fan_countdown_due,
--   open_countdown_notch, set_countdown_hype   days_before may be negative
--   fan_film_due                          skips events whose countdown attaches the film

CREATE OR REPLACE FUNCTION public.countdown_opens_at(p_date date, p_days integer, p_time text)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select ((p_date - greatest(-30, least(30, coalesce(p_days, 0))))::timestamp
    + (case when coalesce(p_time, '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then p_time else '10:00' end)::time)
    at time zone 'America/New_York';
$function$;

CREATE OR REPLACE FUNCTION public.countdown_for_fan(p_show shows, p_rsvp uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce(p_show.fan_countdown->>'enabled', 'false') <> 'true'
      or p_show.date is null
      or coalesce(p_show.fan_page->'hidden', '[]'::jsonb) ? 'date'
      or jsonb_array_length(coalesce(p_show.fan_countdown->'notches', '[]'::jsonb)) = 0
    then null
    else jsonb_build_object(
      'show_day', p_show.date,
      'show_opens_at', public.countdown_opens_at(p_show.date, 0),
      'notches', (
        select jsonb_agg(
          jsonb_build_object(
            'id', n->>'id',
            'days_before', (n->>'days_before')::int,
            'time', n->>'time',
            'type', case when n->>'type' = 'unlock' then 'unlock' else 'reminder' end,
            'kind', n->>'kind',
            'opens_at', public.countdown_opens_at(p_show.date, (n->>'days_before')::int, n->>'time'),
            'open', now() >= public.countdown_opens_at(p_show.date, (n->>'days_before')::int, n->>'time'),
            'seen', exists (select 1 from public.fan_countdown_log l where l.show_id = p_show.id and l.notch_id = n->>'id' and l.rsvp_id = p_rsvp and l.opened_at is not null)
          ) || case when now() >= public.countdown_opens_at(p_show.date, (n->>'days_before')::int, n->>'time') and n->>'type' = 'unlock' then
            jsonb_build_object('title', n->>'title', 'body', n->>'body', 'image_url', n->>'image_url', 'link_url', n->>'link_url', 'message', n->>'message')
          else '{}'::jsonb end
          order by public.countdown_opens_at(p_show.date, (n->>'days_before')::int, n->>'time')
        )
        from jsonb_array_elements(p_show.fan_countdown->'notches') n
        where (n->>'days_before') ~ '^-?[0-9]+$'
      )
    ) end;
$function$;

CREATE OR REPLACE FUNCTION public.fan_countdown_due()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'show_id', s.id,
    'fan_token', s.fan_token,
    'fan_slug', s.fan_slug,
    'notch', n,
    'event', jsonb_build_object(
      'event_name', s.event_name,
      'band_name', case when h ? 'band' then null else s.band_name end,
      'date', s.date,
      'door_time', nullif(s.promoter_info->>'door_time', ''),
      'show_time', nullif(s.fan_page->>'show_time', ''),
      'venue', case when h ? 'venue' or s.fan_page->>'venue_where' = 'page' then null else s.venue end,
      'address', case when h ? 'venue' or s.fan_page->>'venue_where' = 'page' then null else nullif(s.fan_page->>'address', '') end,
      'city', case when h ? 'venue' or s.fan_page->>'venue_where' = 'page' then null else s.city end,
      'state', case when h ? 'venue' or s.fan_page->>'venue_where' = 'page' then null else s.state end,
      'flyer_url', case when h ? 'flyer' then null else nullif(s.fan_page->>'flyer_url', '') end,
      'door_price', case when h ? 'tickets' then null else nullif(s.promoter_info->>'ticket_price', '') end
    ),
    'rsvps', (
      select jsonb_agg(jsonb_build_object('rsvp_id', r.id, 'email', r.email, 'name', r.name, 'sky_key', r.sky_key))
      from public.fan_rsvps r
      where r.show_id = s.id and r.countdown_stop is not true and coalesce(r.email, '') <> ''
        and not exists (select 1 from public.fan_countdown_log l where l.show_id = s.id and l.notch_id = n->>'id' and l.rsvp_id = r.id and l.sent_at is not null)
    )
  )), '[]'::jsonb)
  from public.shows s
  cross join lateral (select coalesce(s.fan_page->'hidden', '[]'::jsonb) as h) hid
  cross join lateral jsonb_array_elements(coalesce(s.fan_countdown->'notches', '[]'::jsonb)) n
  where s.fan_countdown->>'enabled' = 'true'
    and s.fan_page_enabled is true
    and coalesce(s.archived, false) = false
    and s.fan_page->>'entry' = 'rsvp'
    and s.date is not null and not (h ? 'date')
    and (n->>'days_before') ~ '^-?[0-9]+$'
    and now() >= public.countdown_opens_at(s.date, (n->>'days_before')::int, n->>'time')
    and now() < public.countdown_opens_at(s.date, (n->>'days_before')::int, n->>'time') + interval '36 hours'
    and exists (
      select 1 from public.fan_rsvps r
      where r.show_id = s.id and r.countdown_stop is not true and coalesce(r.email, '') <> ''
        and not exists (select 1 from public.fan_countdown_log l where l.show_id = s.id and l.notch_id = n->>'id' and l.rsvp_id = r.id and l.sent_at is not null)
    );
$function$;

CREATE OR REPLACE FUNCTION public.open_countdown_notch(p_token uuid, p_key uuid, p_notch text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.fan_countdown_log (show_id, notch_id, rsvp_id, opened_at)
  select s.id, p_notch, r.id, now()
  from public.shows s
  join public.fan_rsvps r on r.show_id = s.id and r.sky_key = p_key
  where s.fan_token = p_token
    and exists (
      select 1 from jsonb_array_elements(coalesce(s.fan_countdown->'notches', '[]'::jsonb)) n
      where n->>'id' = p_notch and (n->>'days_before') ~ '^-?[0-9]+$'
        and now() >= public.countdown_opens_at(s.date, (n->>'days_before')::int, n->>'time')
    )
  on conflict (show_id, notch_id, rsvp_id) do update set opened_at = coalesce(public.fan_countdown_log.opened_at, excluded.opened_at);
$function$;

CREATE OR REPLACE FUNCTION public.set_countdown_hype(p_token uuid, p_key uuid, p_notch text, p_level integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.shows;
  v_rsvp uuid;
begin
  if p_level is null or p_level < 1 or p_level > 5 then
    return false;
  end if;
  select * into s from public.shows where fan_token = p_token;
  if s.id is null or s.fan_page_enabled is not true or coalesce(s.archived, false) then
    return false;
  end if;
  select id into v_rsvp from public.fan_rsvps where show_id = s.id and sky_key = p_key;
  if v_rsvp is null then
    return false;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(s.fan_countdown->'notches', '[]'::jsonb)) n
    where n->>'id' = p_notch and (n->>'days_before') ~ '^-?[0-9]+$'
      and now() >= public.countdown_opens_at(s.date, (n->>'days_before')::int, n->>'time')
  ) then
    return false;
  end if;

  insert into public.fan_countdown_log (show_id, notch_id, rsvp_id, opened_at, hype, hype_at)
  values (s.id, p_notch, v_rsvp, now(), p_level, now())
  on conflict (show_id, notch_id, rsvp_id) do update
    set hype = excluded.hype, hype_at = excluded.hype_at,
        opened_at = coalesce(public.fan_countdown_log.opened_at, excluded.opened_at);
  return true;
end;
$function$;

-- The automatic morning-after email steps aside when the host attaches the
-- film to one of their own countdown emails.
create or replace function public.fan_film_due()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'show_id', s.id,
    'fan_token', s.fan_token,
    'fan_slug', s.fan_slug,
    'event', jsonb_build_object(
      'event_name', s.event_name,
      'band_name', case when h ? 'band' then null else s.band_name end,
      'date', s.date,
      'venue', case when h ? 'venue' then null else s.venue end,
      'title', nullif(btrim(s.fan_page->'film'->>'title'), ''),
      'image', coalesce(nullif(s.fan_page->'film'->>'image', ''), case when h ? 'flyer' then null else nullif(s.fan_page->>'flyer_url', '') end, nullif(s.icon_url, ''))
    ),
    'rsvps', (
      select jsonb_agg(jsonb_build_object('rsvp_id', r.id, 'email', r.email, 'name', r.name, 'sky_key', r.sky_key))
      from public.fan_rsvps r
      where r.show_id = s.id and r.countdown_stop is not true and coalesce(r.email, '') <> ''
        and not exists (select 1 from public.fan_countdown_log l where l.show_id = s.id and l.notch_id = 'film' and l.rsvp_id = r.id and l.sent_at is not null)
    )
  )), '[]'::jsonb)
  from public.shows s
  cross join lateral (select coalesce(s.fan_page->'hidden', '[]'::jsonb) as h) hid
  where s.fan_page_enabled is true
    and coalesce(s.archived, false) = false
    and s.fan_page->>'entry' = 'rsvp'
    and coalesce(s.fan_page->'film'->>'on', 'true') <> 'false'
    and s.date is not null
    and not (
      s.fan_countdown->>'enabled' = 'true'
      and exists (select 1 from jsonb_array_elements(coalesce(s.fan_countdown->'notches', '[]'::jsonb)) n where n->>'film' = 'true')
    )
    and now() >= public.countdown_opens_at(s.date + 1, 0, '10:00')
    and now() < public.countdown_opens_at(s.date + 1, 0, '10:00') + interval '36 hours'
    and exists (
      select 1 from public.fan_rsvps r
      where r.show_id = s.id and r.countdown_stop is not true and coalesce(r.email, '') <> ''
        and not exists (select 1 from public.fan_countdown_log l where l.show_id = s.id and l.notch_id = 'film' and l.rsvp_id = r.id and l.sent_at is not null)
    );
$function$;

revoke all on function public.fan_film_due() from public, anon, authenticated;
