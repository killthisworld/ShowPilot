-- ============================================================
-- Migration: company phone layout (Needs me home + quick-add)
-- Run this in Supabase SQL Editor AFTER schema.sql, gig_tasks_migration.sql
-- and the other migrations already applied. Safe to run more than once.
-- ============================================================
--
-- What it adds, all additive:
--   1. gig_tasks.due_date - optional due date, set from the phone quick-add.
--   2. add_gig_task(..., p_due_date) - same as before plus the optional due
--      date. Existing 3-argument calls (Gig Web's Tasks tab) keep working.
--   3. conversation_reads + mark_conversation_read - "read up to" per person
--      per chat, so the phone can count unread messages.
--   4. get_needs_me() - one call for the Needs me home: open tasks on my
--      sections, recent changes on my events, and my chats with unread counts.
--
-- Access model matches the rest of the app: new table has RLS on with no
-- policies, every read/write goes through SECURITY DEFINER functions that do
-- their own checks.

-- 1. Due dates ------------------------------------------------------------
alter table public.gig_tasks add column if not exists due_date date;

-- 2. add_gig_task with an optional due date ------------------------------
-- Dropped and recreated (not overloaded) so a 3-argument call can't be
-- ambiguous between two versions.
drop function if exists public.add_gig_task(uuid, text, text);

create or replace function public.add_gig_task(p_token uuid, p_section text, p_title text, p_due_date date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_section text;
  v_new_row public.gig_tasks;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Gig not found';
  end if;

  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  if auth.uid() <> v_show.owner_id then
    raise exception 'Only the gig owner can add tasks';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'Task needs a title';
  end if;

  v_section := case when p_section = 'lighting' then 'engineer' else p_section end;

  insert into public.gig_tasks (show_id, section, title, created_by, sort_order, due_date)
  values (
    v_show.id, v_section, btrim(p_title), auth.uid(),
    (select coalesce(max(sort_order), -1) + 1 from public.gig_tasks where show_id = v_show.id and section = v_section),
    p_due_date
  )
  returning * into v_new_row;

  return to_jsonb(v_new_row);
end;
$function$;

grant execute on function public.add_gig_task(uuid, text, text, date) to authenticated;

-- 3. Chat read receipts ---------------------------------------------------
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamp with time zone not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_reads enable row level security;

-- Called when someone has a chat open (on load and as messages arrive).
-- Quietly does nothing for a chat the caller isn't in.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not public.is_conversation_participant(p_conversation_id) then
    return;
  end if;

  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation_id, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$function$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- 4. Needs me -------------------------------------------------------------
-- "My events" = events I own, hold an accepted role on, or have linked.
-- "My sections" on an event = my own profile's section on events I own
-- (Artist counts as manager), plus any role I accepted or section I was
-- granted. Tasks that "need me" are open tasks in those sections.
create or replace function public.get_needs_me()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_home_section text;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Must be signed in';
  end if;

  select case up.account_type
      when 'band' then 'manager'
      when 'manager' then 'manager'
      when 'venue' then 'venue'
      when 'promoter' then 'promoter'
      when 'booking_agent' then 'booking_agent'
      when 'engineer' then 'engineer'
      when 'lighting' then 'engineer'
      else null end
    into v_home_section
  from public.user_preferences up
  where up.user_id = v_uid;

  with my_shows as (
    select s.id, s.share_token, coalesce(nullif(s.event_name, ''), s.band_name) as title,
      s.venue, s.date, s.updated_at, (s.owner_id = v_uid) as is_owner
    from public.shows s
    where s.archived = false and (
      s.owner_id = v_uid
      or exists (select 1 from public.gig_invites gi where gi.show_id = s.id and gi.status = 'accepted' and gi.accepted_by = v_uid)
      or exists (select 1 from public.linked_gigs lg where lg.share_token = s.share_token and lg.user_id = v_uid and lg.archived = false)
    )
  ),
  my_sections as (
    select ms.id as show_id, v_home_section as section
    from my_shows ms
    where ms.is_owner and v_home_section is not null
    union
    select gi.show_id, case when gi.invited_role = 'lighting' then 'engineer' else gi.invited_role end
    from public.gig_invites gi
    join my_shows ms on ms.id = gi.show_id
    where gi.status = 'accepted' and gi.accepted_by = v_uid
    union
    select gi.show_id, unnest(coalesce(gi.granted_sections, '{}'::text[]))
    from public.gig_invites gi
    join my_shows ms on ms.id = gi.show_id
    where gi.status = 'accepted' and gi.accepted_by = v_uid
  )
  select jsonb_build_object(
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', t.id, 'title', t.title, 'section', t.section, 'due_date', t.due_date,
          'created_at', t.created_at, 'show_id', ms.id, 'share_token', ms.share_token,
          'event_title', ms.title, 'event_date', ms.date, 'venue', ms.venue
        ) order by t.due_date nulls last, ms.date nulls last, t.created_at)
      from public.gig_tasks t
      join my_shows ms on ms.id = t.show_id
      where t.status = 'open'
        and exists (select 1 from my_sections x where x.show_id = t.show_id and x.section = t.section)
    ), '[]'::jsonb),

    'changes', coalesce((
      select jsonb_agg(c order by c->>'at' desc)
      from (
        -- Events someone else owns that were edited in the last 3 days.
        select jsonb_build_object(
            'kind', 'event_updated', 'key', 'ev:' || ms.id || ':' || extract(epoch from ms.updated_at)::bigint,
            'at', ms.updated_at, 'show_id', ms.id, 'share_token', ms.share_token,
            'event_title', ms.title, 'event_date', ms.date, 'venue', ms.venue
          ) as c
        from my_shows ms
        where not ms.is_owner and ms.updated_at > now() - interval '3 days'
        union all
        -- Tasks someone else finished on my events in the last 3 days.
        select jsonb_build_object(
            'kind', 'task_done', 'key', 'td:' || t.id,
            'at', t.completed_at, 'show_id', ms.id, 'share_token', ms.share_token,
            'event_title', ms.title, 'event_date', ms.date, 'venue', ms.venue,
            'task_title', t.title, 'section', t.section, 'by_name', up.display_name
          )
        from public.gig_tasks t
        join my_shows ms on ms.id = t.show_id
        left join public.user_preferences up on up.user_id = t.completed_by
        where ms.is_owner and t.status = 'done' and t.completed_by is distinct from v_uid
          and t.completed_at > now() - interval '3 days'
      ) x
    ), '[]'::jsonb),

    'chats', coalesce((
      select jsonb_agg(ch order by (ch->>'last_at') desc)
      from (
        select jsonb_build_object(
            'id', c.id, 'kind', c.kind, 'section', c.section,
            'show_id', s.id, 'share_token', s.share_token,
            'event_title', coalesce(nullif(s.event_name, ''), s.band_name), 'event_date', s.date,
            'unread', (
              select count(*) from public.messages m
              where m.conversation_id = c.id and m.sender_id <> v_uid
                and m.created_at > coalesce(cr.last_read_at, cp.joined_at)
            ),
            'last_body', lm.body, 'last_at', lm.created_at,
            'last_sender_name', case when lm.sender_id = v_uid then 'You' else lsp.display_name end,
            'other_name', (
              select op.display_name
              from public.conversation_participants o
              left join public.user_preferences op on op.user_id = o.user_id
              where c.kind = 'direct' and o.conversation_id = c.id and o.user_id <> v_uid
              limit 1
            )
          ) as ch
        from public.conversation_participants cp
        join public.conversations c on c.id = cp.conversation_id
        join public.shows s on s.id = c.show_id
        left join public.conversation_reads cr on cr.conversation_id = c.id and cr.user_id = v_uid
        join lateral (
          select m.body, m.created_at, m.sender_id from public.messages m
          where m.conversation_id = c.id
          order by m.created_at desc
          limit 1
        ) lm on true
        left join public.user_preferences lsp on lsp.user_id = lm.sender_id
        where cp.user_id = v_uid and s.archived = false
        order by lm.created_at desc
        limit 40
      ) y
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.get_needs_me() to authenticated;
