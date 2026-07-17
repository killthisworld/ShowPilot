-- ============================================================
-- Migration: allow anonymous uploads to the stage-plots bucket
-- Run this in Supabase SQL Editor
-- ============================================================
--
-- Why this exists: the tour manager intake form lets anonymous (logged-out)
-- visitors upload stage plot files. Supabase Storage blocks uploads by
-- default unless a policy explicitly allows it — this adds one scoped to
-- just the stage-plots bucket, so anonymous visitors can only upload there,
-- not to any other bucket (profile-photos, input-files stay owner-only).

create policy "Anyone can upload to stage-plots"
  on storage.objects for insert
  with check (bucket_id = 'stage-plots');
