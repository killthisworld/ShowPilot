-- The audio files a set takes (job 378, Jay 2026-11-19).
--
-- When making a set the DJ ticks one or more of WAV, AIFF, FLAC, MP3 and
-- M4A; sets made before take WAV. The act's set page reads the list from
-- get_dj_slot (event.file_types) to offer only those files, and the
-- dj-set-upload function checks it before opening an upload.
--
-- get_dj_slot is the live body (checked 2026-11-19) plus 'file_types'.
-- Safe to run again.

alter table public.dj_set_requests add column if not exists file_types text[] not null default '{wav}';
alter table public.dj_set_requests drop constraint if exists dj_set_requests_file_types_check;
alter table public.dj_set_requests add constraint dj_set_requests_file_types_check
  check (cardinality(file_types) between 1 and 5 and file_types <@ array['wav', 'aiff', 'flac', 'mp3', 'm4a']);

CREATE OR REPLACE FUNCTION public.get_dj_slot(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.dj_set_slots;
  r public.dj_set_requests;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into s from public.dj_set_slots where token = p_token;
  if s.id is null then return null; end if;
  select * into r from public.dj_set_requests where id = s.request_id;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'title', r.title, 'event_date', r.event_date, 'venue', r.venue,
      'due_at', r.due_at, 'note', r.note,
      'file_types', coalesce(to_jsonb(r.file_types), '["wav"]'::jsonb),
      'dj_name', (select nullif(display_name, '') from public.user_preferences where user_id = r.owner_id),
      'drive_connected', exists (select 1 from public.dj_drive_connections c where c.owner_id = r.owner_id)
    ),
    'slot', jsonb_build_object(
      'position', s.position, 'artist_name', s.artist_name,
      'set_start', s.set_start, 'set_end', s.set_end,
      'status', s.status, 'submitted_at', s.submitted_at,
      'tracks', s.tracks, 'gear', s.gear, 'announce', s.announce, 'contact', s.contact
    ),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.drive_file_id, 'name', f.name, 'size_bytes', f.size_bytes,
        'sample_rate', f.sample_rate, 'bit_depth', f.bit_depth, 'channels', f.channels,
        'duration_sec', f.duration_sec) order by f.created_at)
      from public.dj_set_files f where f.slot_id = s.id), '[]'::jsonb),
    'lineup', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', x.position, 'artist_name', x.artist_name,
        'set_start', x.set_start, 'set_end', x.set_end, 'is_you', x.id = s.id)
        order by x.position, x.created_at)
      from public.dj_set_slots x where x.request_id = s.request_id), '[]'::jsonb)
  );
end $function$;
