-- Fan countdown (job 78): up to 5 notches per event before the show.
-- Each notch is one email to everyone who RSVP'd, sent at 10 AM Eastern on
-- its day (days_before the show, 0 = morning of). A Reminder carries the
-- event details; an Unlock also reveals something in the event sky (text,
-- an image and/or a link). Fans who RSVP late see past unlocks right away.
--
-- shows.fan_countdown (owner-edited, never exposed directly):
--   { "enabled": true, "notches": [ { "id": "n1", "days_before": 7,
--     "type": "reminder" | "unlock", "subject": "", "message": "",
--     "kind": "note" | "setlist" | "playlist" | "bts" | "doors" | "merch",
--     "title": "", "body": "", "image_url": "", "link_url": "" } ] }
--
-- The hourly schedule calls the fan-countdown edge function with the same
-- vault key as the weekly digest (check_digest_secret). Safe to run again.

alter table public.shows add column if not exists fan_countdown jsonb;
alter table public.fan_rsvps add column if not exists countdown_stop boolean not null default false;

-- One row per notch per RSVP: when the email went out, when the fan opened it in the sky.
create table if not exists public.fan_countdown_log (
  show_id uuid not null references public.shows(id) on delete cascade,
  notch_id text not null,
  rsvp_id uuid not null references public.fan_rsvps(id) on delete cascade,
  sent_at timestamptz,
  opened_at timestamptz,
  primary key (show_id, notch_id, rsvp_id)
);
alter table public.fan_countdown_log enable row level security;
-- No policies: only the functions below touch it.

-- When a notch opens: 10 AM Eastern on (show date - days_before).
create or replace function public.countdown_opens_at(p_date date, p_days int)
returns timestamptz
language sql
immutable
as $$
  select ((p_date - greatest(0, least(30, coalesce(p_days, 0))))::timestamp + interval '10 hours') at time zone 'America/New_York';
$$;

-- The notches as a fan sees them: what's still locked shows only its day.
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
            'type', case when n->>'type' = 'unlock' then 'unlock' else 'reminder' end,
            'kind', n->>'kind',
            'opens_at', public.countdown_opens_at(p_show.date, (n->>'days_before')::int),
            'open', now() >= public.countdown_opens_at(p_show.date, (n->>'days_before')::int),
            'seen', exists (select 1 from public.fan_countdown_log l where l.show_id = p_show.id and l.notch_id = n->>'id' and l.rsvp_id = p_rsvp and l.opened_at is not null)
          ) || case when now() >= public.countdown_opens_at(p_show.date, (n->>'days_before')::int) and n->>'type' = 'unlock' then
            jsonb_build_object('title', n->>'title', 'body', n->>'body', 'image_url', n->>'image_url', 'link_url', n->>'link_url', 'message', n->>'message')
          else '{}'::jsonb end
          order by (n->>'days_before')::int desc
        )
        from jsonb_array_elements(p_show.fan_countdown->'notches') n
        where (n->>'days_before') ~ '^[0-9]+$'
      )
    ) end;
$$;
revoke all on function public.countdown_for_fan(public.shows, uuid) from public, anon, authenticated;

-- The event sky (key link): same as before, plus the countdown.
create or replace function public.get_event_sky(p_token uuid, p_key uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  s public.shows;
  me record;
  cfg jsonb;
  hidden jsonb;
begin
  select * into s from public.shows where fan_token = p_token;
  if s.id is null or s.fan_page_enabled is not true or coalesce(s.archived, false) then
    return null;
  end if;

  select id, name, guests, countdown_stop into me from public.fan_rsvps where show_id = s.id and sky_key = p_key;
  if me is null then
    return null;
  end if;

  cfg := coalesce(s.fan_page, '{}'::jsonb);
  hidden := coalesce(cfg->'hidden', '[]'::jsonb);

  return jsonb_build_object(
    'event', jsonb_build_object(
      'event_name', s.event_name,
      'band_name', case when hidden ? 'band' then null else s.band_name end,
      'event_type', s.event_type,
      'date', case when hidden ? 'date' then null else s.date end,
      'venue', case when hidden ? 'venue' then null else s.venue end,
      'city', case when hidden ? 'venue' then null else s.city end,
      'state', case when hidden ? 'venue' then null else s.state end
    ),
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'guests', me.guests, 'countdown_stop', me.countdown_stop),
    'stars', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'guests', r.guests, 'at', r.created_at) order by r.created_at)
      from public.fan_rsvps r where r.show_id = s.id
    ), '[]'::jsonb),
    'people', (select coalesce(sum(r.guests), 0) from public.fan_rsvps r where r.show_id = s.id),
    'countdown', public.countdown_for_fan(s, me.id)
  );
end;
$function$;

-- A fan opened an unlocked notch in the sky (for the host's "opened" count).
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
        and now() >= public.countdown_opens_at(s.date, (n->>'days_before')::int)
    )
  on conflict (show_id, notch_id, rsvp_id) do update set opened_at = coalesce(public.fan_countdown_log.opened_at, excluded.opened_at);
$$;
revoke all on function public.open_countdown_notch(uuid, uuid, text) from public;
grant execute on function public.open_countdown_notch(uuid, uuid, text) to anon, authenticated;

-- "Stop countdown emails" link (the RSVP and the key stay active).
create or replace function public.stop_countdown_emails(p_key uuid)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  with u as (update public.fan_rsvps set countdown_stop = true where sky_key = p_key returning 1)
  select exists (select 1 from u);
$$;
revoke all on function public.stop_countdown_emails(uuid) from public;
grant execute on function public.stop_countdown_emails(uuid) to anon, authenticated;

-- For the host's Countdown tab: per notch, how many got it and opened it.
create or replace function public.get_countdown_stats(p_show_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not exists (select 1 from public.shows where id = p_show_id and owner_id = auth.uid()) then null else
    coalesce((
      select jsonb_object_agg(notch_id, jsonb_build_object('sent', sent, 'opened', opened))
      from (
        select notch_id, count(*) filter (where sent_at is not null) as sent, count(*) filter (where opened_at is not null) as opened
        from public.fan_countdown_log where show_id = p_show_id group by notch_id
      ) t
    ), '{}'::jsonb) end;
$$;
revoke all on function public.get_countdown_stats(uuid) from public, anon;
grant execute on function public.get_countdown_stats(uuid) to authenticated;

-- What's due right now (service role): notches that opened in the last 36
-- hours, for RSVPs that haven't had them and haven't stopped the emails.
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
    and now() >= public.countdown_opens_at(s.date, (n->>'days_before')::int)
    and now() < public.countdown_opens_at(s.date, (n->>'days_before')::int) + interval '36 hours'
    and exists (
      select 1 from public.fan_rsvps r
      where r.show_id = s.id and r.countdown_stop is not true and coalesce(r.email, '') <> ''
        and not exists (select 1 from public.fan_countdown_log l where l.show_id = s.id and l.notch_id = n->>'id' and l.rsvp_id = r.id and l.sent_at is not null)
    );
$$;
revoke all on function public.fan_countdown_due() from public, anon, authenticated;
grant execute on function public.fan_countdown_due() to service_role;

create or replace function public.mark_countdown_sent(p_show_id uuid, p_notch text, p_rsvp_ids uuid[])
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.fan_countdown_log (show_id, notch_id, rsvp_id, sent_at)
  select p_show_id, p_notch, x, now() from unnest(p_rsvp_ids) x
  on conflict (show_id, notch_id, rsvp_id) do update set sent_at = coalesce(public.fan_countdown_log.sent_at, excluded.sent_at);
$$;
revoke all on function public.mark_countdown_sent(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.mark_countdown_sent(uuid, text, uuid[]) to service_role;

-- Fan home (Shows / Sky): add each show's countdown progress.
create or replace function public.get_my_fan_shows()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row->>'date') nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'rsvp_id', r.id,
      'fan_token', s.fan_token,
      'fan_slug', s.fan_slug,
      'event_name', s.event_name,
      'band_name', case when coalesce(s.fan_page->'hidden', '[]'::jsonb) ? 'band' then null else s.band_name end,
      'event_type', s.event_type,
      'date', case when coalesce(s.fan_page->'hidden', '[]'::jsonb) ? 'date' then null else s.date end,
      'show_time', s.fan_page->>'show_time',
      'venue', case when coalesce(s.fan_page->'hidden', '[]'::jsonb) ? 'venue' then null else s.venue end,
      'city', case when coalesce(s.fan_page->'hidden', '[]'::jsonb) ? 'venue' then null else s.city end,
      'state', case when coalesce(s.fan_page->'hidden', '[]'::jsonb) ? 'venue' then null else s.state end,
      'flyer_url', s.fan_page->>'flyer_url',
      'guests', r.guests,
      'artist_name', r.artist_name,
      'sky_key', r.sky_key,
      'rsvped_at', r.created_at,
      'notches_total', (select count(*) from jsonb_array_elements(coalesce(c->'notches', '[]'::jsonb))),
      'notches_open', (select count(*) filter (where (x->>'open')::boolean) from jsonb_array_elements(coalesce(c->'notches', '[]'::jsonb)) x),
      'notches_new', (select count(*) filter (where (x->>'open')::boolean and x->>'type' = 'unlock' and not (x->>'seen')::boolean) from jsonb_array_elements(coalesce(c->'notches', '[]'::jsonb)) x)
    ) as row
    from public.fan_rsvps r
    join public.shows s on s.id = r.show_id
    cross join lateral (select public.countdown_for_fan(s, r.id) as c) cd
    where coalesce(auth.jwt()->>'email', '') <> ''
      and lower(r.email) = lower(auth.jwt()->>'email')
      and s.fan_page_enabled is true
      and coalesce(s.archived, false) = false
  ) t;
$$;
revoke all on function public.get_my_fan_shows() from public, anon;
grant execute on function public.get_my_fan_shows() to authenticated;

-- Hourly check (replaces itself if run again).
select cron.unschedule(jobid) from cron.job where jobname = 'fan-countdown';
select cron.schedule(
  'fan-countdown',
  '5 * * * *',
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
