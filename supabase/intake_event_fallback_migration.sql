-- Job 215: an artist's intake link made for an existing event (target_show_id)
-- doesn't store the event's name, venue or date on the link itself, so the form
-- showed "Your show". Both lookups now fall back to the linked event's own name,
-- venue and date. Display only; nothing else reads these.
-- Bodies are the live ones (checked 2026-11-03) plus the fallbacks.

CREATE OR REPLACE FUNCTION public.get_tour_manager_request(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.tour_manager_requests;
  v_pic jsonb;
begin
  if p_token is null then
    return null;
  end if;
  select * into r from public.tour_manager_requests where invite_token = p_token;
  if not found then
    return null;
  end if;
  select jsonb_build_object(
           'image', coalesce(nullif(s.icon_url, ''), nullif(s.venue_info->>'photo_url', '')),
           'event_type', coalesce(s.event_type, r.event_type),
           'event_name', coalesce(nullif(trim(r.event_name), ''), nullif(trim(s.event_name), '')),
           'venue', coalesce(nullif(trim(r.venue), ''), nullif(trim(s.venue), '')),
           'date', coalesce(r.date, s.date))
    into v_pic
    from public.shows s
   where s.id = coalesce(r.target_show_id, r.created_show_id);
  v_pic := coalesce(v_pic, jsonb_build_object('image', null, 'event_type', r.event_type));
  if auth.uid() is not null and auth.uid() = r.engineer_user_id then
    return to_jsonb(r) || v_pic;
  end if;
  return jsonb_build_object(
    'status', r.status,
    'event_name', r.event_name,
    'date', r.date,
    'venue', r.venue,
    'engineer_name', r.engineer_name,
    'include_services', r.include_services
  ) || v_pic;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_opener_request(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'status', o.status,
    'include_services', o.include_services,
    'tour_manager_requests', case when t.id is null then null else jsonb_build_object(
      'band_name', t.band_name,
      'event_name', coalesce(nullif(trim(t.event_name), ''), nullif(trim(s.event_name), '')),
      'venue', coalesce(nullif(trim(t.venue), ''), nullif(trim(s.venue), '')),
      'date', coalesce(t.date, s.date),
      'location', t.location,
      'engineer_user_id', t.engineer_user_id,
      'image', coalesce(nullif(s.icon_url, ''), nullif(s.venue_info->>'photo_url', '')),
      'event_type', coalesce(s.event_type, t.event_type)
    ) end
  )
  from public.opener_requests o
  left join public.tour_manager_requests t on t.id = o.tour_manager_request_id
  left join public.shows s on s.id = coalesce(t.target_show_id, t.created_show_id)
  where p_token is not null and o.invite_token = p_token;
$function$;
