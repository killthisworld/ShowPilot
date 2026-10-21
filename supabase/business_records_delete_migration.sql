-- Event paperwork (job 116, 2026-10-21): uploads on every section, a Deal
-- section, and deleting uploaded documents.
--
-- 1. New record kind 'deal' (deal documents now live in Paperwork).
-- 2. Both business sides can upload: the venue and the manager / artist
--    (and the event owner). Crew still can't see or upload anything here.
-- 3. delete_business_record: the venue side, the event owner, or whoever
--    uploaded the record can delete it. The app removes the file from storage first
--    (Supabase blocks deleting storage files from SQL), so storage gets a
--    matching DELETE policy.
-- 4. The bucket also takes Word, Excel, CSV and plain text files.
-- Safe to run more than once.

-- 1. kinds
alter table public.business_records drop constraint if exists business_records_kind_check;
alter table public.business_records add constraint business_records_kind_check
  check (kind in ('deal', 'agreement', 'rider', 'advance', 'coi', 'other'));

-- 2. filing: anyone on the business side
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
  if v_access is null or not coalesce((v_access->>'can_view')::boolean, false) then
    raise exception 'Only the venue and the manager / artist can add paperwork to this event';
  end if;
  if p_kind not in ('deal', 'agreement', 'rider', 'advance', 'coi', 'other') then
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

-- 3. deleting a record
create or replace function public.delete_business_record(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.business_records;
  v_access jsonb;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  select * into v_row from public.business_records where id = p_id;
  if not found then
    raise exception 'That document is already gone';
  end if;
  v_access := case when v_row.show_id is null then null else public.biz_access(v_row.show_id) end;
  if not (v_row.filed_by = auth.uid() or coalesce((v_access->>'venue')::boolean, false) or coalesce((v_access->>'is_owner')::boolean, false)) then
    raise exception 'Only the venue, the event owner or whoever uploaded it can delete this document';
  end if;
  delete from public.business_records where id = p_id;
  return jsonb_build_object('id', v_row.id, 'file_path', v_row.file_path);
end;
$$;

-- Can this person delete this storage file? Venue side or owner of its
-- event, or the person who filed the record that points at it.
create or replace function public.biz_file_can_delete(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if public.biz_file_access(p_name, 'venue') or public.biz_file_access(p_name, 'is_owner') then
    return true;
  end if;
  return exists (select 1 from public.business_records where file_path = p_name and filed_by = auth.uid());
end;
$$;

-- storage: upload for the whole business side, delete per the rule above
drop policy if exists "Venue uploads business records" on storage.objects;
create policy "Venue uploads business records" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-records' and public.biz_file_access(name, 'can_view'));

drop policy if exists "Business side deletes business records" on storage.objects;
create policy "Business side deletes business records" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-records' and public.biz_file_can_delete(name));

-- 4. more file types
update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv'
] where id = 'business-records';

revoke all on function public.delete_business_record(uuid) from public, anon;
revoke all on function public.biz_file_can_delete(text) from public, anon;
grant execute on function public.delete_business_record(uuid) to authenticated;
grant execute on function public.biz_file_can_delete(text) to authenticated;
