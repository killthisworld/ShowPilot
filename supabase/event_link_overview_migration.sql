-- Event link shows the event overview (job 176, 2026-10-26).
-- Instead of hand-picked text blocks, an act's link page shows the event's
-- own overview card, live: picture, name, date, venue and address, the run
-- of show, the lineup, and the ticket link / venue website. Nothing private
-- (no deal, no Wi-Fi password, no contacts). get_event_link_public gains an
-- `overview` object; everything else it returns is unchanged.
-- Safe to run more than once.

create or replace function public.get_event_link_public(p_code text, p_token uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_link public.event_links;
  v_show record;
  v_resp public.event_link_responses;
  v_bands jsonb;
begin
  select * into v_link from public.event_links where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    return null;
  end if;
  select event_name, band_name, venue, date, city, state, icon_url, event_type,
         venue_info, manager_info, promoter_info
    into v_show from public.shows where id = v_link.show_id;
  if p_token is not null then
    select * into v_resp from public.event_link_responses where token = p_token and link_id = v_link.id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('band_name', b.band_name, 'role', b.role, 'set_length_minutes', b.set_length_minutes) order by b.sort_order nulls last, b.id), '[]'::jsonb)
    into v_bands
    from public.show_bands b
   where b.show_id = v_link.show_id and coalesce(btrim(b.band_name), '') <> '';
  return jsonb_build_object(
    'title', coalesce(nullif(v_show.event_name, ''), v_show.band_name),
    'venue', v_show.venue,
    'date', v_show.date,
    'place', nullif(concat_ws(', ', v_show.city, v_show.state), ''),
    'message', v_link.message,
    'blocks', v_link.blocks,
    'asks', v_link.asks,
    'overview', jsonb_build_object(
      'image', coalesce(nullif(v_show.icon_url, ''), v_show.venue_info->>'photo_url'),
      'event_type', v_show.event_type,
      'address', v_show.venue_info->>'address',
      'load_in', v_show.venue_info->>'load_in_location',
      'parking', v_show.venue_info->>'parking',
      'schedule', coalesce(v_show.venue_info->'schedule', '[]'::jsonb),
      'set_times', coalesce(v_show.manager_info->'set_times', '{}'::jsonb),
      'bands', v_bands,
      'ticket_link', v_show.promoter_info->>'ticket_link',
      'website', v_show.venue_info->>'website'
    ),
    'response', case when v_resp.id is null then null else jsonb_build_object(
      'act_name', v_resp.act_name, 'answers', v_resp.answers, 'submitted_at', v_resp.submitted_at) end
  );
end;
$function$;
