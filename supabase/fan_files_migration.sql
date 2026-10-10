-- ============================================================
-- Migration: files attached to fan event emails (parking PDF, map, ...)
-- ============================================================
--
-- Hosts upload up to 3 files in Fan page settings > Email attachments. They're
-- listed in shows.fan_page.files as [{ path, name, size, type }] and attached
-- to every fan event email (RSVP confirmations and the "email me the info"
-- opt-in) by the send-fan-event-email function, which reads them with the
-- service role.
--
-- The bucket is PRIVATE: a parking PDF or map can give away the location of a
-- private event, so the files are never at a public URL. Each host can only
-- upload to, read and delete files under their own folder (<user id>/...).
-- get_fan_event does not return fan_page.files, so the public page never
-- sees the paths either.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fan-files', 'fan-files', false, 5242880,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Hosts upload their own fan files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'fan-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Hosts read their own fan files"
  on storage.objects for select to authenticated
  using (bucket_id = 'fan-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Hosts delete their own fan files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'fan-files' and (storage.foldername(name))[1] = auth.uid()::text);
