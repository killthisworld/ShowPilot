-- Pause the weekly "new shows near you" email (job 110).
-- The fan side is switched off for launch (src/lib/hiddenProfiles.js,
-- FAN_SIDE_OPEN = false), so no new fan accounts exist to receive it.
-- Only the schedule is removed: the fan-weekly-digest function, its tables
-- and every fan's settings stay. To bring it back, run the cron.schedule
-- block at the end of supabase/fan_digest_migration.sql again.
-- The countdown schedule (fan-countdown) is untouched: it emails RSVPs.
-- Safe to run more than once.

select cron.unschedule(jobid) from cron.job where jobname = 'fan-weekly-digest';
