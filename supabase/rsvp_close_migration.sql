-- ============================================================
-- Migration: RSVPs close at a set time (job 304)
-- ============================================================
--
-- The host can set a time when RSVPs close (fan_page.rsvp_close_at, an ISO
-- timestamp saved from the fan page editor in the host's own time zone).
-- get_fan_event now also returns:
--   rsvp_closes_at  the close time, while it's set
--   rsvp_closed     true once that time has passed
-- The fan page shows "RSVPs are closed" and the send-fan-event-email function
-- turns RSVPs away once rsvp_closed is true.
--
-- Recreated from the live body (md5 1ff0910a3fa989340436f186c875408f, checked
-- 2026-11-12) plus the block marked job 304.

CREATE OR REPLACE FUNCTION public.get_fan_event(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  cfg jsonb;
  hidden jsonb;
  is_rsvp boolean;
  cap numeric;
  close_at timestamptz;
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

  if not (hidden ? 'date') then
    out := out || jsonb_build_object('date', s.date);
  end if;
  if not (hidden ? 'venue') and coalesce(cfg->>'venue_where', 'both') <> 'email' then
    out := out || jsonb_build_object(
      'venue', s.venue,
      'address', nullif(cfg->>'address', ''),
      'city', s.city,
      'state', s.state
    );
  end if;
  if not (hidden ? 'venue') and cfg->>'venue_where' = 'email' then
    out := out || jsonb_build_object('venue_by_email', true);
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

  if is_rsvp and jsonb_typeof(cfg->'capacity') = 'number' then
    cap := floor((cfg->>'capacity')::numeric);
    if cap >= 1 then
      out := out || jsonb_build_object('rsvp_full',
        (select coalesce(sum(guests), 0) from public.fan_rsvps r where r.show_id = s.id) >= cap);
    end if;
  end if;

  -- Job 304: RSVPs close at the host's set time. Only a well-formed ISO
  -- timestamp counts, so a bad value can never break the fan page.
  if is_rsvp and coalesce(cfg->>'rsvp_close_at', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$' then
    close_at := (cfg->>'rsvp_close_at')::timestamptz;
    out := out || jsonb_build_object('rsvp_closes_at', close_at, 'rsvp_closed', now() >= close_at);
  end if;

  return out;
end;
$function$;
