-- Job 383: the event's own 3D stage for an LD.
-- An LD loads or builds a 3D stage on the event (shows.lighting_rig). That
-- stage is the one sent with their intake links and shown on the shared
-- event; when the event has none, the LD's stage for the venue is used
-- (ld_rig_for, from the lighting_ld migration) as before.
-- The functions are patched in place: each replace() is asserted to match once.

alter table public.shows add column if not exists lighting_rig jsonb;

-- Intake link sent from an event (artist / manager).
do $mig$
declare d text; n text;
  a text := $a$'lighting_rig', case when v_eng->>'account_type' = 'lighting' then public.ld_rig_for(r.engineer_user_id,$a$;
  b text := $b$'lighting_rig', case when v_eng->>'account_type' = 'lighting' then coalesce((select s.lighting_rig from public.shows s where s.id = coalesce(r.target_show_id, r.created_show_id)), public.ld_rig_for(r.engineer_user_id,$b$;
  c text := $c$(select s.venue from public.shows s where s.id = coalesce(r.target_show_id, r.created_show_id)))) end);$c$;
  c2 text := $c$(select s.venue from public.shows s where s.id = coalesce(r.target_show_id, r.created_show_id))))) end);$c$;
begin
  d := pg_get_functiondef('public.get_tour_manager_request'::regproc);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'tm anchor a'; end if;
  if (length(d) - length(replace(d, c, ''))) / length(c) <> 1 then raise exception 'tm anchor c'; end if;
  n := replace(replace(d, a, b), c, c2);
  execute n;
end $mig$;

-- Opener intake link.
do $mig$
declare d text; n text;
  a text := $a$'lighting_rig', case when e.account_type = 'lighting' then public.ld_rig_for(t.engineer_user_id, coalesce(nullif(btrim(t.venue), ''), s.venue)) end,$a$;
  b text := $b$'lighting_rig', case when e.account_type = 'lighting' then coalesce(s.lighting_rig, public.ld_rig_for(t.engineer_user_id, coalesce(nullif(btrim(t.venue), ''), s.venue))) end,$b$;
begin
  d := pg_get_functiondef('public.get_opener_request'::regproc);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'opener anchor'; end if;
  n := replace(d, a, b);
  execute n;
end $mig$;

-- Shared event: the event's stage first.
do $mig$
declare d text; n text;
  a text := $a$'lighting_rig', (
      select public.ld_rig_for(u.uid, v_show.venue)$a$;
  b text := $b$'lighting_rig', coalesce((select s2.lighting_rig from public.shows s2 where s2.id = v_show.id), (
      select public.ld_rig_for(u.uid, v_show.venue)$b$;
  c text := $c$      order by u.ord limit 1)
  );
end;$c$;
  c2 text := $c$      order by u.ord limit 1))
  );
end;$c$;
begin
  d := pg_get_functiondef('public.get_shared_gig'::regproc);
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'shared anchor a'; end if;
  if (length(d) - length(replace(d, c, ''))) / length(c) <> 1 then raise exception 'shared anchor c'; end if;
  n := replace(replace(d, a, b), c, c2);
  execute n;
end $mig$;
