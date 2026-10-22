-- Invites that work, and a record of who changed what (job 143, 2026-10-22).
--
-- 1. gig_invites.opened_at: set the first time someone other than the
--    owner opens the invite link (get_gig_invite), so the owner can tell
--    "opened, not joined" from "not opened yet".
-- 2. accept_gig_invite: now called as soon as the invited person is signed
--    in on the invite link (the app used to only call it on their first
--    Save on the old shared page). One person per invite: an accepted
--    invite can't be taken over by a forwarded link, and the owner can't
--    accept their own. Returns { status: accepted | already_yours | owner }.
-- 3. A pending (not yet accepted) invite no longer opens that profile to
--    every signed-in person with the share link. Seven functions had the
--    rule "invited but nobody accepted yet -> anyone may edit"; it's removed
--    (owner, the person on the profile, and granted sections still edit).
-- 4. gig_activity: every change to an event's profiles is recorded (who,
--    which profile, which parts, when), by triggers on shows and show_bands,
--    so it covers every way the app saves. Saves by the same person on the
--    same profile within 10 minutes are merged into one entry.
--    get_gig_activity(token) reads it for anyone signed in with the event.
-- 5. get_needs_me: the owner's "Changed" list also shows profile updates
--    made by other people in the last 3 days (kind 'section_updated').
-- Safe to run more than once.

-- ------------------------------------------------------------------ 1
alter table public.gig_invites add column if not exists opened_at timestamptz;

create or replace function public.get_gig_invite(p_token uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result json;
  v_invite public.gig_invites;
  v_owner uuid;
begin
  select gi.* into v_invite from public.gig_invites gi where gi.invite_token = p_token;
  if not found then
    return null;
  end if;
  select owner_id into v_owner from public.shows where id = v_invite.show_id;
  if v_invite.opened_at is null and auth.uid() is distinct from v_owner then
    update public.gig_invites set opened_at = now() where id = v_invite.id;
  end if;

  select json_build_object(
    'id', s.id,
    'invite_id', gi.id,
    'invited_role', gi.invited_role,
    'label', gi.label,
    'event_name', s.event_name,
    'band_name', s.band_name,
    'date', s.date,
    'venue', s.venue,
    'location', s.location,
    'share_token', s.share_token,
    'status', gi.status,
    'is_owner', (auth.uid() is not null and auth.uid() = s.owner_id),
    'yours', (gi.accepted_by is not null and gi.accepted_by = auth.uid()),
    'taken', (gi.status = 'accepted' and gi.accepted_by is distinct from auth.uid())
  ) into v_result
  from public.gig_invites gi
  join public.shows s on s.id = gi.show_id
  where gi.invite_token = p_token;

  return v_result;
end;
$$;

-- ------------------------------------------------------------------ 2
drop function if exists public.accept_gig_invite(uuid);
create function public.accept_gig_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invite public.gig_invites;
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to accept an invite';
  end if;
  select * into v_invite from public.gig_invites where invite_token = p_token for update;
  if not found then
    raise exception 'This invite link is no longer valid';
  end if;
  select owner_id into v_owner from public.shows where id = v_invite.show_id;
  if v_owner = auth.uid() then
    return jsonb_build_object('status', 'owner');
  end if;
  if v_invite.status = 'accepted' then
    if v_invite.accepted_by = auth.uid() then
      return jsonb_build_object('status', 'already_yours', 'role', v_invite.invited_role);
    end if;
    raise exception 'Someone else already joined with this invite. Ask the event owner for your own link.';
  end if;
  update public.gig_invites
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), opened_at = coalesce(opened_at, now())
   where id = v_invite.id;
  return jsonb_build_object('status', 'accepted', 'role', v_invite.invited_role);
end;
$$;
revoke all on function public.accept_gig_invite(uuid) from public, anon;
grant execute on function public.accept_gig_invite(uuid) to authenticated;

-- ------------------------------------------------------------------ 3
-- Drop the "(claimed or not invited)" escape from each permission check,
-- leaving: owner, the person on that profile, or a granted section.
do $$
declare
  f record;
  v_def text;
  v_new text;
begin
  for f in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('update_gig_section', 'update_shared_gig', 'add_show_requirement', 'update_show_requirement',
                        'delete_show_requirement', 'set_gig_task_status', 'claim_gig_task')
  loop
    v_def := pg_get_functiondef(f.oid);
    v_new := regexp_replace(v_def, '\s+and\s+\(v_\w+_claimed\s+or\s+not\s+v_\w+_invited\)', '', 'g');
    if v_new <> v_def then
      execute v_new;
      raise notice 'tightened %', f.proname;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------------ 4
create table if not exists public.gig_activity (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  section text not null,          -- venue | manager | engineer | event
  fields text[] not null default '{}',
  at timestamptz not null default now()
);
create index if not exists gig_activity_show_idx on public.gig_activity (show_id, at desc);
alter table public.gig_activity enable row level security;
revoke all on public.gig_activity from anon, authenticated;

-- Record (or merge into the last 10 minutes' entry of) one change.
create or replace function public.log_gig_activity(p_show uuid, p_section text, p_fields text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
begin
  -- Changes made by the system (the nightly done job, migrations) aren't logged.
  if v_uid is null or p_show is null or coalesce(array_length(p_fields, 1), 0) = 0 then
    return;
  end if;
  select id into v_id from public.gig_activity
   where show_id = p_show and user_id = v_uid and section = p_section and at > now() - interval '10 minutes'
   order by at desc limit 1;
  if v_id is not null then
    update public.gig_activity
       set fields = (select array_agg(distinct x) from unnest(fields || p_fields) x), at = now()
     where id = v_id;
  else
    select display_name into v_name from public.user_preferences where user_id = v_uid;
    insert into public.gig_activity (show_id, user_id, user_name, section, fields)
    values (p_show, v_uid, v_name, p_section, (select array_agg(distinct x) from unnest(p_fields) x));
  end if;
end;
$$;
revoke all on function public.log_gig_activity(uuid, text, text[]) from public, anon, authenticated;

-- Keys of a jsonb object whose values differ between two versions.
create or replace function public.jsonb_changed_keys(a jsonb, b jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(k), '{}')
  from (
    select k from jsonb_object_keys(coalesce(case when jsonb_typeof(a) = 'object' then a end, '{}'::jsonb)) k
    union
    select k from jsonb_object_keys(coalesce(case when jsonb_typeof(b) = 'object' then b end, '{}'::jsonb)) k
  ) keys(k)
  where (a -> k) is distinct from (b -> k);
$$;

create or replace function public.shows_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_f text[];
begin
  -- Venue
  v_f := '{}';
  if new.venue is distinct from old.venue then v_f := array_append(v_f, 'venue'); end if;
  if new.city is distinct from old.city or new.state is distinct from old.state then v_f := array_append(v_f, 'address'); end if;
  if new.wifi_network is distinct from old.wifi_network or new.wifi_password is distinct from old.wifi_password or new.power_notes is distinct from old.power_notes then v_f := array_append(v_f, 'wifi_power'); end if;
  if new.console is distinct from old.console then v_f := array_append(v_f, 'house_gear'); end if;
  if new.venue_checklist is distinct from old.venue_checklist then v_f := array_append(v_f, 'checklist'); end if;
  if new.venue_documents is distinct from old.venue_documents then v_f := array_append(v_f, 'documents'); end if;
  v_f := v_f || public.jsonb_changed_keys(old.venue_info, new.venue_info);
  perform public.log_gig_activity(new.id, 'venue', v_f);

  -- Manager / Artist
  perform public.log_gig_activity(new.id, 'manager', public.jsonb_changed_keys(old.manager_info, new.manager_info));

  -- Audio / Lighting (engineer_info holds one object per role)
  perform public.log_gig_activity(new.id, 'engineer', public.jsonb_changed_keys(old.engineer_info, new.engineer_info));

  -- Event details
  v_f := '{}';
  if new.event_name is distinct from old.event_name or new.band_name is distinct from old.band_name then v_f := array_append(v_f, 'name'); end if;
  if new.date is distinct from old.date then v_f := array_append(v_f, 'date'); end if;
  if new.event_type is distinct from old.event_type then v_f := array_append(v_f, 'event_type'); end if;
  if new.icon_url is distinct from old.icon_url then v_f := array_append(v_f, 'image'); end if;
  perform public.log_gig_activity(new.id, 'event', v_f);

  return new;
end;
$$;

drop trigger if exists shows_activity on public.shows;
create trigger shows_activity after update on public.shows
  for each row execute function public.shows_activity_trigger();

-- Lineup changes (show_bands is rewritten on each lineup save).
drop trigger if exists show_bands_activity_ins on public.show_bands;
drop trigger if exists show_bands_activity_del on public.show_bands;
drop trigger if exists show_bands_activity_upd on public.show_bands;
create or replace function public.show_bands_activity_ins_trigger()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_show uuid;
begin
  for v_show in select distinct show_id from new_rows loop
    perform public.log_gig_activity(v_show, 'manager', array['lineup']);
  end loop;
  return null;
end; $$;
create or replace function public.show_bands_activity_del_trigger()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_show uuid;
begin
  for v_show in select distinct show_id from old_rows loop
    perform public.log_gig_activity(v_show, 'manager', array['lineup']);
  end loop;
  return null;
end; $$;
create trigger show_bands_activity_ins after insert on public.show_bands
  referencing new table as new_rows for each statement execute function public.show_bands_activity_ins_trigger();
create trigger show_bands_activity_del after delete on public.show_bands
  referencing old table as old_rows for each statement execute function public.show_bands_activity_del_trigger();
create trigger show_bands_activity_upd after update on public.show_bands
  referencing new table as new_rows for each statement execute function public.show_bands_activity_ins_trigger();

-- Read an event's activity (newest first).
create or replace function public.get_gig_activity(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_show uuid;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;
  select id into v_show from public.shows where share_token = p_token;
  if v_show is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'section', a.section, 'fields', a.fields, 'at', a.at,
                                        'user_id', a.user_id, 'user_name', coalesce(up.display_name, a.user_name))
                     order by a.at desc)
    from (select * from public.gig_activity where show_id = v_show order by at desc limit 60) a
    left join public.user_preferences up on up.user_id = a.user_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_gig_activity(uuid) from public, anon;
grant execute on function public.get_gig_activity(uuid) to authenticated;

-- ------------------------------------------------------------------ 5
do $$
declare
  v_def text;
  v_marker text := E'      ) x\n    ), ''[]''::jsonb),';
  v_add text := E'        union all\n'
    || E'        -- Profiles someone else updated on my events in the last 3 days (job 143).\n'
    || E'        select jsonb_build_object(\n'
    || E'            ''kind'', ''section_updated'', ''key'', ''ga:'' || a.id || '':'' || extract(epoch from a.at)::bigint,\n'
    || E'            ''at'', a.at, ''show_id'', ms.id, ''share_token'', ms.share_token,\n'
    || E'            ''event_title'', ms.title, ''event_date'', ms.date, ''venue'', ms.venue,\n'
    || E'            ''section'', a.section, ''fields'', to_jsonb(a.fields), ''by_name'', coalesce(aup.display_name, a.user_name)\n'
    || E'          )\n'
    || E'        from public.gig_activity a\n'
    || E'        join my_shows ms on ms.id = a.show_id\n'
    || E'        left join public.user_preferences aup on aup.user_id = a.user_id\n'
    || E'        where ms.is_owner and a.user_id is distinct from v_uid and a.at > now() - interval ''3 days''\n';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_needs_me';
  if v_def is null then
    raise notice 'get_needs_me not found, skipped';
    return;
  end if;
  if position('section_updated' in v_def) > 0 then
    raise notice 'get_needs_me already lists profile updates';
    return;
  end if;
  if position(v_marker in v_def) = 0 then
    raise exception 'get_needs_me has changed shape; not patched (ask Claude to update this step)';
  end if;
  execute replace(v_def, v_marker, v_add || v_marker);
end;
$$;
