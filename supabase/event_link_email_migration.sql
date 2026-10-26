-- Venue's email template for the event link (job 176, 2026-10-26).
-- One template per account ({ subject, body } with {event}, {date},
-- {venue}, {link}, {name} placeholders). When the venue taps Email it, the
-- template is filled in for that event with its link. Stored on the
-- account's own user_preferences row (existing RLS: you edit only yours).
-- Safe to run more than once.
alter table public.user_preferences add column if not exists event_link_email jsonb;
