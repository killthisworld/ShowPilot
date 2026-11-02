-- ============================================================
-- Migration: link previews (job 203)
-- Run this in Supabase SQL Editor
-- ============================================================
--
-- When a ShowPilot link is pasted into iMessage, Slack, Discord or a social
-- post, the app that shows the preview reads the link's page title and color.
-- api/preview.js (a Vercel function, used only for those preview fetchers)
-- calls this to get the event name and the role the link is for, so the
-- preview says "Friday Night Show" in the right profile color instead of
-- "ShowPilot" in green.
--
-- Read only: it never marks an invite opened or touches anything. It returns
-- only the event name, venue, date and role, nothing private.
--   p_kind 'v'       the venue's event link   (/v/<code>)             -> venue
--   p_kind 'intake'  an intake short link     (/intake/<code>)        -> band
--   p_kind 'invite'  a section invite         (/gig/shared?invite=)   -> the invited role
--   p_kind 'share'   an event's share link    (/gig/shared?token=, /gig/web?token=) -> no role
-- Also returns the event picture so the preview can be the event's overview card.

create or replace function public.get_link_preview(p_kind text, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_key, '')));
  v_show public.shows;
  v_role text;
  v_label text;
  v_form text;
  r record;
begin
  if p_kind = 'v' then
    select s.* into v_show from public.event_links l join public.shows s on s.id = l.show_id where l.code = v_code;
    if not found then return null; end if;
    v_role := 'venue';

  elsif p_kind = 'intake' then
    select target_show_id, engineer_name into r from public.tour_manager_requests where short_code = v_code;
    if found then
      v_form := 'performer';
      v_label := r.engineer_name;
      if r.target_show_id is not null then select * into v_show from public.shows where id = r.target_show_id; end if;
    else
      select q.target_show_id, q.engineer_name into r
        from public.opener_requests o join public.tour_manager_requests q on q.id = o.tour_manager_request_id
       where o.short_code = v_code;
      if not found then return null; end if;
      v_form := 'opener';
      v_label := r.engineer_name;
      if r.target_show_id is not null then select * into v_show from public.shows where id = r.target_show_id; end if;
    end if;
    v_role := 'band';

  elsif p_kind = 'invite' then
    begin
      select gi.invited_role, gi.show_id into r from public.gig_invites gi where gi.invite_token = btrim(p_key)::uuid;
    exception when invalid_text_representation then
      return null;
    end;
    if not found then return null; end if;
    select * into v_show from public.shows where id = r.show_id;
    v_role := r.invited_role;

  elsif p_kind = 'share' then
    begin
      select * into v_show from public.shows where share_token = btrim(p_key)::uuid;
    exception when invalid_text_representation then
      return null;
    end;
    if not found then return null; end if;

  else
    return null;
  end if;

  return jsonb_build_object(
    'title', coalesce(nullif(btrim(v_show.event_name), ''), nullif(btrim(v_show.band_name), '')),
    'venue', nullif(btrim(v_show.venue), ''),
    'date', v_show.date,
    'role', v_role,
    'form', v_form,
    'image', coalesce(nullif(btrim(v_show.icon_url), ''), nullif(btrim(v_show.venue_info->>'photo_url'), '')),
    'from', v_label
  );
end;
$function$;

revoke all on function public.get_link_preview(text, text) from public;
grant execute on function public.get_link_preview(text, text) to anon, authenticated;
