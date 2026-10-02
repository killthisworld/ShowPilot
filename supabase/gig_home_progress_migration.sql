-- ============================================================
-- Migration: per-show completion summary for Home's list view
-- Run this in Supabase SQL Editor AFTER schema.sql and the other
-- migrations already applied.
-- ============================================================
--
-- Why this exists: BandHome's "Your Shows" list wants a small per-row
-- indicator of how close to done each upcoming gig is - a ring for
-- roles confirmed out of the gig's total applicable roles, plus a
-- flag when there are open to-dos on the board. get_gigs_progress
-- already answers a related but different question ("how filled in
-- is each role's section data"); this answers "has that role
-- actually been claimed" (from gig_invites) and "are there open
-- tasks" (from gig_tasks) - both bulk, by an array of show ids, same
-- calling convention as get_gigs_progress, so BandHome can fetch
-- every visible show's summary in one round trip instead of one
-- query per row.
create or replace function public.get_gigs_home_progress(p_show_ids uuid[])
returns table(show_id uuid, confirmed_roles int, total_roles int, open_tasks int)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with totals as (
    select s.id as show_id,
      coalesce(array_length(s.included_sections, 1), 5) as total_roles
    from public.shows s
    where s.id = any(p_show_ids)
  ),
  claimed as (
    -- Audio and Lighting are two separate invited_role values that
    -- share one included_sections slot ('engineer') - normalize
    -- before counting distinct roles so a claimed 'lighting' invite
    -- doesn't push the ring past the gig's actual total.
    select gi.show_id,
      count(distinct (case when gi.invited_role = 'lighting' then 'engineer' else gi.invited_role end)) as confirmed_roles
    from public.gig_invites gi
    where gi.show_id = any(p_show_ids) and gi.status = 'accepted'
    group by gi.show_id
  ),
  open_tasks as (
    select gt.show_id, count(*) as open_tasks
    from public.gig_tasks gt
    where gt.show_id = any(p_show_ids) and gt.status = 'open'
    group by gt.show_id
  )
  select
    t.show_id,
    least(coalesce(c.confirmed_roles, 0), t.total_roles) as confirmed_roles,
    t.total_roles,
    coalesce(o.open_tasks, 0) as open_tasks
  from totals t
  left join claimed c on c.show_id = t.show_id
  left join open_tasks o on o.show_id = t.show_id;
$function$;

grant execute on function public.get_gigs_home_progress(uuid[]) to anon, authenticated;
