-- Custom, readable fan page links: showpilot.space/rsvp/<name>.
--
-- fan_slug   optional name the owner picks for the event's fan link, e.g.
--            "friday-night-live". Lowercase letters, numbers and single
--            hyphens, 3-40 characters. Unique across all events.
--            The random fan_token keeps working, so links and QR codes that
--            are already out there never break.
--
-- resolve_fan_key(text)  turns whatever is in the URL (a slug or the old
--            token) into the fan_token, only for events whose public page is
--            on and not archived. Every other fan function keeps taking the
--            fan_token, so nothing else about the page changes.
--
-- QR code colors and shape are stored in shows.fan_page->'qr' (no column
-- needed): { "fg": "#000000", "bg": "#ffffff", "shape": "square|rounded|dots" }.

alter table public.shows add column if not exists fan_slug text;

alter table public.shows drop constraint if exists shows_fan_slug_format;
alter table public.shows add constraint shows_fan_slug_format check (
  fan_slug is null or (
    fan_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(fan_slug) between 3 and 40
    -- A slug must never look like a token, or the two could be confused.
    and fan_slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

create unique index if not exists shows_fan_slug_key on public.shows (fan_slug) where fan_slug is not null;

CREATE OR REPLACE FUNCTION public.resolve_fan_key(p_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t uuid;
begin
  if p_key is null or p_key = '' then
    return null;
  end if;
  if p_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select fan_token into t from public.shows
      where fan_token = p_key::uuid and fan_page_enabled is true and not coalesce(archived, false);
  else
    select fan_token into t from public.shows
      where fan_slug = lower(p_key) and fan_page_enabled is true and not coalesce(archived, false);
  end if;
  return t;
end;
$function$;

revoke all on function public.resolve_fan_key(text) from public;
grant execute on function public.resolve_fan_key(text) to anon, authenticated;

-- Linked (non-owner) people see the same link and QR style as the owner.
CREATE OR REPLACE FUNCTION public.get_fan_link(p_share_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
begin
  select fan_token, fan_slug, fan_page, fan_page_enabled, archived into s from public.shows where share_token = p_share_token;
  if s is null then
    return null;
  end if;
  return jsonb_build_object(
    'enabled', coalesce(s.fan_page_enabled, false),
    'fan_token', case when s.fan_page_enabled then s.fan_token else null end,
    'fan_slug', case when s.fan_page_enabled then s.fan_slug else null end,
    'qr', case when s.fan_page_enabled then s.fan_page->'qr' else null end
  );
end;
$function$;

revoke all on function public.get_fan_link(uuid) from public;
grant execute on function public.get_fan_link(uuid) to anon, authenticated;
