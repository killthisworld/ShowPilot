-- Where the venue shows: the host picks fan page, confirmation email, or
-- both (fan_page.venue_where = 'page' | 'email' | 'both'; missing means
-- 'both', which is how every existing event already behaves).
--
-- get_fan_event is the public page's view, so it only returns the venue,
-- address, city and state when they're meant for the page. The
-- confirmation email (RSVPs and Eventbrite buyers) reads them separately
-- with the service role in send-fan-event-email. Unticking Venue still
-- keeps them out of both.
--
-- Rebuilt from the live definition; only the venue block changed.

create or replace function public.get_fan_event(p_token uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
  -- events): hidden means they never leave the database. A venue meant only
  -- for the confirmation email stays off the public page too.
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
  -- Lets the page tell fans the location comes with their confirmation.
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

  return out;
end;
$function$;
