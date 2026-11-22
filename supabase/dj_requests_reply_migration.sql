-- DJ date requests get answered (job 465, 2026-11-22): Bookings > Requests,
-- Accept (the night becomes one of the DJ's gigs and the promoter gets a
-- confirmation email) or Decline (the DJ's message goes to the promoter).
-- The dj-request-reply edge function does both; this adds what it records.
--
-- Needs dj_press_kit_v2_migration.sql (job 459) first.

alter table public.dj_date_requests
  add column if not exists show_id uuid references public.shows(id) on delete set null,
  add column if not exists reply text not null default '',
  add column if not exists replied_at timestamptz,
  add column if not exists reply_emailed boolean not null default false;

alter table public.dj_date_requests drop constraint if exists dj_date_requests_status_check;
alter table public.dj_date_requests add constraint dj_date_requests_status_check
  check (status in ('new', 'hold', 'accepted', 'declined'));
