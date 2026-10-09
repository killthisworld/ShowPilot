-- Public fan event page. The owner of an event can turn on a link anyone can
-- open (no login) that shows a trimmed-down view of the event: name, icon,
-- date, venue, and whichever of times / tickets / band / note / flyer they
-- choose to show. Crew details (cues, contacts, requirements, tasks) are never
-- returned by the function below.
--
-- fan_token       its own token, separate from share_token (which opens the
--                 full crew Gig Web), so sharing the fan link never exposes
--                 the crew one.
-- fan_page_enabled  off by default.
-- fan_page        jsonb: { hidden: ["times","tickets","band","note","flyer"],
--                          note, show_time, ages, flyer_url }
alter table public.shows add column if not exists fan_token uuid default gen_random_uuid();
alter table public.shows add column if not exists fan_page_enabled boolean not null default false;
alter table public.shows add column if not exists fan_page jsonb not null default '{}'::jsonb;

update public.shows set fan_token = gen_random_uuid() where fan_token is null;
create unique index if not exists shows_fan_token_key on public.shows (fan_token);

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
  out jsonb;
begin
  select * into s from public.shows where fan_token = p_token;
  if s is null or s.fan_page_enabled is not true or coalesce(s.archived, false) then
    return null;
  end if;

  cfg := coalesce(s.fan_page, '{}'::jsonb);
  hidden := coalesce(cfg->'hidden', '[]'::jsonb);

  out := jsonb_build_object(
    'event_name', s.event_name,
    'event_type', s.event_type,
    'icon_url', s.icon_url,
    'date', s.date,
    'venue', s.venue,
    'city', s.city,
    'state', s.state
  );

  if not (hidden ? 'times') then
    out := out || jsonb_build_object(
      'door_time', nullif(s.promoter_info->>'door_time', ''),
      'show_time', nullif(cfg->>'show_time', ''),
      'ages', nullif(cfg->>'ages', '')
    );
  end if;
  if not (hidden ? 'tickets') then
    out := out || jsonb_build_object(
      'ticket_link', nullif(s.promoter_info->>'ticket_link', ''),
      'ticket_price', nullif(s.promoter_info->>'ticket_price', '')
    );
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
