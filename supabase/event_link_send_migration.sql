-- Send the event link email from Show Pilot (job 183, 2026-10-27).
--
-- The venue taps Send on the Event link; the edge function
-- send-event-link-email mails each act through Resend, from
-- "<Venue> via Show Pilot", with replies going to the venue. This keeps the
-- record of what was sent and the addresses never to mail again.
--
-- 1. event_link_sends: one row per email sent (or skipped / failed). Only
--    the edge function writes it (service role); the venue side reads its
--    own event's rows through get_event_link_sends.
-- 2. email_suppressions: addresses that bounced, complained or asked to
--    stop. The edge function skips them. (A Resend webhook will fill it
--    later; for now rows can be added by hand.)
-- 3. get_event_link_sends(show): the event's sends, newest first, for the
--    venue side and the owner (same check as get_event_link_admin).
-- Safe to run more than once.

create table if not exists public.event_link_sends (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.event_links(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  sent_by uuid not null,
  to_email text not null,
  subject text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  error text,
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists event_link_sends_show_idx on public.event_link_sends (show_id, created_at desc);
create index if not exists event_link_sends_sender_idx on public.event_link_sends (sent_by, created_at desc);
alter table public.event_link_sends enable row level security;
revoke all on public.event_link_sends from anon, authenticated;

create table if not exists public.email_suppressions (
  email text primary key,
  reason text not null default 'manual',
  created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from anon, authenticated;

create or replace function public.get_event_link_sends(p_show uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_access jsonb := public.biz_access(p_show);
begin
  if v_access is null or not coalesce((v_access->>'venue')::boolean, false) and not coalesce((v_access->>'is_owner')::boolean, false) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'to_email', s.to_email, 'status', s.status, 'error', s.error,
      'created_at', s.created_at, 'sent_at', s.sent_at
    ) order by s.created_at desc)
    from (select * from public.event_link_sends where show_id = p_show order by created_at desc limit 200) s
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_event_link_sends(uuid) from public;
grant execute on function public.get_event_link_sends(uuid) to authenticated;
