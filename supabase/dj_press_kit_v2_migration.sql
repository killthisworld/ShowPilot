-- DJ press kit, round 2 (job 459, 2026-11-22): "Played at" history from
-- real Show Pilot events, an open-dates calendar, and date requests from
-- promoters that land in the DJ's Bookings.
--
-- Needs dj_press_kit_migration.sql (job 457) first.

alter table public.dj_press_kits
  add column if not exists show_history boolean not null default true,
  add column if not exists take_requests boolean not null default true;

-- A promoter asking for a night. Anyone with the press kit link can send
-- one (through request_dj_date only); the DJ reads and answers them.
create table if not exists public.dj_date_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  event_name text not null default '',
  venue text not null default '',
  city text not null default '',
  set_time text not null default '',
  name text not null,
  email text not null default '',
  phone text not null default '',
  message text not null default '',
  status text not null default 'new' check (status in ('new', 'hold', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dj_date_requests_owner_date on public.dj_date_requests (owner_id, date);
create index if not exists dj_date_requests_owner_created on public.dj_date_requests (owner_id, created_at);

alter table public.dj_date_requests enable row level security;
drop policy if exists "DJs see requests for their dates" on public.dj_date_requests;
create policy "DJs see requests for their dates" on public.dj_date_requests
  for select using ((select auth.uid()) = owner_id);
drop policy if exists "DJs answer requests for their dates" on public.dj_date_requests;
create policy "DJs answer requests for their dates" on public.dj_date_requests
  for update using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "DJs clear requests for their dates" on public.dj_date_requests;
create policy "DJs clear requests for their dates" on public.dj_date_requests
  for delete using ((select auth.uid()) = owner_id);
-- No insert policy: requests only come in through request_dj_date.

-- What Show Pilot knows about a DJ's nights. Events count when the DJ made
-- them or is linked to them (not archived). "confirmed" = someone else made
-- the event (a venue, an artist) and the DJ is on it, so it isn't self-reported.
create or replace function public._dj_kit_extras(p_owner uuid, p_dates boolean, p_history boolean, p_name text)
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select s.id, s.date, coalesce(nullif(s.event_name, ''), nullif(s.band_name, ''), 'Event') as name,
           coalesce(s.venue, '') as venue, (s.owner_id <> p_owner) as confirmed
    from public.shows s
    where s.date is not null and coalesce(s.archived, false) = false
      and (s.owner_id = p_owner or exists (
        select 1 from public.linked_gigs l
        where l.show_id = s.id and l.user_id = p_owner and coalesce(l.archived, false) = false
      ))
  )
  select jsonb_build_object(
    'dates', case when p_dates then coalesce((
      select jsonb_agg(jsonb_build_object('date', d.date, 'name', d.name, 'venue', d.venue) order by d.date)
      from (select * from mine where date >= current_date order by date limit 12) d
    ), '[]'::jsonb) else '[]'::jsonb end,
    -- Only the days, never what's on them: the calendar greys them out.
    'booked', coalesce((select jsonb_agg(distinct m.date) from mine m where m.date >= current_date and m.date < current_date + 730), '[]'::jsonb),
    'holds', coalesce((
      select jsonb_agg(distinct r.date) from public.dj_date_requests r
      where r.owner_id = p_owner and r.status = 'hold' and r.date >= current_date
    ), '[]'::jsonb),
    'history', case when p_history then coalesce((
      select jsonb_agg(jsonb_build_object('date', h.date, 'name', h.name, 'venue', h.venue, 'confirmed', h.confirmed, 'with', h.lineup) order by h.date desc)
      from (
        select m.*, coalesce((
          select jsonb_agg(b.band_name order by b.sort_order)
          from (
            select b.band_name, b.sort_order from public.show_bands b
            where b.show_id = m.id and coalesce(b.band_name, '') <> ''
              and lower(b.band_name) <> lower(coalesce(p_name, ''))
            order by b.sort_order nulls last limit 4
          ) b
        ), '[]'::jsonb) as lineup
        from mine m where m.date < current_date order by m.date desc limit 24
      ) h
    ), '[]'::jsonb) else '[]'::jsonb end
  );
$$;
revoke all on function public._dj_kit_extras(uuid, boolean, boolean, text) from public, anon, authenticated;

-- The public press kit (job 457), now with the history, the calendar and
-- whether the DJ takes requests.
create or replace function public.get_dj_press_kit(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', t.name,
    'photo_url', t.data->>'photo_url',
    'genre_tags', coalesce(t.data->'genre_tags', '[]'::jsonb),
    'city', t.data->>'kit_city',
    'bio', t.data->>'kit_bio',
    'mixes', coalesce(t.data->'kit_mixes', '[]'::jsonb),
    'press_photos', coalesce(t.data->'kit_photos', '[]'::jsonb),
    'logo_url', t.data->>'kit_logo_url',
    'links', coalesce(t.data->'kit_links', '[]'::jsonb),
    'contact_name', t.data->>'contact_name',
    'contact_email', t.data->>'contact_email',
    'contact_phone', t.data->>'contact_phone',
    'take_requests', k.take_requests
  ) || public._dj_kit_extras(k.owner_id, k.show_dates, k.show_history, t.name)
  from public.dj_press_kits k
  join public.saved_templates t on t.id = k.template_id
  where k.token = p_token and length(coalesce(p_token, '')) >= 24;
$$;
revoke all on function public.get_dj_press_kit(text) from public;
grant execute on function public.get_dj_press_kit(text) to anon, authenticated;

-- The DJ's own view (Profile tab): everything, whatever the switches say.
create or replace function public.get_my_dj_kit_extras(p_name text default '') returns jsonb
language sql stable security definer set search_path = public as $$
  select public._dj_kit_extras(auth.uid(), true, true, p_name) where auth.uid() is not null;
$$;
revoke all on function public.get_my_dj_kit_extras(text) from public, anon;
grant execute on function public.get_my_dj_kit_extras(text) to authenticated;

-- A promoter asks for a night from the press kit.
create or replace function public.request_dj_date(
  p_token text, p_date date, p_name text, p_email text default '', p_phone text default '',
  p_event_name text default '', p_venue text default '', p_city text default '', p_set_time text default '',
  p_message text default ''
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  k public.dj_press_kits%rowtype;
  v_name text := left(btrim(coalesce(p_name, '')), 120);
  v_email text := lower(left(btrim(coalesce(p_email, '')), 200));
  v_phone text := left(btrim(coalesce(p_phone, '')), 40);
  v_id uuid;
begin
  select * into k from public.dj_press_kits where token = p_token and length(coalesce(p_token, '')) >= 24;
  if not found or k.template_id is null then raise exception 'This press kit isn''t available'; end if;
  if not k.take_requests then raise exception 'This DJ isn''t taking date requests here right now'; end if;
  if p_date is null or p_date < current_date or p_date > current_date + 730 then raise exception 'Pick a date in the next two years'; end if;
  if v_name = '' then raise exception 'Add your name'; end if;
  if v_email = '' and v_phone = '' then raise exception 'Add an email or a phone number so the DJ can reply'; end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn''t look right'; end if;
  if exists (
    select 1 from public.shows s
    where s.date = p_date and coalesce(s.archived, false) = false
      and (s.owner_id = k.owner_id or exists (
        select 1 from public.linked_gigs l where l.show_id = s.id and l.user_id = k.owner_id and coalesce(l.archived, false) = false
      ))
  ) then raise exception 'That night is already booked'; end if;
  -- Keep a public form from being used to flood a DJ.
  if (select count(*) from public.dj_date_requests r where r.owner_id = k.owner_id and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'This DJ has a lot of requests today. Try again tomorrow, or email them.';
  end if;
  if (select count(*) from public.dj_date_requests r
      where r.owner_id = k.owner_id and r.created_at > now() - interval '1 day'
        and ((v_email <> '' and r.email = v_email) or (v_phone <> '' and r.phone = v_phone))) >= 3 then
    raise exception 'You''ve already sent this DJ a few requests today';
  end if;
  insert into public.dj_date_requests (owner_id, date, event_name, venue, city, set_time, name, email, phone, message)
  values (k.owner_id, p_date, left(btrim(coalesce(p_event_name, '')), 160), left(btrim(coalesce(p_venue, '')), 160),
          left(btrim(coalesce(p_city, '')), 120), left(btrim(coalesce(p_set_time, '')), 60), v_name, v_email, v_phone,
          left(btrim(coalesce(p_message, '')), 1000))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_dj_date(text, date, text, text, text, text, text, text, text, text) from public;
grant execute on function public.request_dj_date(text, date, text, text, text, text, text, text, text, text) to anon, authenticated;
