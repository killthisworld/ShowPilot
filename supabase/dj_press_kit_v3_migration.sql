-- DJ press kit, round 3 (job 460, 2026-11-22): the record plays. A DJ puts up
-- to 5 tracks on each side (Side A / Side B) and viewers play them from the
-- record on the press kit. The kit also returns the DJ's banner (the page
-- background).
--
-- Needs dj_press_kit_v2_migration.sql (job 459) first.

-- Public bucket for the tracks (they're for anyone with the press kit link),
-- 30 MB a file, audio only. Each DJ writes only under their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dj-kit-audio', 'dj-kit-audio', true, 31457280, array[
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
  'audio/wave', 'audio/vnd.wave', 'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/webm'
])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "DJs add tracks to their own record" on storage.objects;
create policy "DJs add tracks to their own record" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dj-kit-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "DJs change tracks on their own record" on storage.objects;
create policy "DJs change tracks on their own record" on storage.objects
  for update to authenticated
  using (bucket_id = 'dj-kit-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "DJs remove tracks from their own record" on storage.objects;
create policy "DJs remove tracks from their own record" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dj-kit-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The public press kit now carries the record's tracks too.
create or replace function public.get_dj_press_kit(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', t.name,
    'photo_url', t.data->>'photo_url',
    'banner_url', t.data->>'kit_banner_url',
    'genre_tags', coalesce(t.data->'genre_tags', '[]'::jsonb),
    'city', t.data->>'kit_city',
    'bio', t.data->>'kit_bio',
    'mixes', coalesce(t.data->'kit_mixes', '[]'::jsonb),
    'tracks', coalesce(t.data->'kit_tracks', '{"a":[],"b":[]}'::jsonb),
    'press_photos', coalesce(t.data->'kit_photos', '[]'::jsonb),
    'logo_url', t.data->>'kit_logo_url',
    'links', coalesce(t.data->'kit_links', '[]'::jsonb),
    'contact_name', t.data->>'contact_name',
    'contact_email', t.data->>'contact_email',
    'contact_phone', t.data->>'contact_phone',
    'take_requests', k.take_requests
  ) || public._dj_kit_extras(k.owner_id, k.show_dates, k.show_history, t.name)
  from public.dj_press_kits k
  join public.saved_templates t on t.id = k.template_id
  where k.token = p_token and length(coalesce(p_token, '')) >= 24;
$$;
revoke all on function public.get_dj_press_kit(text) from public;
grant execute on function public.get_dj_press_kit(text) to anon, authenticated;
