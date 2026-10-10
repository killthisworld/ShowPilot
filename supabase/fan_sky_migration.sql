-- RSVP key + shared event sky.
--
-- Every RSVP gets its own random sky_key. The RSVP email links to
-- /e/<fan_token>/sky?k=<sky_key>; that page plays the key-unlock animation and
-- opens the event's sky, where every RSVP is a star.
--
-- get_event_sky only answers for a key that belongs to an RSVP of that event,
-- so only people who RSVP'd can see the sky. It never returns other fans'
-- names or emails: each star is just an id, a party size and when it joined.
-- The key holder's own name comes back so the page can greet them.

alter table public.fan_rsvps add column if not exists sky_key uuid not null default gen_random_uuid();
create unique index if not exists fan_rsvps_sky_key_key on public.fan_rsvps (sky_key);

CREATE OR REPLACE FUNCTION public.get_event_sky(p_token uuid, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  me record;
  cfg jsonb;
  hidden jsonb;
begin
  select * into s from public.shows where fan_token = p_token;
  if s is null or s.fan_page_enabled is not true or coalesce(s.archived, false) then
    return null;
  end if;

  select id, name, guests into me from public.fan_rsvps where show_id = s.id and sky_key = p_key;
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
      'date', s.date,
      'venue', s.venue,
      'city', s.city,
      'state', s.state
    ),
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'guests', me.guests),
    'stars', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'guests', r.guests, 'at', r.created_at) order by r.created_at)
      from public.fan_rsvps r where r.show_id = s.id
    ), '[]'::jsonb),
    'people', (select coalesce(sum(r.guests), 0) from public.fan_rsvps r where r.show_id = s.id)
  );
end;
$function$;

revoke all on function public.get_event_sky(uuid, uuid) from public;
grant execute on function public.get_event_sky(uuid, uuid) to anon, authenticated;
