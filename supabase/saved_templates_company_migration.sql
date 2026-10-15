-- Templates for every profile (job 75, 2026-10-15).
-- saved_templates only allowed 'venue' and 'artist'. Company profiles now
-- keep templates for their own event sections too: promoter, booking agent
-- and manager / artist (venue already fits). Owner-only RLS policies on the
-- table are unchanged.

alter table public.saved_templates drop constraint if exists saved_templates_category_check;
alter table public.saved_templates
  add constraint saved_templates_category_check
  check (category in ('venue', 'artist', 'promoter', 'booking_agent', 'manager'));
