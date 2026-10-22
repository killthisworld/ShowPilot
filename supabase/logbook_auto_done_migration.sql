-- Logbook: events are marked done once their date has passed (job 131,
-- 2026-10-21). Until now only the tech Home did this (when it loaded) and
-- company accounts only when the wrap-up animation finished, so some past
-- events never reached the Logbook. The app's Logbook now goes by the date
-- too; this keeps the stored `done` flag in step for everything else.
--
-- 1. mark_past_shows_done(): sets done = true on every event dated before
--    today (any owner). Archived events are included; they still belong in
--    the history.
-- 2. Runs once now, then every night at 09:10 UTC (5:10 AM Eastern) with
--    pg_cron (the same scheduler the fan countdown uses).
-- Safe to run more than once.

create or replace function public.mark_past_shows_done()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  update public.shows
     set done = true
   where date is not null
     and date < current_date
     and coalesce(done, false) = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Only the scheduler (and the SQL Editor) runs it.
revoke all on function public.mark_past_shows_done() from public, anon, authenticated;

-- Catch up the events that are already past.
select public.mark_past_shows_done();

-- Nightly (replaces itself if run again).
select cron.unschedule(jobid) from cron.job where jobname = 'logbook-auto-done';
select cron.schedule(
  'logbook-auto-done',
  '10 9 * * *',
  $job$ select public.mark_past_shows_done(); $job$
);
