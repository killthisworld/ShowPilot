-- DJ date requests, round 2 (job 466, 2026-11-22): Hold is an answer, and a
-- held or confirmed request gets a chat between the DJ and the promoter.
-- The promoter has no account: they chat from a private link (/r/<chat_token>)
-- that's in the hold / confirmation email. The DJ chats from Chats > In
-- progress / Confirmed. Messages are written by the dj-request-chat edge
-- function (which also emails the other side); reads below.
--
-- Needs dj_requests_reply_migration.sql (job 465) first.

alter table public.dj_date_requests
  add column if not exists chat_token text unique,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_sender text,
  add column if not exists dj_seen_at timestamptz,
  add column if not exists promoter_seen_at timestamptz,
  add column if not exists dj_notified_at timestamptz,
  add column if not exists promoter_notified_at timestamptz;

create table if not exists public.dj_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.dj_date_requests(id) on delete cascade,
  sender text not null check (sender in ('dj', 'promoter')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists dj_request_messages_request on public.dj_request_messages (request_id, created_at);

alter table public.dj_request_messages enable row level security;
drop policy if exists "DJs read their request chats" on public.dj_request_messages;
create policy "DJs read their request chats" on public.dj_request_messages
  for select using (exists (
    select 1 from public.dj_date_requests r where r.id = request_id and r.owner_id = (select auth.uid())
  ));
-- No insert policy: messages come in through the dj-request-chat function.

-- The promoter's side of the chat, by its private link. Marks it seen.
create or replace function public.get_dj_request_chat(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.dj_date_requests%rowtype;
  t record;
begin
  if length(coalesce(p_token, '')) < 24 then return null; end if;
  select * into r from public.dj_date_requests where chat_token = p_token;
  if not found or r.status not in ('hold', 'accepted') then return null; end if;
  update public.dj_date_requests set promoter_seen_at = now() where id = r.id;
  select st.name, st.data into t from public.dj_press_kits k join public.saved_templates st on st.id = k.template_id where k.owner_id = r.owner_id;
  return jsonb_build_object(
    'status', r.status,
    'date', r.date,
    'event_name', r.event_name,
    'venue', r.venue,
    'city', r.city,
    'set_time', r.set_time,
    'name', r.name,
    'dj_name', coalesce(nullif(t.name, ''), 'The DJ'),
    'dj_photo', t.data->>'photo_url',
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'at', m.created_at) order by m.created_at)
      from (select * from public.dj_request_messages where request_id = r.id order by created_at desc limit 300) m
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.get_dj_request_chat(text) from public;
grant execute on function public.get_dj_request_chat(text) to anon, authenticated;

-- How many request chats have a new message from the promoter (the DJ's badge).
create or replace function public.dj_request_chat_unread() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.dj_date_requests r
  where r.owner_id = auth.uid() and r.status in ('hold', 'accepted')
    and r.last_sender = 'promoter' and (r.dj_seen_at is null or r.last_message_at > r.dj_seen_at);
$$;
revoke all on function public.dj_request_chat_unread() from public, anon;
grant execute on function public.dj_request_chat_unread() to authenticated;

-- The Sets card's Event button (job 466): the event's Show Pilot event link
-- (/v/<code>), only for someone on that event (its owner, linked to it, or
-- the DJ whose set request is for it). Null when there's no link.
create or replace function public.dj_event_link_code(p_show uuid) returns text
language sql stable security definer set search_path = public as $$
  select l.code from public.event_links l
  where l.show_id = p_show and auth.uid() is not null
    and (
      exists (select 1 from public.shows s where s.id = p_show and s.owner_id = auth.uid())
      or exists (select 1 from public.linked_gigs g where g.show_id = p_show and g.user_id = auth.uid())
      or exists (select 1 from public.dj_set_requests q where q.show_id = p_show and q.owner_id = auth.uid())
    )
  limit 1;
$$;
revoke all on function public.dj_event_link_code(uuid) from public, anon;
grant execute on function public.dj_event_link_code(uuid) to authenticated;
