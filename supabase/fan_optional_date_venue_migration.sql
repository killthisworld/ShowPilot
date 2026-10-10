-- Fan page: date and venue become optional.
--
-- Only the event name and icon are always on the fan page now. Hosts can hide
-- the date ("date") and the venue ("venue": venue name, street address, city
-- and state) with the same fan_page.hidden list as the other fields, for
-- private events, speakeasies or small business events. Hidden fields never
-- leave the database: not on the fan page, not in fan emails (they're built
-- from get_fan_event), not on the event sky.

-- get_fan_event: as in fan_lineup_migration.sql, with date/venue optional.
CREATE OR REPLACE FUNCTION public.get_fan_event(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  cfg jsonb;
  hidden jsonb;
  is_rsvp boolean;
  out jsonb;
begin
  select * into s from public.shows where fan_token = p_token;
  if s is null or s.fan_page_enabled is not true or coalesce(s.archived, false) then
    return null;
  end if;

  cfg := coalesce(s.fan_page, '{}'::jsonb);
  hidden := coalesce(cfg->'hidden', '[]'::jsonb);
  is_rsvp := coalesce(cfg->>'entry', 'tickets') = 'rsvp';

  out := jsonb_build_object(
    'event_name', s.event_name,
    'event_type', s.event_type,
    'icon_url', s.icon_url,
    'rsvp', is_rsvp,
    'lineup', coalesce((
      select jsonb_agg(jsonb_build_object('id', e->>'id', 'name', e->>'name') order by ord)
      from jsonb_array_elements(case when jsonb_typeof(cfg->'lineup') = 'array' then cfg->'lineup' else '[]'::jsonb end)
           with ordinality as t(e, ord)
      where coalesce(e->>'id', '') <> '' and coalesce(trim(e->>'name'), '') <> ''
    ), '[]'::jsonb),
    'emails_buyers', (not is_rsvp) and exists (select 1 from public.eventbrite_event_links l where l.show_id = s.id)
  );

  -- Date and venue are optional (private events, speakeasies, small business
  -- events): hidden means they never leave the database.
  if not (hidden ? 'date') then
    out := out || jsonb_build_object('date', s.date);
  end if;
  if not (hidden ? 'venue') then
    out := out || jsonb_build_object(
      'venue', s.venue,
      'address', nullif(cfg->>'address', ''),
      'city', s.city,
      'state', s.state
    );
  end if;

  if not (hidden ? 'times') then
    out := out || jsonb_build_object(
      'door_time', nullif(s.promoter_info->>'door_time', ''),
      'show_time', nullif(cfg->>'show_time', ''),
      'ages', nullif(cfg->>'ages', '')
    );
  end if;
  if not (hidden ? 'tickets') then
    if is_rsvp then
      out := out || jsonb_build_object('door_price', nullif(s.promoter_info->>'ticket_price', ''));
    else
      out := out || jsonb_build_object(
        'ticket_link', nullif(s.promoter_info->>'ticket_link', ''),
        'ticket_price', nullif(s.promoter_info->>'ticket_price', '')
      );
    end if;
  end if;
  if not (hidden ? 'band') then
    out := out || jsonb_build_object('band_name', s.band_name);
  end if;
  if not (hidden ? 'note') then
    out := out || jsonb_build_object('note', nullif(cfg->>'note', ''));
  end if;
  if not (hidden ? 'flyer') then
    out := out || jsonb_build_object('flyer_url', nullif(cfg->>'flyer_url', ''));
  end if;

  return out;
end;
$function$;

revoke all on function public.get_fan_event(uuid) from public;
grant execute on function public.get_fan_event(uuid) to anon, authenticated;

-- get_event_sky: as in fan_sky_migration.sql, with date/venue optional.
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
      'date', case when hidden ? 'date' then null else s.date end,
      'venue', case when hidden ? 'venue' then null else s.venue end,
      'city', case when hidden ? 'venue' then null else s.city end,
      'state', case when hidden ? 'venue' then null else s.state end
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
