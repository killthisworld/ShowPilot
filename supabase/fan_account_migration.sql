-- Fan accounts (job 77): a signed-in fan sees every event they RSVP'd to
-- with the email on their Show Pilot account. RSVPs stay owner-read only;
-- this function returns just the fan's own rows, matched on the verified
-- email in their login token, with the same hidden-field rules as the sky.
-- Safe to run more than once.

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
      'rsvped_at', r.created_at
    ) as row
    from public.fan_rsvps r
    join public.shows s on s.id = r.show_id
    where coalesce(auth.jwt()->>'email', '') <> ''
      and lower(r.email) = lower(auth.jwt()->>'email')
      and s.fan_page_enabled is true
      and coalesce(s.archived, false) = false
  ) t;
$$;

revoke all on function public.get_my_fan_shows() from public, anon;
grant execute on function public.get_my_fan_shows() to authenticated;
