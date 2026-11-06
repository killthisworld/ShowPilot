-- ============================================================
-- Migration: hype meter in countdown emails + a message a day in the sky (job 234)
-- ============================================================
--
-- Hype meter: every countdown email ends with "How hyped are you?" and five
-- buttons. A tap opens the fan's sky with ?hype=<notch>.<1-5>, which calls
-- set_countdown_hype. One answer per fan per email (a later tap changes it).
-- Only the event owner sees the totals (get_countdown_stats). Fans never see
-- how anyone else answered.
--
-- Sky messages: a fan can post one short message a day (Eastern day) to the
-- event's sky. Their star shows a preview bubble of their latest message;
-- tapping the star shows the party size and the message. Never the fan's
-- name. The owner can hide a message (it disappears from the sky for
-- everyone but stays visible to the fan who wrote it, marked hidden).
--
-- Same access model as the rest of the fan side: no table policies, SECURITY
-- DEFINER functions with their own checks. Fans prove who they are with the
-- event's fan_token + their own sky_key, like get_event_sky.
--
-- Recreated from the live bodies (checked 2026-11-06):
--   get_event_sky          + per-star 'post', + me.post_today
--   get_countdown_stats    + per-notch 'hype' {1..5 counts} and 'hyped' (taps)

alter table public.fan_countdown_log add column if not exists hype smallint;
alter table public.fan_countdown_log add column if not exists hype_at timestamptz;
do $$ begin
  alter table public.fan_countdown_log add constraint fan_countdown_log_hype_check check (hype is null or hype between 1 and 5);
exception when duplicate_object then null; end $$;

create table if not exists public.fan_sky_posts (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  rsvp_id uuid not null references public.fan_rsvps(id) on delete cascade,
  day date not null,
  message text not null check (char_length(message) between 1 and 140),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rsvp_id, day)
);
create index if not exists fan_sky_posts_show_idx on public.fan_sky_posts (show_id, day desc);
alter table public.fan_sky_posts enable row level security;
revoke all on public.fan_sky_posts from anon, authenticated;

-- Today, Eastern (the day a message counts toward).
create or replace function public.sky_today()
returns date
language sql
stable
as $function$
  select (now() at time zone 'America/New_York')::date;
$function$;

-- ---------- Hype ----------
create or replace function public.set_countdown_hype(p_token uuid, p_key uuid, p_notch text, p_level int)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- Only an email that has gone out (its notch has opened).
  if not exists (
    select 1 from jsonb_array_elements(coalesce(s.fan_countdown->'notches', '[]'::jsonb)) n
    where n->>'id' = p_notch and (n->>'days_before') ~ '^[0-9]+$'
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

revoke all on function public.set_countdown_hype(uuid, uuid, text, int) from public;
grant execute on function public.set_countdown_hype(uuid, uuid, text, int) to anon, authenticated;

-- ---------- Sky messages ----------
-- Post (or replace) today's message. Returns the post.
create or replace function public.post_sky_message(p_token uuid, p_key uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.shows;
  v_rsvp uuid;
  v_msg text := btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  v_post public.fan_sky_posts;
begin
  select * into s from public.shows where fan_token = p_token;
  if s.id is null or s.fan_page_enabled is not true or coalesce(s.archived, false) then
    raise exception 'This sky is closed';
  end if;
  select id into v_rsvp from public.fan_rsvps where show_id = s.id and sky_key = p_key;
  if v_rsvp is null then
    raise exception 'This key does not open this sky';
  end if;
  if v_msg = '' then
    raise exception 'Write a message first';
  end if;
  v_msg := left(v_msg, 140);

  insert into public.fan_sky_posts (show_id, rsvp_id, day, message)
  values (s.id, v_rsvp, public.sky_today(), v_msg)
  on conflict (rsvp_id, day) do update set message = excluded.message, updated_at = now()
  returning * into v_post;

  return jsonb_build_object('message', v_post.message, 'day', v_post.day, 'hidden', v_post.hidden);
end;
$function$;

revoke all on function public.post_sky_message(uuid, uuid, text) from public;
grant execute on function public.post_sky_message(uuid, uuid, text) to anon, authenticated;

-- Take today's message down (the fan's own).
create or replace function public.delete_sky_message(p_token uuid, p_key uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  with gone as (
    delete from public.fan_sky_posts p
    using public.shows s, public.fan_rsvps r
    where s.fan_token = p_token and r.show_id = s.id and r.sky_key = p_key
      and p.rsvp_id = r.id and p.day = public.sky_today()
      and p.hidden is not true -- a message the owner hid stays hidden (no delete + repost around it)
    returning 1
  )
  select exists (select 1 from gone);
$function$;

revoke all on function public.delete_sky_message(uuid, uuid) from public;
grant execute on function public.delete_sky_message(uuid, uuid) to anon, authenticated;

-- Owner: every message on the event, newest first, with who wrote it.
create or replace function public.get_sky_posts(p_show_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when not exists (select 1 from public.shows where id = p_show_id and owner_id = auth.uid()) then null else
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'message', p.message, 'day', p.day, 'hidden', p.hidden, 'at', p.updated_at,
          'name', r.name, 'guests', r.guests
        ) order by p.day desc, p.updated_at desc)
      from public.fan_sky_posts p join public.fan_rsvps r on r.id = p.rsvp_id
      where p.show_id = p_show_id
    ), '[]'::jsonb) end;
$function$;

revoke all on function public.get_sky_posts(uuid) from public, anon;
grant execute on function public.get_sky_posts(uuid) to authenticated;

-- Owner: hide or show a message.
create or replace function public.set_sky_post_hidden(p_post_id uuid, p_hidden boolean)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  with done as (
    update public.fan_sky_posts p set hidden = coalesce(p_hidden, true), updated_at = p.updated_at
    from public.shows s
    where p.id = p_post_id and s.id = p.show_id and s.owner_id = auth.uid()
    returning 1
  )
  select exists (select 1 from done);
$function$;

revoke all on function public.set_sky_post_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_sky_post_hidden(uuid, boolean) to authenticated;

-- ---------- The sky: + each star's latest message, + mine today ----------
create or replace function public.get_event_sky(p_token uuid, p_key uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  s public.shows;
  me record;
  cfg jsonb;
  hidden jsonb;
  mine public.fan_sky_posts;
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
  select * into mine from public.fan_sky_posts where rsvp_id = me.id and day = public.sky_today();

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
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'guests', me.guests, 'countdown_stop', me.countdown_stop,
      'post_today', case when mine.id is null then null else jsonb_build_object('message', mine.message, 'day', mine.day, 'hidden', mine.hidden) end),
    'today', public.sky_today(),
    'stars', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'guests', r.guests, 'at', r.created_at,
          'post', (
            select jsonb_build_object('message', p.message, 'day', p.day, 'at', p.updated_at)
            from public.fan_sky_posts p
            where p.rsvp_id = r.id and (p.hidden is not true or r.id = me.id)
            order by p.day desc limit 1
          )) order by r.created_at)
      from public.fan_rsvps r where r.show_id = s.id
    ), '[]'::jsonb),
    'people', (select coalesce(sum(r.guests), 0) from public.fan_rsvps r where r.show_id = s.id),
    'countdown', public.countdown_for_fan(s, me.id)
  );
end;
$function$;

-- ---------- Owner stats: + hype per email ----------
create or replace function public.get_countdown_stats(p_show_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when not exists (select 1 from public.shows where id = p_show_id and owner_id = auth.uid()) then null else
    coalesce((
      select jsonb_object_agg(notch_id, jsonb_build_object('sent', sent, 'opened', opened, 'hyped', hyped,
          'hype', jsonb_build_object('1', h1, '2', h2, '3', h3, '4', h4, '5', h5)))
      from (
        select notch_id, count(*) filter (where sent_at is not null) as sent, count(*) filter (where opened_at is not null) as opened,
          count(*) filter (where hype is not null) as hyped,
          count(*) filter (where hype = 1) as h1, count(*) filter (where hype = 2) as h2, count(*) filter (where hype = 3) as h3,
          count(*) filter (where hype = 4) as h4, count(*) filter (where hype = 5) as h5
        from public.fan_countdown_log where show_id = p_show_id group by notch_id
      ) t
    ), '{}'::jsonb) end;
$function$;
