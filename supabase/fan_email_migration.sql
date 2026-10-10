-- Fan "email me the event info" signups.
--
-- A fan on the public event page (/e/:token) can leave an email address and
-- get ONE email with the event details (date, doors, venue, map, ticket link).
-- Rows are written only by the send-fan-event-email edge function, which uses
-- the service role. No one else (anon or signed-in) can read or write this
-- table directly, so fan addresses never leak through the public API.
--
-- One row per (show, email): the unique index is what makes the email
-- one-time. Submitting the same address again for the same show sends nothing.

create table if not exists public.fan_email_signups (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid not null references public.shows(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,          -- set once Resend accepts the email
  last_error  text                  -- why the last send attempt failed, if it did
);

create unique index if not exists fan_email_signups_show_email_key
  on public.fan_email_signups (show_id, lower(email));

create index if not exists fan_email_signups_show_created_idx
  on public.fan_email_signups (show_id, created_at desc);

alter table public.fan_email_signups enable row level security;
-- Deliberately no policies: only the service role (edge function) touches it.
revoke all on public.fan_email_signups from anon, authenticated;
