-- Job 400: the LD picks which 3D stage goes out with an intake link.
-- tour_manager_requests.lighting_rig is the stage the LD attached; the link
-- (and the other acts' links under it) show that one first, then the
-- event's stage, then the LD's stage for the venue (as before).
-- Patched in place; each replace() is asserted to match once.

alter table public.tour_manager_requests add column if not exists lighting_rig jsonb;

do $mig$
declare d text;
  a text := $a$then coalesce((select s.lighting_rig from public.shows s where s.id = coalesce(r.target_show_id, r.created_show_id)), public.ld_rig_for(r.engineer_user_id,$a$;
  b text := $b$then coalesce(r.lighting_rig, (select s.lighting_rig from public.shows s where s.id = coalesce(r.target_show_id, r.created_show_id)), public.ld_rig_for(r.engineer_user_id,$b$;
begin
  d := pg_get_functiondef('public.get_tour_manager_request'::regproc);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'tm anchor'; end if;
  execute replace(d, a, b);
end $mig$;

do $mig$
declare d text;
  a text := $a$then coalesce(s.lighting_rig, public.ld_rig_for(t.engineer_user_id,$a$;
  b text := $b$then coalesce(t.lighting_rig, s.lighting_rig, public.ld_rig_for(t.engineer_user_id,$b$;
begin
  d := pg_get_functiondef('public.get_opener_request'::regproc);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'opener anchor'; end if;
  execute replace(d, a, b);
end $mig$;
