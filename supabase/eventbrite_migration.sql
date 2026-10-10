-- Eventbrite connection: real ticket buyers get the event-info email.
--
-- A host connects their Eventbrite account (OAuth), then links one Show Pilot
-- event to one Eventbrite event from the fan page settings. Eventbrite calls
-- the eventbrite-webhook edge function on every new order; the function reads
-- the order with the host's token (that read is the proof the sale is real)
-- and emails the buyer the same info the fan page shows, once per address.
--
-- Tokens and webhook secrets are server-only: the connection, OAuth-state and
-- webhook tables have RLS on with no policies, so only the edge functions
-- (service role) can touch them. Hosts may read their own event links.
--
-- Nothing here is stored on public.shows on purpose: that table currently has
-- a USING (true) select policy (see work board job 2), so anything added to it
-- would be readable by anyone.

-- One Eventbrite account per Show Pilot user.
create table if not exists public.eventbrite_connections (
  owner_id          uuid primary key references auth.users(id) on delete cascade,
  eb_user_id        text not null,
  access_token      text not null,
  organization_ids  text[] not null default '{}',
  webhook_secret    text not null unique,     -- part of the webhook URL; identifies the connection
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Short-lived OAuth "state" values, so a callback can only finish a connect
-- that the same signed-in user started in the last few minutes.
create table if not exists public.eventbrite_oauth_states (
  state       text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  return_to   text,
  created_at  timestamptz not null default now()
);

-- The order.placed webhook we registered on each of the host's organizations.
create table if not exists public.eventbrite_webhooks (
  organization_id  text primary key,
  owner_id         uuid not null references auth.users(id) on delete cascade,
  webhook_id       text not null,
  created_at       timestamptz not null default now()
);

-- Which Eventbrite event a Show Pilot event sells through.
create table if not exists public.eventbrite_event_links (
  show_id        uuid primary key references public.shows(id) on delete cascade,
  owner_id       uuid not null references auth.users(id) on delete cascade,
  eb_event_id    text not null,
  eb_event_name  text,
  eb_event_url   text,
  created_at     timestamptz not null default now()
);
create index if not exists eventbrite_event_links_event_idx on public.eventbrite_event_links (eb_event_id);

alter table public.eventbrite_connections  enable row level security;
alter table public.eventbrite_oauth_states enable row level security;
alter table public.eventbrite_webhooks     enable row level security;
alter table public.eventbrite_event_links  enable row level security;

revoke all on public.eventbrite_connections  from anon, authenticated;
revoke all on public.eventbrite_oauth_states from anon, authenticated;
revoke all on public.eventbrite_webhooks     from anon, authenticated;
revoke all on public.eventbrite_event_links  from anon, authenticated;

-- Hosts can see their own links (read only; linking goes through the function).
grant select on public.eventbrite_event_links to authenticated;
drop policy if exists "Owners can view their Eventbrite links" on public.eventbrite_event_links;
create policy "Owners can view their Eventbrite links"
  on public.eventbrite_event_links for select
  to authenticated
  using (auth.uid() = owner_id);

-- Where each fan email came from.
alter table public.fan_email_signups add column if not exists source text not null default 'fan_page'; -- fan_page | eventbrite
alter table public.fan_email_signups add column if not exists eb_order_id text;

-- get_fan_event: same as before, plus emails_buyers, so the fan page can say
-- "buyers get the info by email" instead of showing the opt-in box.
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
    'address', nullif(cfg->>'address', ''),
    'city', s.city,
    'state', s.state,
    'emails_buyers', exists (select 1 from public.eventbrite_event_links l where l.show_id = s.id)
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
