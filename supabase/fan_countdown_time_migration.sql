-- Countdown send times (job 213): each notch can go out at its own time on
-- its day ("time": "HH:MM", 24-hour, Eastern), instead of always 10:00 AM.
-- Notches without a time keep 10:00. The schedule now checks every 5
-- minutes (was hourly at :05) so a notch goes out within 5 minutes of its time.
-- Safe to run more than once.

-- When a notch opens: <time> Eastern on (show date - days_before).
create or replace function public.countdown_opens_at(p_date date, p_days int, p_time text)
returns timestamptz
language sql
immutable
as $$
  select ((p_date - greatest(0, least(30, coalesce(p_days, 0))))::timestamp
    + (case when coalesce(p_time, '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then p_time else '10:00' end)::time)
    at time zone 'America/New_York';
$$;

-- The old two-argument form (show-day pass, older callers) stays at 10:00.
create or replace function public.countdown_opens_at(p_date date, p_days int)
returns timestamptz
language sql
immutable
as $$
  select public.countdown_opens_at(p_date, p_days, '10:00');
$$;

create or replace function public.countdown_for_fan(p_show public.shows, p_rsvp uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
        where (n->>'days_before') ~ '^[0-9]+$'
      )
    ) end;
$$;
revoke all on function public.countdown_for_fan(public.shows, uuid) from public, anon, authenticated;

create or replace function public.open_countdown_notch(p_token uuid, p_key uuid, p_notch text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.fan_countdown_log (show_id, notch_id, rsvp_id, opened_at)
  select s.id, p_notch, r.id, now()
  from public.shows s
  join public.fan_rsvps r on r.show_id = s.id and r.sky_key = p_key
  where s.fan_token = p_token
    and exists (
      select 1 from jsonb_array_elements(coalesce(s.fan_countdown->'notches', '[]'::jsonb)) n
      where n->>'id' = p_notch and (n->>'days_before') ~ '^[0-9]+$'
        and now() >= public.countdown_opens_at(s.date, (n->>'days_before')::int, n->>'time')
    )
  on conflict (show_id, notch_id, rsvp_id) do update set opened_at = coalesce(public.fan_countdown_log.opened_at, excluded.opened_at);
$$;
revoke all on function public.open_countdown_notch(uuid, uuid, text) from public;
grant execute on function public.open_countdown_notch(uuid, uuid, text) to anon, authenticated;

create or replace function public.fan_countdown_due()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
    and (n->>'days_before') ~ '^[0-9]+$'
    and now() >= public.countdown_opens_at(s.date, (n->>'days_before')::int, n->>'time')
    and now() < public.countdown_opens_at(s.date, (n->>'days_before')::int, n->>'time') + interval '36 hours'
    and exists (
      select 1 from public.fan_rsvps r
      where r.show_id = s.id and r.countdown_stop is not true and coalesce(r.email, '') <> ''
        and not exists (select 1 from public.fan_countdown_log l where l.show_id = s.id and l.notch_id = n->>'id' and l.rsvp_id = r.id and l.sent_at is not null)
    );
$$;
revoke all on function public.fan_countdown_due() from public, anon, authenticated;
grant execute on function public.fan_countdown_due() to service_role;

-- Check every 5 minutes (replaces the hourly schedule).
select cron.unschedule(jobid) from cron.job where jobname = 'fan-countdown';
select cron.schedule(
  'fan-countdown',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://tbskirwlveqbjqyvtpiz.supabase.co/functions/v1/fan-countdown',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
