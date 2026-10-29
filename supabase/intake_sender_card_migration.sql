-- Job 202: pictures stay visible on the intake forms for someone who isn't
-- signed in. Both token lookups now also return 'engineer': the sender's
-- public card (name, title, photo, card link, card colours), the same things
-- their shared digital card shows. Before, the page read user_preferences
-- directly, which a signed-out visitor can't, so the key and the centre
-- circle lost the picture. Bodies are the live ones (job 199) plus that.

create or replace function public.get_opener_request(p_token uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'status', o.status,
    'include_services', o.include_services,
    'tour_manager_requests', case when t.id is null then null else jsonb_build_object(
      'band_name', t.band_name,
      'event_name', t.event_name,
      'venue', t.venue,
      'date', t.date,
      'location', t.location,
      'engineer_user_id', t.engineer_user_id,
      'image', coalesce(nullif(s.icon_url, ''), nullif(s.venue_info->>'photo_url', '')),
      'event_type', coalesce(s.event_type, t.event_type),
      'engineer', case when e.user_id is null then null else jsonb_build_object(
        'display_name', e.display_name, 'job_title', e.job_title, 'profile_photo_url', e.profile_photo_url,
        'card_share_token', e.card_share_token, 'card_bg_color', e.card_bg_color,
        'card_bg_image_url', e.card_bg_image_url, 'card_text_color', e.card_text_color) end
    ) end
  )
  from public.opener_requests o
  left join public.tour_manager_requests t on t.id = o.tour_manager_request_id
  left join public.shows s on s.id = coalesce(t.target_show_id, t.created_show_id)
  left join public.user_preferences e on e.user_id = t.engineer_user_id
  where p_token is not null and o.invite_token = p_token;
$function$;

create or replace function public.get_tour_manager_request(p_token uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  r public.tour_manager_requests;
  v_pic jsonb;
  v_eng jsonb;
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
           'event_type', coalesce(s.event_type, r.event_type))
    into v_pic
    from public.shows s
   where s.id = coalesce(r.target_show_id, r.created_show_id);
  v_pic := coalesce(v_pic, jsonb_build_object('image', null, 'event_type', r.event_type));
  select jsonb_build_object(
           'display_name', e.display_name, 'job_title', e.job_title, 'profile_photo_url', e.profile_photo_url,
           'card_share_token', e.card_share_token, 'card_bg_color', e.card_bg_color,
           'card_bg_image_url', e.card_bg_image_url, 'card_text_color', e.card_text_color)
    into v_eng
    from public.user_preferences e
   where e.user_id = r.engineer_user_id;
  v_pic := v_pic || jsonb_build_object('engineer', v_eng);
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
