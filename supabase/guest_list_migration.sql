-- Guest list (job 73, "On the road" stage 3, 2026-11-10).
--
-- One list per event. Anyone on the event (owner, accepted invites, people
-- who saved it: gig_member_ids, from the announcements migration) can see
-- it, add names, and check people in at the door. A name can be removed by
-- whoever added it or by the event's owner.

create table if not exists public.event_guests (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  name text not null,
  plus_ones integer not null default 0 check (plus_ones between 0 and 20),
  note text,
  added_by uuid,
  added_by_name text,
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_guests_show_idx on public.event_guests (show_id, name);

-- Read and written only through the functions below.
alter table public.event_guests enable row level security;

create or replace function public.get_guest_list(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
begin
  select id, owner_id into v_show from public.shows where share_token = p_token;
  if v_show is null or auth.uid() is null
     or not exists (select 1 from public.gig_member_ids(v_show.id) m where m = auth.uid()) then
    raise exception 'Not on this event';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'plus_ones', g.plus_ones, 'note', g.note,
      'added_by_name', g.added_by_name, 'checked_in_at', g.checked_in_at,
      'can_remove', (g.added_by = auth.uid() or v_show.owner_id = auth.uid()))
      order by lower(g.name))
    from public.event_guests g where g.show_id = v_show.id), '[]'::jsonb);
end;
$function$;

create or replace function public.add_guest(p_token uuid, p_name text, p_plus integer default 0, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show uuid;
  v_name text := left(trim(coalesce(p_name, '')), 120);
  v_id uuid;
begin
  select id into v_show from public.shows where share_token = p_token;
  if v_show is null or auth.uid() is null
     or not exists (select 1 from public.gig_member_ids(v_show) m where m = auth.uid()) then
    raise exception 'Not on this event';
  end if;
  if v_name = '' then raise exception 'Add a name'; end if;
  insert into public.event_guests (show_id, name, plus_ones, note, added_by, added_by_name)
    values (v_show, v_name, greatest(0, least(coalesce(p_plus, 0), 20)), nullif(left(trim(coalesce(p_note, '')), 120), ''),
            auth.uid(), public.my_display_name())
    returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.check_in_guest(p_id uuid, p_in boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show uuid;
begin
  select show_id into v_show from public.event_guests where id = p_id;
  if v_show is null or auth.uid() is null
     or not exists (select 1 from public.gig_member_ids(v_show) m where m = auth.uid()) then
    raise exception 'Not on this event';
  end if;
  update public.event_guests set checked_in_at = case when p_in then coalesce(checked_in_at, now()) else null end where id = p_id;
end;
$function$;

create or replace function public.remove_guest(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.event_guests g
    using public.shows s
    where g.id = p_id and s.id = g.show_id
      and auth.uid() is not null
      and (g.added_by = auth.uid() or s.owner_id = auth.uid());
  if not found then raise exception 'Only the person who added this name, or the event owner, can remove it'; end if;
end;
$function$;

revoke all on function public.get_guest_list(uuid) from public, anon;
revoke all on function public.add_guest(uuid, text, integer, text) from public, anon;
revoke all on function public.check_in_guest(uuid, boolean) from public, anon;
revoke all on function public.remove_guest(uuid) from public, anon;
grant execute on function public.get_guest_list(uuid) to authenticated;
grant execute on function public.add_guest(uuid, text, integer, text) to authenticated;
grant execute on function public.check_in_guest(uuid, boolean) to authenticated;
grant execute on function public.remove_guest(uuid) to authenticated;
