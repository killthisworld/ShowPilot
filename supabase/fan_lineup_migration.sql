-- Fan page lineup + "who are you coming to see" on RSVP.
--
-- The host builds the lineup in Fan page settings; it's stored in the
-- existing fan_page jsonb as fan_page.lineup = [{ id, name }, ...] (no new
-- column on public.shows). get_fan_event returns it (id + name only) so the
-- fan page can show it and the RSVP form can ask which artist the fan is
-- coming to see. The RSVP keeps the chosen artist's id and its name at the
-- time, so renaming or removing an artist later doesn't lose the count.

alter table public.fan_rsvps add column if not exists artist_id text;
alter table public.fan_rsvps add column if not exists artist_name text;

-- get_fan_event: same as before (fan_rsvp_migration.sql), plus lineup.
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
    'date', s.date,
    'venue', s.venue,
    'address', nullif(cfg->>'address', ''),
    'city', s.city,
    'state', s.state,
    'rsvp', is_rsvp,
    -- The lineup (host-built in Fan page settings): only id + name go out.
    'lineup', coalesce((
      select jsonb_agg(jsonb_build_object('id', e->>'id', 'name', e->>'name') order by ord)
      from jsonb_array_elements(case when jsonb_typeof(cfg->'lineup') = 'array' then cfg->'lineup' else '[]'::jsonb end)
           with ordinality as t(e, ord)
      where coalesce(e->>'id', '') <> '' and coalesce(trim(e->>'name'), '') <> ''
    ), '[]'::jsonb),
    'emails_buyers', (not is_rsvp) and exists (select 1 from public.eventbrite_event_links l where l.show_id = s.id)
  );

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
