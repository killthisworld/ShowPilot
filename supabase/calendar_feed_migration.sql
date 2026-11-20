-- Google Calendar for every profile (job 411).
--
-- Each person gets a private calendar feed: every event they own or are
-- linked into, as a .ics calendar that Google / Apple / Outlook subscribe to
-- (served by api/calendar.js at https://showpilot.space/cal/<token>.ics).
-- The token is the only key to the feed, so it's random, never shown to
-- anyone else, and can be reset (the old link stops working).
--
-- Safe to run more than once. Adds a table and four functions; changes
-- nothing that exists.

create table if not exists public.calendar_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reset_at timestamptz
);

-- Only reachable through the functions below.
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;

-- The signed-in person's feed token (made on first use).
create or replace function public.get_my_calendar_feed()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  insert into public.calendar_feeds (user_id) values (auth.uid())
  on conflict (user_id) do nothing;
  select token into v_token from public.calendar_feeds where user_id = auth.uid();
  return v_token;
end;
$$;

-- A new token: the old link stops working (they add the calendar again).
create or replace function public.reset_my_calendar_feed()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  insert into public.calendar_feeds (user_id, token, reset_at) values (auth.uid(), gen_random_uuid(), now())
  on conflict (user_id) do update set token = gen_random_uuid(), reset_at = now()
  returning token into v_token;
  return v_token;
end;
$$;

-- The events in a feed: the token's owner's own events and the events
-- linked to them (not archived), from 60 days back to two years ahead.
-- Only what a calendar entry needs - no share tokens, contacts or money.
create or replace function public.calendar_feed_events(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if p_token is null then
    return null;
  end if;
  select user_id into v_user from public.calendar_feeds where token = p_token;
  if v_user is null then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'event_name', s.event_name,
      'band_name', s.band_name,
      'event_type', s.event_type,
      'date', s.date,
      'event_time', s.event_time,
      'venue', s.venue,
      'city', s.city,
      'state', s.state,
      'address', case when jsonb_typeof(s.venue_info -> 'address') = 'string' then s.venue_info ->> 'address' end,
      'schedule', coalesce(s.venue_info -> 'schedule', '[]'::jsonb),
      'set_times', coalesce(s.manager_info -> 'set_times', '{}'::jsonb),
      'arrival_time', s.manager_info ->> 'arrival_time',
      'bands', coalesce((
        select jsonb_agg(jsonb_build_object('band_name', b.band_name, 'set_length_minutes', b.set_length_minutes) order by b.sort_order)
        from public.show_bands b where b.show_id = s.id
      ), '[]'::jsonb),
      'updated_at', s.updated_at
    ) order by s.date)
    from public.shows s
    where coalesce(s.archived, false) = false
      and s.date is not null
      and s.date between current_date - 60 and current_date + 730
      and (
        s.owner_id = v_user
        or exists (
          select 1 from public.linked_gigs lg
          where lg.user_id = v_user and lg.share_token = s.share_token and coalesce(lg.archived, false) = false
        )
      )
  ), '[]'::jsonb);
end;
$$;

-- The link in a calendar entry (showpilot.space/open/<event id>) opens the
-- event for whoever is signed in, if it's theirs or linked to them.
create or replace function public.calendar_event_token(p_show_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.share_token
  from public.shows s
  where s.id = p_show_id
    and auth.uid() is not null
    and (
      s.owner_id = auth.uid()
      or exists (
        select 1 from public.linked_gigs lg
        where lg.user_id = auth.uid() and lg.share_token = s.share_token
      )
    );
$$;

revoke all on function public.get_my_calendar_feed() from public, anon;
revoke all on function public.reset_my_calendar_feed() from public, anon;
revoke all on function public.calendar_event_token(uuid) from public, anon;
revoke all on function public.calendar_feed_events(uuid) from public;
grant execute on function public.get_my_calendar_feed() to authenticated;
grant execute on function public.reset_my_calendar_feed() to authenticated;
grant execute on function public.calendar_event_token(uuid) to authenticated;
-- The calendar app fetching the feed isn't signed in; the token is the key.
grant execute on function public.calendar_feed_events(uuid) to anon, authenticated;
