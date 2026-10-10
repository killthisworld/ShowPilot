-- Fan page RSVP (pay at the door).
--
-- A host can set the fan page's entry mode to RSVP (fan_page.entry = 'rsvp')
-- instead of a ticket link. Fans then leave their name, email and party size
-- on the fan page; the send-fan-event-email edge function records the RSVP
-- here and emails them the event info once. fan_page.entry lives in the
-- existing fan_page jsonb, so public.shows gets no new column.
--
-- Only the edge function (service role) writes RSVPs. The event's owner can
-- read the RSVPs for their own events (the RSVP list in Fan page settings).
-- Nobody else can read them.

create table if not exists public.fan_rsvps (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid not null references public.shows(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  email       text not null,
  guests      int  not null default 1 check (guests between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One RSVP per address per event (RSVPing again updates it).
create unique index if not exists fan_rsvps_show_email_key on public.fan_rsvps (show_id, lower(email));
create index if not exists fan_rsvps_show_created_idx on public.fan_rsvps (show_id, created_at desc);

alter table public.fan_rsvps enable row level security;
revoke all on public.fan_rsvps from anon, authenticated;
grant select on public.fan_rsvps to authenticated;

drop policy if exists "Owners can view RSVPs for their events" on public.fan_rsvps;
create policy "Owners can view RSVPs for their events"
  on public.fan_rsvps for select
  to authenticated
  using (exists (select 1 from public.shows s where s.id = fan_rsvps.show_id and s.owner_id = auth.uid()));

-- get_fan_event: same as before, plus the entry mode.
--   rsvp       true when the host chose "RSVP, pay at the door"
--   door_price the price fans pay at the door (RSVP mode; hidden with "tickets")
-- In RSVP mode the ticket link is not returned, and emails_buyers is false
-- (Eventbrite buyer emails only apply to ticket-link events).
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
