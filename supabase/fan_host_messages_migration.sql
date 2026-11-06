-- ============================================================
-- Migration: fans message the host, inside Show Pilot (job 235)
-- ============================================================
--
-- Countdown emails end with "Have info or a question? Message the host",
-- which opens the fan's sky with a private message box. Messages are stored
-- per event and show under that event's Guests tab for the owner, newest
-- first, with the fan's name and email so the owner can reply. Nothing goes
-- to the showpilot.team inbox. Fans can't see each other's messages.
--
-- Limits: 1000 characters, 5 messages per fan per event per day.
-- Same access model as the rest of the fan side: no table policies,
-- SECURITY DEFINER functions with their own checks.

create table if not exists public.fan_host_messages (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  rsvp_id uuid not null references public.fan_rsvps(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists fan_host_messages_show_idx on public.fan_host_messages (show_id, created_at desc);
alter table public.fan_host_messages enable row level security;
revoke all on public.fan_host_messages from anon, authenticated;

-- Fan: send a message to the host.
create or replace function public.send_host_message(p_token uuid, p_key uuid, p_message text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.shows;
  v_rsvp uuid;
  v_msg text := btrim(coalesce(p_message, ''));
begin
  select * into s from public.shows where fan_token = p_token;
  if s.id is null or s.fan_page_enabled is not true or coalesce(s.archived, false) then
    raise exception 'This event is closed';
  end if;
  select id into v_rsvp from public.fan_rsvps where show_id = s.id and sky_key = p_key;
  if v_rsvp is null then
    raise exception 'This key does not open this sky';
  end if;
  if v_msg = '' then
    raise exception 'Write a message first';
  end if;
  if (select count(*) from public.fan_host_messages
      where rsvp_id = v_rsvp and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'You''ve sent 5 messages today. Try again tomorrow.';
  end if;
  insert into public.fan_host_messages (show_id, rsvp_id, message) values (s.id, v_rsvp, left(v_msg, 1000));
  return true;
end;
$function$;

revoke all on function public.send_host_message(uuid, uuid, text) from public;
grant execute on function public.send_host_message(uuid, uuid, text) to anon, authenticated;

-- Owner: the event's messages, newest first.
create or replace function public.get_host_messages(p_show_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when not exists (select 1 from public.shows where id = p_show_id and owner_id = auth.uid()) then null else
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', m.id, 'message', m.message, 'at', m.created_at, 'read', m.read_at is not null,
          'name', r.name, 'email', r.email, 'guests', r.guests
        ) order by m.created_at desc)
      from public.fan_host_messages m join public.fan_rsvps r on r.id = m.rsvp_id
      where m.show_id = p_show_id
    ), '[]'::jsonb) end;
$function$;

revoke all on function public.get_host_messages(uuid) from public, anon;
grant execute on function public.get_host_messages(uuid) to authenticated;

-- Owner: mark the event's messages read (all of them, once seen).
create or replace function public.mark_host_messages_read(p_show_id uuid)
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  with done as (
    update public.fan_host_messages m set read_at = now()
    from public.shows s
    where m.show_id = p_show_id and s.id = m.show_id and s.owner_id = auth.uid() and m.read_at is null
    returning 1
  )
  select count(*)::int from done;
$function$;

revoke all on function public.mark_host_messages_read(uuid) from public, anon;
grant execute on function public.mark_host_messages_read(uuid) to authenticated;
