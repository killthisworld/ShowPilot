-- ============================================================
-- Migration: deleting an event works again (job 172)
-- ============================================================
--
-- Bug (2026-10-26): deleting an event failed on phone and desktop with
--   insert or update on table "gig_activity" violates foreign key
--   constraint "gig_activity_show_id_fkey"
-- Deleting a show cascades to its show_bands rows; the AFTER DELETE trigger
-- on show_bands (job 143's change log) then logged "lineup changed" for the
-- show that was being deleted, and that row's show_id no longer exists.
--
-- Fix: only log for shows that still exist. Removing one act from an event
-- is still logged as before.

create or replace function public.show_bands_activity_del_trigger()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_show uuid;
begin
  for v_show in
    select distinct o.show_id from old_rows o
    where exists (select 1 from public.shows s where s.id = o.show_id)
  loop
    perform public.log_gig_activity(v_show, 'manager', array['lineup']);
  end loop;
  return null;
end; $function$;
