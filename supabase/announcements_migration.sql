-- Announcements and time changes (job 73, "On the road" stage 2, 2026-11-05).
--
-- One message to everyone on an event (or on all your upcoming events):
-- "Bus call moved to 9:30". It stays pinned on each person's Needs me until
-- they tap Got it, and the sender sees how many have seen it.
--
-- Time changes are made automatically: when a time on the venue's schedule
-- or an act's set time changes on an upcoming event, everyone on it gets
-- "Doors 7:00 -> 7:30". Edits by the same person to the same time within 10
-- minutes fold into one change (no alert per keystroke), and a time put back
-- to what it was removes the alert.
--
-- "On the event" = the owner, everyone who accepted an invite, and everyone
-- who saved the event to their lists (linked_gigs).

create table if not exists public.event_announcements (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  author_id uuid,
  author_name text,
  kind text not null default 'note' check (kind in ('note', 'time_change')),
  body text not null default '',
  label text,
  from_time text,
  to_time text,
  created_at timestamptz not null default now()
);
create index if not exists event_announcements_show_idx on public.event_announcements (show_id, created_at desc);

create table if not exists public.event_announcement_reads (
  announcement_id uuid not null references public.event_announcements(id) on delete cascade,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- Read and written only through the functions below.
alter table public.event_announcements enable row level security;
alter table public.event_announcement_reads enable row level security;

create or replace function public.gig_member_ids(p_show_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select owner_id from public.shows where id = p_show_id and owner_id is not null
  union
  select accepted_by from public.gig_invites where show_id = p_show_id and status = 'accepted' and accepted_by is not null
  union
  select user_id from public.linked_gigs where show_id = p_show_id;
$function$;

create or replace function public.my_display_name()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(nullif(trim(display_name), ''), 'Someone') from public.user_preferences where user_id = auth.uid()
  union all select 'Someone' limit 1;
$function$;

-- Send one message to each of these events (tokens). Returns how many it went to.
create or replace function public.post_announcement(p_tokens uuid[], p_body text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_body text := left(trim(coalesce(p_body, '')), 500);
  v_name text;
  v_show record;
  v_id uuid;
  v_n integer := 0;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if v_body = '' then raise exception 'Write a message first'; end if;
  v_name := public.my_display_name();
  for v_show in select id from public.shows where share_token = any(coalesce(p_tokens, '{}')) loop
    if not exists (select 1 from public.gig_member_ids(v_show.id) m where m = v_uid) then
      raise exception 'You are not on one of those events';
    end if;
    insert into public.event_announcements (show_id, author_id, author_name, kind, body)
      values (v_show.id, v_uid, v_name, 'note', v_body) returning id into v_id;
    insert into public.event_announcement_reads (announcement_id, user_id) values (v_id, v_uid);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

create or replace function public.mark_announcement_seen(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_show uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select show_id into v_show from public.event_announcements where id = p_id;
  if v_show is null then return; end if;
  if not exists (select 1 from public.gig_member_ids(v_show) m where m = v_uid) then return; end if;
  insert into public.event_announcement_reads (announcement_id, user_id) values (p_id, v_uid)
    on conflict do nothing;
end;
$function$;

-- What Needs me shows: everything not yet seen on your events (last 14
-- days), plus what you sent in the last 3 days with how many have seen it.
create or replace function public.get_my_announcements()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with mine as (
    select s.id, s.share_token, s.date, coalesce(nullif(s.event_name, ''), nullif(s.band_name, ''), s.venue, 'Event') as title
    from public.shows s
    where auth.uid() is not null
      and (s.owner_id = auth.uid()
        or exists (select 1 from public.gig_invites i where i.show_id = s.id and i.status = 'accepted' and i.accepted_by = auth.uid())
        or exists (select 1 from public.linked_gigs l where l.show_id = s.id and l.user_id = auth.uid()))
  ),
  rows as (
    select a.*, m.share_token, m.date as event_date, m.title as event_title,
      (a.author_id = auth.uid()) as is_mine,
      exists (select 1 from public.event_announcement_reads r where r.announcement_id = a.id and r.user_id = auth.uid()) as seen,
      (select count(*) from public.event_announcement_reads r where r.announcement_id = a.id and r.user_id is distinct from a.author_id) as seen_count,
      (select count(*) from public.gig_member_ids(a.show_id) x where x is distinct from a.author_id) as member_count
    from public.event_announcements a
    join mine m on m.id = a.show_id
    where a.created_at > now() - interval '14 days'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'body', body, 'label', label, 'from_time', from_time, 'to_time', to_time,
      'created_at', created_at, 'author_name', author_name, 'mine', is_mine, 'seen', seen,
      'seen_count', seen_count, 'member_count', member_count,
      'share_token', share_token, 'event_date', event_date, 'event_title', event_title)
    order by created_at desc), '[]'::jsonb)
  from rows
  where (not is_mine and not seen) or (is_mine and kind = 'note' and created_at > now() - interval '3 days');
$function$;

-- Time changes: compare the schedule and set times before and after a save.
create or replace function public.announce_time_changes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_old jsonb;
  v_new jsonb;
  r record;
  v_existing record;
begin
  if new.date is not null and new.date < current_date then return new; end if;

  -- Venue schedule rows, matched by id (or label when a row has no id).
  v_old := '{}'::jsonb; v_new := '{}'::jsonb;
  select coalesce(jsonb_object_agg(coalesce(e->>'id', 'l:' || lower(e->>'label')), jsonb_build_object('label', e->>'label', 'time', e->>'time')), '{}'::jsonb)
    into v_old from jsonb_array_elements(case when jsonb_typeof(old.venue_info->'schedule') = 'array' then old.venue_info->'schedule' else '[]'::jsonb end) e;
  select coalesce(jsonb_object_agg(coalesce(e->>'id', 'l:' || lower(e->>'label')), jsonb_build_object('label', e->>'label', 'time', e->>'time')), '{}'::jsonb)
    into v_new from jsonb_array_elements(case when jsonb_typeof(new.venue_info->'schedule') = 'array' then new.venue_info->'schedule' else '[]'::jsonb end) e;
  -- Act set times (manager_info.set_times: { "Act": "9:15 PM" }).
  select v_old || coalesce(jsonb_object_agg('set:' || key, jsonb_build_object('label', key || ' set', 'time', value)), '{}'::jsonb)
    into v_old from jsonb_each_text(case when jsonb_typeof(old.manager_info->'set_times') = 'object' then old.manager_info->'set_times' else '{}'::jsonb end);
  select v_new || coalesce(jsonb_object_agg('set:' || key, jsonb_build_object('label', key || ' set', 'time', value)), '{}'::jsonb)
    into v_new from jsonb_each_text(case when jsonb_typeof(new.manager_info->'set_times') = 'object' then new.manager_info->'set_times' else '{}'::jsonb end);

  for r in
    select o.value->>'label' as label, trim(o.value->>'time') as from_time, trim(n.value->>'time') as to_time
    from jsonb_each(v_old) o join jsonb_each(v_new) n on n.key = o.key
    where coalesce(trim(o.value->>'time'), '') <> '' and coalesce(trim(n.value->>'time'), '') <> ''
      and lower(trim(o.value->>'time')) <> lower(trim(n.value->>'time'))
  loop
    if v_name is null then v_name := coalesce(public.my_display_name(), 'Someone'); end if;
    select * into v_existing from public.event_announcements
      where show_id = new.id and kind = 'time_change' and label is not distinct from r.label
        and author_id is not distinct from v_uid and created_at > now() - interval '10 minutes'
      order by created_at desc limit 1;
    if v_existing.id is not null then
      if lower(v_existing.from_time) = lower(r.to_time) then
        delete from public.event_announcements where id = v_existing.id;
      else
        update public.event_announcements set to_time = r.to_time, created_at = now() where id = v_existing.id;
        delete from public.event_announcement_reads where announcement_id = v_existing.id and user_id is distinct from v_uid;
      end if;
    else
      insert into public.event_announcements (show_id, author_id, author_name, kind, label, from_time, to_time)
        values (new.id, v_uid, v_name, 'time_change', r.label, r.from_time, r.to_time);
    end if;
  end loop;
  return new;
end;
$function$;

drop trigger if exists announce_time_changes on public.shows;
create trigger announce_time_changes
  after update of venue_info, manager_info on public.shows
  for each row
  when (old.venue_info is distinct from new.venue_info or old.manager_info is distinct from new.manager_info)
  execute function public.announce_time_changes();

revoke all on function public.gig_member_ids(uuid) from public, anon;
revoke all on function public.post_announcement(uuid[], text) from public, anon;
revoke all on function public.mark_announcement_seen(uuid) from public, anon;
revoke all on function public.get_my_announcements() from public, anon;
grant execute on function public.post_announcement(uuid[], text) to authenticated;
grant execute on function public.mark_announcement_seen(uuid) to authenticated;
grant execute on function public.get_my_announcements() to authenticated;
