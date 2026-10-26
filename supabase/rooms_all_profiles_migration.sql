-- Event chat rooms for every profile (job 175, 2026-10-26).
--
-- ensure_my_gig_room_membership (opens / joins an event's rooms):
-- 1. Always makes the General, Venue, Manager / Artist and Audio / Lighting
--    rooms. It used to skip a section the event's old included_sections
--    left out (one older event had no Audio / Lighting room), and it no
--    longer makes Promoter / Booking agent rooms (those profiles are gone;
--    the app already hides the old ones).
-- 2. Artists join the Manager / Artist room and lighting techs the Audio /
--    Lighting room. Before, only an accepted "manager" or "engineer"
--    invite counted, so Artist and Lighting invitees never got their room.
-- The live function is patched in place; everything else is unchanged.
-- Safe to run more than once.

do $$
declare
  v_def text;
  v_old_sections text := E'v_all_sections text[] := array[''venue'',''promoter'',''booking_agent'',''manager'',''engineer'',''general''];';
  v_new_sections text := E'v_all_sections text[] := array[''venue'',''manager'',''engineer'',''general''];';
  v_old_skip text := E'    if v_section <> ''general'' and v_show.included_sections is not null and not (v_section = any(v_show.included_sections)) then\n      continue;\n    end if;\n';
  v_old_q text := E'v_qualifies := v_is_owner or (v_section = any(v_my_roles)) or (v_section = any(v_granted));';
  v_new_q text := E'v_qualifies := v_is_owner\n        or (v_section = any(v_my_roles)) or (v_section = any(v_granted))\n        or (v_section = ''manager'' and (''band'' = any(v_my_roles) or ''band'' = any(v_granted)))\n        or (v_section = ''engineer'' and (''lighting'' = any(v_my_roles) or ''lighting'' = any(v_granted)));';
begin
  select pg_get_functiondef('public.ensure_my_gig_room_membership(uuid)'::regprocedure) into v_def;
  if position(v_new_sections in v_def) > 0 then
    raise notice 'ensure_my_gig_room_membership already patched';
    return;
  end if;
  if position(v_old_sections in v_def) = 0 or position(v_old_skip in v_def) = 0 or position(v_old_q in v_def) = 0 then
    raise exception 'ensure_my_gig_room_membership changed since this migration was written; not patching';
  end if;
  v_def := replace(v_def, v_old_sections, v_new_sections);
  v_def := replace(v_def, v_old_skip, '');
  v_def := replace(v_def, v_old_q, v_new_q);
  execute v_def;
end $$;
