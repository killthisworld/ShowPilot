-- ============================================================
-- Migration: fan messages in the Chats page (job 236)
-- ============================================================
--
-- One row per event you own that has messages from fans (job 235): the
-- newest message, who sent it, how many are unread and in total. The Chats
-- page lists these under FANS; opening one shows that event's messages
-- (get_host_messages) and marks them read (mark_host_messages_read).

create or replace function public.get_fan_message_threads()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(t order by (t->>'unread')::int > 0 desc, t->>'last_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'show_id', s.id,
      'share_token', s.share_token,
      'event_name', s.event_name,
      'band_name', s.band_name,
      'date', s.date,
      'venue', s.venue,
      'event_type', s.event_type,
      'last_message', last.message,
      'last_name', last.name,
      'last_at', last.created_at,
      'unread', (select count(*) from public.fan_host_messages m where m.show_id = s.id and m.read_at is null),
      'total', (select count(*) from public.fan_host_messages m where m.show_id = s.id)
    ) as t
    from public.shows s
    cross join lateral (
      select m.message, m.created_at, r.name
      from public.fan_host_messages m join public.fan_rsvps r on r.id = m.rsvp_id
      where m.show_id = s.id
      order by m.created_at desc limit 1
    ) last
    where auth.uid() is not null and s.owner_id = auth.uid() and coalesce(s.archived, false) = false
  ) x;
$function$;

revoke all on function public.get_fan_message_threads() from public, anon;
grant execute on function public.get_fan_message_threads() to authenticated;
