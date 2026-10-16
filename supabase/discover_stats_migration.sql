-- Local shows stats (job 92): how a listed event does in Discover.
-- One row per fan, per event, per kind, per day:
--   seen    the fan landed on the event's card in Discover
--   tapped  the fan tapped through to the fan page (Get tickets / RSVP)
-- Hosts only ever get counts (get_discover_stats); nobody can read the rows.
-- Safe to run more than once.

create table if not exists public.discover_hits (
  show_id uuid not null references public.shows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('seen', 'tapped')),
  day date not null default current_date,
  primary key (show_id, user_id, kind, day)
);
alter table public.discover_hits enable row level security;
-- No policies: rows are written and read only through the functions below.

-- Called by the fan app. Takes the show_key values Discover hands out
-- (md5 of the show id) and only counts events that are still listed.
create or replace function public.log_discover_hits(p_keys text[], p_kind text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.discover_hits (show_id, user_id, kind)
  select s.id, auth.uid(), p_kind
  from public.shows s
  where auth.uid() is not null
    and p_kind in ('seen', 'tapped')
    and coalesce(array_length(p_keys, 1), 0) between 1 and 50
    and md5(s.id::text) = any (p_keys)
    and s.fan_page_enabled is true
    and s.fan_page->>'discover' = 'true'
  on conflict do nothing;
$$;
revoke all on function public.log_discover_hits(text[], text) from public, anon;
grant execute on function public.log_discover_hits(text[], text) to authenticated;

-- Called by the event owner's fan page editor. Unique fans, all time and
-- the last 7 days. Returns null for anyone who doesn't own the event.
create or replace function public.get_discover_stats(p_show_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not exists (select 1 from public.shows where id = p_show_id and owner_id = auth.uid()) then null else
    jsonb_build_object(
      'seen', (select count(distinct user_id) from public.discover_hits where show_id = p_show_id and kind = 'seen'),
      'tapped', (select count(distinct user_id) from public.discover_hits where show_id = p_show_id and kind = 'tapped'),
      'seen_7d', (select count(distinct user_id) from public.discover_hits where show_id = p_show_id and kind = 'seen' and day > current_date - 7),
      'tapped_7d', (select count(distinct user_id) from public.discover_hits where show_id = p_show_id and kind = 'tapped' and day > current_date - 7)
    ) end;
$$;
revoke all on function public.get_discover_stats(uuid) from public, anon;
grant execute on function public.get_discover_stats(uuid) to authenticated;
