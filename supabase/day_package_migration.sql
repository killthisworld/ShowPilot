-- Day-of package (job 320, Jay 2026-11-13): a link that opens a web of the
-- event's info sheets for people not on Show Pilot (door staff, security, a
-- fill-in tech, the driver). Made by the event's venue side, manager / artist
-- side or owner (biz_access.can_view), who ticks which sheets go in. The
-- sheets are live: the link reads the event as it is now.
--
-- A link stops working when its time runs out (default: 6am the morning
-- after the show) or when it's turned off. An optional passcode is stored
-- hashed. Viewers only ever get the fields the chosen sheets need, built
-- here on the server: never the whole event.

create table if not exists public.day_packages (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null unique,
  label text not null default 'Day of show' check (length(trim(label)) between 1 and 60),
  sheets text[] not null check (array_length(sheets, 1) >= 1 and sheets <@ array['schedule','lineup','setlist','contacts','guests']::text[]),
  passcode_hash text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists day_packages_show_idx on public.day_packages (show_id, created_at desc);
alter table public.day_packages enable row level security; -- no policies: only the functions below touch it
revoke all on public.day_packages from anon, authenticated;

-- Make a link. Returns { id, code, expires_at }.
create or replace function public.create_day_package(p_token uuid, p_label text, p_sheets text[], p_passcode text default null, p_expires_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_show public.shows%rowtype;
  v_code text;
  v_exp timestamptz;
  v_row public.day_packages%rowtype;
  v_sheets text[];
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into v_show from public.shows where share_token = p_token;
  if v_show.id is null then raise exception 'Event not found'; end if;
  if coalesce((public.biz_access(v_show.id)->>'can_view')::boolean, false) is not true then
    raise exception 'Only the venue and the manager / artist side can make a day-of package';
  end if;
  select array_agg(distinct s) into v_sheets from unnest(p_sheets) s where s = any(array['schedule','lineup','setlist','contacts','guests']);
  if v_sheets is null then raise exception 'Pick at least one sheet'; end if;
  if p_passcode is not null and length(trim(p_passcode)) not between 3 and 20 then raise exception 'The passcode should be 3 to 20 characters'; end if;
  -- Default: 6am the morning after the show (the show's own day, US Eastern
  -- unless it ends up in the past, then 24 hours from now).
  v_exp := coalesce(p_expires_at, ((coalesce(v_show.date, current_date) + 1)::timestamp + interval '6 hours') at time zone 'America/New_York');
  if v_exp < now() + interval '1 hour' then v_exp := now() + interval '24 hours'; end if;
  if v_exp > now() + interval '60 days' then v_exp := now() + interval '60 days'; end if;
  loop
    v_code := upper(substr(translate(encode(gen_random_bytes(9), 'base64'), '+/=0O1Il', ''), 1, 8));
    exit when length(v_code) = 8 and not exists (select 1 from public.day_packages where code = v_code);
  end loop;
  insert into public.day_packages (show_id, code, label, sheets, passcode_hash, expires_at)
    values (v_show.id, v_code, coalesce(nullif(trim(p_label), ''), 'Day of show'), v_sheets,
            case when nullif(trim(p_passcode), '') is null then null else encode(digest(lower(trim(p_passcode)), 'sha256'), 'hex') end,
            v_exp)
    returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'code', v_row.code, 'expires_at', v_row.expires_at);
end;
$$;

-- This event's links (for whoever can make them).
create or replace function public.list_day_packages(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_show uuid;
begin
  select id into v_show from public.shows where share_token = p_token;
  if v_show is null or coalesce((public.biz_access(v_show)->>'can_view')::boolean, false) is not true then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'code', d.code, 'label', d.label, 'sheets', to_jsonb(d.sheets), 'has_passcode', d.passcode_hash is not null,
      'expires_at', d.expires_at, 'revoked', d.revoked_at is not null, 'views', d.views, 'last_viewed_at', d.last_viewed_at,
      'created_at', d.created_at, 'mine', d.created_by = auth.uid()) order by d.created_at desc)
    from public.day_packages d where d.show_id = v_show), '[]'::jsonb);
end;
$$;

-- Turn a link off (anyone who can make them for this event).
create or replace function public.revoke_day_package(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_show uuid;
begin
  select show_id into v_show from public.day_packages where id = p_id;
  if v_show is null then raise exception 'Link not found'; end if;
  if coalesce((public.biz_access(v_show)->>'can_view')::boolean, false) is not true then raise exception 'Not allowed'; end if;
  update public.day_packages set revoked_at = coalesce(revoked_at, now()) where id = p_id;
end;
$$;

-- What a viewer sees (no sign-in). { status } is 'ok', 'passcode' (a
-- passcode is needed or was wrong), 'expired', 'off' or 'missing'. With
-- 'ok': { label, sheets, expires_at, gig }, where gig holds only the fields
-- the chosen sheets need, in the same shape as get_shared_gig.
create or replace function public.get_day_package(p_code text, p_passcode text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  d public.day_packages%rowtype;
  s public.shows%rowtype;
  vi jsonb; mi jsonb; ei jsonb;
  g jsonb;
  v_vi jsonb := '{}'::jsonb;
  v_mi jsonb := '{}'::jsonb;
  v_bands jsonb;
  has_sched boolean; has_line boolean; has_set boolean; has_cont boolean; has_guest boolean;
begin
  select * into d from public.day_packages where code = upper(trim(p_code));
  if d.id is null then return jsonb_build_object('status', 'missing'); end if;
  select * into s from public.shows where id = d.show_id;
  if s.id is null then return jsonb_build_object('status', 'missing'); end if;
  if d.revoked_at is not null then return jsonb_build_object('status', 'off', 'event', coalesce(nullif(s.event_name, ''), s.band_name)); end if;
  if d.expires_at < now() then return jsonb_build_object('status', 'expired', 'event', coalesce(nullif(s.event_name, ''), s.band_name)); end if;
  if d.passcode_hash is not null and (p_passcode is null or encode(digest(lower(trim(p_passcode)), 'sha256'), 'hex') <> d.passcode_hash) then
    return jsonb_build_object('status', 'passcode', 'wrong', p_passcode is not null, 'label', d.label,
      'event', jsonb_build_object('event_name', s.event_name, 'band_name', s.band_name, 'date', s.date, 'venue', s.venue, 'icon_url', s.icon_url));
  end if;

  update public.day_packages set views = views + 1, last_viewed_at = now() where id = d.id;

  vi := coalesce(s.venue_info, '{}'::jsonb);
  mi := coalesce(s.manager_info, '{}'::jsonb);
  ei := coalesce(s.engineer_info, '{}'::jsonb);
  has_sched := 'schedule' = any(d.sheets);
  has_line := 'lineup' = any(d.sheets);
  has_set := 'setlist' = any(d.sheets);
  has_cont := 'contacts' = any(d.sheets);
  has_guest := 'guests' = any(d.sheets);

  if has_sched then
    v_vi := v_vi || jsonb_strip_nulls(jsonb_build_object('schedule', vi->'schedule', 'address', vi->'address', 'load_in_location', vi->'load_in_location',
      'parking', vi->'parking', 'load_out_by', vi->'load_out_by', 'hard_curfew', vi->'hard_curfew'));
    v_mi := v_mi || jsonb_strip_nulls(jsonb_build_object('set_times', mi->'set_times', 'arrival_time', mi->'arrival_time'));
  end if;
  if has_line then v_mi := v_mi || jsonb_strip_nulls(jsonb_build_object('set_times', mi->'set_times')); end if;
  if has_set then v_mi := v_mi || jsonb_strip_nulls(jsonb_build_object('setlists', mi->'setlists')); end if;
  if has_guest then v_mi := v_mi || jsonb_strip_nulls(jsonb_build_object('guests', mi->'guests')); end if;
  if has_cont then
    v_vi := v_vi || jsonb_strip_nulls(jsonb_build_object('address', vi->'address'));
    v_mi := v_mi || jsonb_strip_nulls(jsonb_build_object('contact_name', mi->'contact_name', 'contact_title', mi->'contact_title',
      'contact_phone', mi->'contact_phone', 'contact_email', mi->'contact_email'));
  end if;

  if has_sched or has_line or has_cont then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'band_name', b.band_name, 'sort_order', b.sort_order,
        'set_length_minutes', case when has_sched or has_line then b.set_length_minutes end,
        'is_headliner', case when has_line then b.is_headliner end,
        'submitter_name', case when has_cont then b.submitter_name end,
        'submitter_phone', case when has_cont then b.submitter_phone end,
        'submitter_email', case when has_cont then b.submitter_email end)) order by b.sort_order nulls last, b.created_at), '[]'::jsonb)
      into v_bands from public.show_bands b where b.show_id = s.id;
  end if;

  g := jsonb_strip_nulls(jsonb_build_object(
    'event_name', s.event_name, 'band_name', s.band_name, 'date', s.date, 'venue', s.venue, 'city', s.city, 'state', s.state,
    'icon_url', s.icon_url, 'event_type', s.event_type,
    'venue_info', v_vi, 'manager_info', v_mi, 'bands', v_bands,
    'engineer_info', case when has_cont then jsonb_strip_nulls(jsonb_build_object(
        'audio', case when ei ? 'audio' then jsonb_strip_nulls(jsonb_build_object('contact_name', ei->'audio'->'contact_name', 'contact_phone', ei->'audio'->'contact_phone', 'contact_email', ei->'audio'->'contact_email')) end,
        'lighting', case when ei ? 'lighting' then jsonb_strip_nulls(jsonb_build_object('contact_name', ei->'lighting'->'contact_name', 'contact_phone', ei->'lighting'->'contact_phone', 'contact_email', ei->'lighting'->'contact_email', 'same_as_audio', ei->'lighting'->'same_as_audio')) end)) end));

  return jsonb_build_object('status', 'ok', 'label', d.label, 'sheets', to_jsonb(d.sheets), 'expires_at', d.expires_at, 'gig', g);
end;
$$;

revoke all on function public.create_day_package(uuid, text, text[], text, timestamptz) from public, anon;
revoke all on function public.list_day_packages(uuid) from public, anon;
revoke all on function public.revoke_day_package(uuid) from public, anon;
revoke all on function public.get_day_package(text, text) from public;
grant execute on function public.create_day_package(uuid, text, text[], text, timestamptz) to authenticated;
grant execute on function public.list_day_packages(uuid) to authenticated;
grant execute on function public.revoke_day_package(uuid) to authenticated;
grant execute on function public.get_day_package(text, text) to anon, authenticated;
