-- ============================================================
-- Migration: after-the-show film settings reach the fan's sky (job 239)
-- ============================================================
--
-- The host sets the film up on the fan page (fan_page.film: on, star colors,
-- what is shown, title, card picture). get_event_sky now returns 'film' for
-- the fan: the settings, whether the show's day has passed, the card picture
-- and the date / venue for the date line. Recreated from the live body
-- (job 234's version, checked unchanged before applying) plus that field.

create or replace function public.get_event_sky(p_token uuid, p_key uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  s public.shows;
  me record;
  cfg jsonb;
  hidden jsonb;
  mine public.fan_sky_posts;
begin
  select * into s from public.shows where fan_token = p_token;
  if s.id is null or s.fan_page_enabled is not true or coalesce(s.archived, false) then
    return null;
  end if;

  select id, name, guests, countdown_stop into me from public.fan_rsvps where show_id = s.id and sky_key = p_key;
  if me is null then
    return null;
  end if;

  cfg := coalesce(s.fan_page, '{}'::jsonb);
  hidden := coalesce(cfg->'hidden', '[]'::jsonb);
  select * into mine from public.fan_sky_posts where rsvp_id = me.id and day = public.sky_today();

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
    -- After-the-show film (job 239): on unless the host turned it off; plays
    -- once the show's day has passed (Eastern). The card picture: the host's
    -- pick, else the fan page flyer (unless hidden), else the event picture.
    'film', case when coalesce(cfg->'film'->>'on', 'true') = 'false' then null else jsonb_build_object(
      'config', coalesce(cfg->'film', '{}'::jsonb),
      'show_over', s.date is not null and s.date < public.sky_today(),
      'image', coalesce(nullif(cfg->'film'->>'image', ''), case when hidden ? 'flyer' then null else nullif(cfg->>'flyer_url', '') end, nullif(s.icon_url, '')),
      'date', s.date,
      'venue', case when hidden ? 'venue' then null else s.venue end
    ) end,
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'guests', me.guests, 'countdown_stop', me.countdown_stop,
      'post_today', case when mine.id is null then null else jsonb_build_object('message', mine.message, 'day', mine.day, 'hidden', mine.hidden) end),
    'today', public.sky_today(),
    'stars', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'guests', r.guests, 'at', r.created_at,
          'post', (
            select jsonb_build_object('message', p.message, 'day', p.day, 'at', p.updated_at)
            from public.fan_sky_posts p
            where p.rsvp_id = r.id and (p.hidden is not true or r.id = me.id)
            order by p.day desc limit 1
          )) order by r.created_at)
      from public.fan_rsvps r where r.show_id = s.id
    ), '[]'::jsonb),
    'people', (select coalesce(sum(r.guests), 0) from public.fan_rsvps r where r.show_id = s.id),
    'countdown', public.countdown_for_fan(s, me.id)
  );
end;
$function$;

