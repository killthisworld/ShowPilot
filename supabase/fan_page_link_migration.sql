-- Lets anyone linked to an event (they hold its crew share_token) find out
-- whether the event's fan page is on and get its link, without being able to
-- edit it. Returns only the fan token and the on/off flag.
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
  select fan_token, fan_page_enabled, archived into s from public.shows where share_token = p_share_token;
  if s is null then
    return null;
  end if;
  return jsonb_build_object(
    'enabled', coalesce(s.fan_page_enabled, false),
    'fan_token', case when s.fan_page_enabled then s.fan_token else null end
  );
end;
$function$;

revoke all on function public.get_fan_link(uuid) from public;
grant execute on function public.get_fan_link(uuid) to anon, authenticated;
