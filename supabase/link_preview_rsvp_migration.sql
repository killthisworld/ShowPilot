-- ============================================================
-- Migration: link previews for fan / RSVP links (job 220)
-- Run this in Supabase SQL Editor
-- ============================================================
--
-- Same function as link_preview_migration.sql (jobs 203 / 204, live body),
-- plus one more kind:
--   p_kind 'rsvp'  a fan page link: /rsvp/<token>, /e/<token> or a custom
--                  name (showpilot.space/<name>)                     -> fan
-- It only answers for a fan page that's switched on and not archived (the
-- same rule as resolve_fan_key), and it leaves out whatever the fan page
-- hides: no date when the date is hidden, no venue (or venue picture) when
-- the venue is hidden or only sent by email. Returns 'entry' ('rsvp' or
-- 'tickets') so the card can say which. Read only, nothing private.

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
  v_sections text[] := '{}';
  r record;
  v_tok uuid;
  v_cfg jsonb;
  v_hidden jsonb;
  v_novenue boolean;
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
      select gi.invited_role, gi.show_id, coalesce(gi.granted_sections, '{}'::text[]) as granted into r from public.gig_invites gi where gi.invite_token = btrim(p_key)::uuid;
    exception when invalid_text_representation then
      return null;
    end;
    if not found then return null; end if;
    select * into v_show from public.shows where id = r.show_id;
    v_role := r.invited_role;
    v_sections := r.granted;

  elsif p_kind = 'share' then
    begin
      select * into v_show from public.shows where share_token = btrim(p_key)::uuid;
    exception when invalid_text_representation then
      return null;
    end;
    if not found then return null; end if;

  elsif p_kind = 'rsvp' then
    v_tok := public.resolve_fan_key(btrim(coalesce(p_key, '')));
    if v_tok is null then return null; end if;
    select * into v_show from public.shows where fan_token = v_tok;
    if not found then return null; end if;
    v_cfg := coalesce(v_show.fan_page, '{}'::jsonb);
    v_hidden := coalesce(v_cfg->'hidden', '[]'::jsonb);
    v_novenue := (v_hidden ? 'venue') or coalesce(v_cfg->>'venue_where', 'both') = 'email';
    return jsonb_build_object(
      'title', coalesce(nullif(btrim(v_show.event_name), ''),
                        case when v_hidden ? 'band' then null else nullif(btrim(v_show.band_name), '') end,
                        case when v_novenue then null else nullif(btrim(v_show.venue), '') end),
      'venue', case when v_novenue then null else nullif(btrim(v_show.venue), '') end,
      'date', case when v_hidden ? 'date' then null else v_show.date end,
      'role', 'fan',
      'entry', case when coalesce(v_cfg->>'entry', 'tickets') = 'rsvp' then 'rsvp' else 'tickets' end,
      'sections', '[]'::jsonb,
      'image', coalesce(nullif(btrim(v_show.icon_url), ''),
                        case when v_hidden ? 'flyer' then null else nullif(btrim(v_cfg->>'flyer_url'), '') end,
                        case when v_novenue then null else nullif(btrim(v_show.venue_info->>'photo_url'), '') end)
    );

  else
    return null;
  end if;

  return jsonb_build_object(
    'title', coalesce(nullif(btrim(v_show.event_name), ''), nullif(btrim(v_show.band_name), '')),
    'venue', nullif(btrim(v_show.venue), ''),
    'date', v_show.date,
    'role', v_role,
    'form', v_form,
    'sections', to_jsonb(v_sections),
    'image', coalesce(nullif(btrim(v_show.icon_url), ''), nullif(btrim(v_show.venue_info->>'photo_url'), '')),
    'from', v_label
  );
end;
$function$;

revoke all on function public.get_link_preview(text, text) from public;
grant execute on function public.get_link_preview(text, text) to anon, authenticated;
