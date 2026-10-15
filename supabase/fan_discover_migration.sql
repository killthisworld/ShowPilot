-- Fan Discover (job 85): signed-in fans who turn on recommendations see
-- upcoming events near their home city. Only events whose host switched on
-- "List in local shows" (fan_page.discover = true) on a live fan page are
-- returned, and only the same public fields the fan page shows:
--   * the date and venue must be visible on the fan page (a hidden date or
--     venue means the host wants it private, so it's never listed)
--   * venue_where = 'email' keeps the venue name out (city and state only)
--   * the artist name and ticket price follow their hidden switches
-- p_states takes the state as fans and hosts might type it ("OH", "Ohio").
-- Safe to run more than once.

create or replace function public.get_local_shows(p_city text, p_states text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row->>'local')::boolean desc, row->>'date'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'show_key', md5(s.id::text),
      'fan_token', s.fan_token,
      'fan_slug', s.fan_slug,
      'event_name', s.event_name,
      'band_name', case when h ? 'band' then null else s.band_name end,
      'event_type', nullif(trim(s.event_type), ''),
      'date', s.date,
      'show_time', s.fan_page->>'show_time',
      'venue', case when s.fan_page->>'venue_where' = 'email' then null else s.venue end,
      'city', s.city,
      'state', s.state,
      'flyer_url', case when h ? 'flyer' then null else s.fan_page->>'flyer_url' end,
      'entry', case when s.fan_page->>'entry' = 'rsvp' then 'rsvp' else 'tickets' end,
      'price', case when h ? 'tickets' then null else nullif(s.promoter_info->>'ticket_price', '') end,
      'local', lower(trim(coalesce(s.city, ''))) = lower(trim(coalesce(p_city, ''))),
      'going', exists (
        select 1 from public.fan_rsvps r
        where r.show_id = s.id
          and coalesce(auth.jwt()->>'email', '') <> ''
          and lower(r.email) = lower(auth.jwt()->>'email')
      )
    ) as row
    from public.shows s
    cross join lateral (select coalesce(s.fan_page->'hidden', '[]'::jsonb) as h) hid
    where s.fan_page_enabled is true
      and coalesce(s.archived, false) = false
      and s.fan_page->>'discover' = 'true'
      and s.date >= current_date
      and s.date <= current_date + 120
      and not (h ? 'date')
      and not (h ? 'venue')
      and coalesce(array_length(p_states, 1), 0) > 0
      and lower(trim(coalesce(s.state, ''))) = any (select lower(trim(x)) from unnest(p_states) x)
    order by lower(trim(coalesce(s.city, ''))) = lower(trim(coalesce(p_city, ''))) desc, s.date
    limit 80
  ) t;
$$;

revoke all on function public.get_local_shows(text, text[]) from public, anon;
grant execute on function public.get_local_shows(text, text[]) to authenticated;
