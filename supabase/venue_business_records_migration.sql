-- Venue business records (job 104, 2026-10-20)
--
-- The Venue writes each event's deal (performance agreement terms); the
-- Manager / Artist accepts it or asks for changes. The Venue files the
-- event's paperwork (agreement, rider, advance confirmations, certificate of
-- insurance) as dated records nobody can edit afterwards; a change is filed
-- as the next version and the old one stays.
--
-- Privacy: deal terms and records are business-only. Nothing here is in
-- get_shared_gig, so crew who only hold the share link never see them.
-- Everything goes through the security-definer functions below; the tables
-- themselves have RLS on and no policies.
--
-- Who is who on an event (biz_access):
--   venue side   = accepted Venue invite, or the event owner when the owner
--                  is a venue account or no venue has joined yet
--   manager side = accepted Manager or Artist invite, or the owner when the
--                  owner is a manager / artist
--   can view     = owner, venue side or manager side
-- Section grants (gig_invites.granted_sections) do NOT count: they let crew
-- edit event info like load-in, not see fees or insurance.

-- ------------------------------------------------------------
-- 1. Access helper
-- ------------------------------------------------------------
create or replace function public.biz_access(p_show uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_owner_type text;
  v_is_owner boolean;
  v_venue boolean;
  v_manager boolean;
begin
  if v_uid is null or p_show is null then
    return null;
  end if;
  select owner_id into v_owner from public.shows where id = p_show;
  if not found then
    return null;
  end if;
  v_is_owner := (v_owner = v_uid);
  select account_type into v_owner_type from public.user_preferences where user_id = v_owner;

  select exists (
    select 1 from public.gig_invites
    where show_id = p_show and status = 'accepted' and accepted_by = v_uid
      and invited_role = 'venue'
  ) into v_venue;

  select exists (
    select 1 from public.gig_invites
    where show_id = p_show and status = 'accepted' and accepted_by = v_uid
      and invited_role in ('manager', 'band')
  ) into v_manager;

  if v_is_owner then
    if coalesce(v_owner_type, '') = 'venue'
       or not exists (select 1 from public.gig_invites where show_id = p_show and status = 'accepted' and invited_role = 'venue') then
      v_venue := true;
    end if;
    if coalesce(v_owner_type, '') in ('manager', 'band') then
      v_manager := true;
    end if;
  end if;

  return jsonb_build_object(
    'can_view', v_is_owner or v_venue or v_manager,
    'venue', v_venue,
    'manager', v_manager,
    'is_owner', v_is_owner
  );
end;
$$;

-- ------------------------------------------------------------
-- 2. Tables
-- ------------------------------------------------------------
create table if not exists public.event_deals (
  show_id uuid primary key references public.shows(id) on delete cascade,
  terms jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'changes_requested')),
  response_note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz
);
alter table public.event_deals enable row level security;
revoke all on public.event_deals from anon, authenticated;

create table if not exists public.business_records (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows(id) on delete set null,
  kind text not null check (kind in ('agreement', 'rider', 'advance', 'coi', 'other')),
  title text not null,
  version integer not null default 1,
  snapshot jsonb not null default '{}'::jsonb,
  file_path text,
  file_name text,
  signed boolean not null default false,
  party text,
  expires_on date,
  note text,
  -- copied from the event when filed, so a record still reads right if the
  -- event is renamed or deleted later
  event_name text,
  event_date date,
  venue_name text,
  filed_by uuid references auth.users(id) on delete set null,
  filed_by_name text,
  filed_at timestamptz not null default now()
);
create unique index if not exists business_records_version_uq on public.business_records (show_id, kind, version);
create index if not exists business_records_show_idx on public.business_records (show_id, kind, filed_at desc);
create index if not exists business_records_filer_idx on public.business_records (filed_by, filed_at desc);
alter table public.business_records enable row level security;
revoke all on public.business_records from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Read: one event's deal + records, for business viewers only
-- ------------------------------------------------------------
create or replace function public.get_event_business(p_show uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_access jsonb := public.biz_access(p_show);
  v_deal jsonb;
  v_records jsonb;
begin
  if v_access is null or not (v_access->>'can_view')::boolean then
    return jsonb_build_object('can_view', false);
  end if;

  select to_jsonb(d) into v_deal from public.event_deals d where d.show_id = p_show;
  -- a draft is the venue's until it's sent
  if v_deal is not null and v_deal->>'status' = 'draft' and not (v_access->>'venue')::boolean then
    v_deal := null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.filed_at desc), '[]'::jsonb) into v_records
  from public.business_records r where r.show_id = p_show;

  return v_access || jsonb_build_object('deal', v_deal, 'records', v_records);
end;
$$;

-- ------------------------------------------------------------
-- 4. Deal: venue saves / sends, manager accepts or asks for changes
-- ------------------------------------------------------------
create or replace function public.save_event_deal(p_show uuid, p_terms jsonb, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_access jsonb := public.biz_access(p_show);
  v_row public.event_deals;
begin
  if v_access is null or not (v_access->>'venue')::boolean then
    raise exception 'Only the venue can edit the deal';
  end if;
  if p_status not in ('draft', 'sent') then
    raise exception 'Status must be draft or sent';
  end if;
  if jsonb_typeof(coalesce(p_terms, '{}'::jsonb)) <> 'object' then
    raise exception 'Terms must be an object';
  end if;
  -- once sent, changes go out as a new send (never quietly back to draft)
  if p_status = 'draft' and exists (select 1 from public.event_deals where show_id = p_show and status <> 'draft') then
    raise exception 'This deal was already sent. Send the changes instead';
  end if;

  insert into public.event_deals as d (show_id, terms, status, updated_by, updated_at, sent_at)
  values (p_show, coalesce(p_terms, '{}'::jsonb), p_status, auth.uid(), now(), case when p_status = 'sent' then now() end)
  on conflict (show_id) do update set
    terms = excluded.terms,
    status = excluded.status,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at,
    sent_at = case when excluded.status = 'sent' then now() else d.sent_at end,
    -- a new send starts a new round: clear the last answer
    response_note = case when excluded.status = 'sent' then null else d.response_note end,
    responded_by = case when excluded.status = 'sent' then null else d.responded_by end,
    responded_at = case when excluded.status = 'sent' then null else d.responded_at end
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

drop function if exists public.respond_event_deal(uuid, boolean, text);
create or replace function public.respond_event_deal(p_show uuid, p_accept boolean, p_note text, p_seen timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_access jsonb := public.biz_access(p_show);
  v_row public.event_deals;
begin
  if v_access is null or not (v_access->>'manager')::boolean then
    raise exception 'Only the manager or artist can answer the deal';
  end if;
  if (v_access->>'venue')::boolean then
    raise exception 'The venue can''t answer its own deal';
  end if;
  if exists (select 1 from public.event_deals where show_id = p_show and status = 'sent' and updated_at is distinct from p_seen) then
    raise exception 'The venue changed the deal. Look it over again before answering';
  end if;

  update public.event_deals set
    status = case when p_accept then 'accepted' else 'changes_requested' end,
    response_note = nullif(trim(coalesce(p_note, '')), ''),
    responded_by = auth.uid(),
    responded_at = now(),
    updated_at = now()
  where show_id = p_show and status = 'sent' and updated_at = p_seen
  returning * into v_row;

  if v_row is null then
    raise exception 'There is no sent deal to answer';
  end if;
  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------------------------
-- 5. File a record (venue side only). Records are never edited.
-- ------------------------------------------------------------
create or replace function public.file_business_record(
  p_show uuid,
  p_kind text,
  p_title text,
  p_snapshot jsonb default '{}'::jsonb,
  p_file_path text default null,
  p_file_name text default null,
  p_signed boolean default false,
  p_party text default null,
  p_expires_on date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_access jsonb := public.biz_access(p_show);
  v_show public.shows;
  v_version integer;
  v_name text;
  v_row public.business_records;
begin
  if v_access is null or not (v_access->>'venue')::boolean then
    raise exception 'Only the venue can file records for this event';
  end if;
  if p_kind not in ('agreement', 'rider', 'advance', 'coi', 'other') then
    raise exception 'Unknown record type';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'A record needs a title';
  end if;
  -- files must sit in this event's folder of the private bucket
  if p_file_path is not null and split_part(p_file_path, '/', 1) <> p_show::text then
    raise exception 'File is not in this event''s folder';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_show::text || ':' || p_kind));
  select * into v_show from public.shows where id = p_show;
  select coalesce(max(version), 0) + 1 into v_version from public.business_records where show_id = p_show and kind = p_kind;
  select display_name into v_name from public.user_preferences where user_id = auth.uid();

  insert into public.business_records (
    show_id, kind, title, version, snapshot, file_path, file_name, signed, party, expires_on, note,
    event_name, event_date, venue_name, filed_by, filed_by_name
  ) values (
    p_show, p_kind, trim(p_title), v_version, coalesce(p_snapshot, '{}'::jsonb), p_file_path, p_file_name,
    coalesce(p_signed, false), nullif(trim(coalesce(p_party, '')), ''), p_expires_on, nullif(trim(coalesce(p_note, '')), ''),
    coalesce(nullif(v_show.event_name, ''), v_show.band_name), v_show.date, v_show.venue, auth.uid(), v_name
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ------------------------------------------------------------
-- 6. The venue's Records page: everything filed on events where they're
--    the venue, plus anything they filed themselves (even if the event is
--    gone).
-- ------------------------------------------------------------
create or replace function public.list_venue_records()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'Must be signed in';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.filed_at desc), '[]'::jsonb) into v_out
  from public.business_records r
  where r.filed_by = v_uid
     or (r.show_id in (
           select s.id from public.shows s where s.owner_id = v_uid
           union
           select gi.show_id from public.gig_invites gi where gi.accepted_by = v_uid and gi.status = 'accepted' and gi.invited_role = 'venue'
         )
         and coalesce((public.biz_access(r.show_id)->>'venue')::boolean, false));
  return v_out;
end;
$$;

-- ------------------------------------------------------------
-- 7. Private file storage: business-records/<show id>/<file>
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-records', 'business-records', false, 15728640, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.biz_file_access(p_name text, p_need text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_show uuid;
  v_access jsonb;
begin
  begin
    v_show := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  v_access := public.biz_access(v_show);
  if v_access is not null and coalesce((v_access->>p_need)::boolean, false) then
    return true;
  end if;
  -- whoever filed a record can always open its file
  return p_need = 'can_view' and exists (
    select 1 from public.business_records where file_path = p_name and filed_by = auth.uid()
  );
end;
$$;

drop policy if exists "Venue uploads business records" on storage.objects;
create policy "Venue uploads business records" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-records' and public.biz_file_access(name, 'venue'));

drop policy if exists "Business viewers read business records" on storage.objects;
create policy "Business viewers read business records" on storage.objects
  for select to authenticated
  using (bucket_id = 'business-records' and public.biz_file_access(name, 'can_view'));

-- ------------------------------------------------------------
-- 8. Who can call what
-- ------------------------------------------------------------
revoke all on function public.biz_access(uuid) from public, anon;
revoke all on function public.get_event_business(uuid) from public, anon;
revoke all on function public.save_event_deal(uuid, jsonb, text) from public, anon;
revoke all on function public.respond_event_deal(uuid, boolean, text, timestamptz) from public, anon;
revoke all on function public.file_business_record(uuid, text, text, jsonb, text, text, boolean, text, date, text) from public, anon;
revoke all on function public.list_venue_records() from public, anon;
revoke all on function public.biz_file_access(text, text) from public, anon;

grant execute on function public.biz_access(uuid) to authenticated;
grant execute on function public.get_event_business(uuid) to authenticated;
grant execute on function public.save_event_deal(uuid, jsonb, text) to authenticated;
grant execute on function public.respond_event_deal(uuid, boolean, text, timestamptz) to authenticated;
grant execute on function public.file_business_record(uuid, text, text, jsonb, text, text, boolean, text, date, text) to authenticated;
grant execute on function public.list_venue_records() to authenticated;
grant execute on function public.biz_file_access(text, text) to authenticated;
