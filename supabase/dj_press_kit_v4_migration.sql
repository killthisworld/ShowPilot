-- DJ press kit record (job 461, 2026-11-22): any audio file, no 30 MB cap.
-- Jay: DJs upload "whatever"; the app keeps it to 2 tracks a side to save
-- storage. With no bucket limit, the project's own upload limit (Supabase:
-- Storage > Settings) is the cap. 'audio/*' takes every audio type; some
-- phones send AIFF / FLAC without one, so octet-stream is allowed too.
update storage.buckets
set file_size_limit = null,
    allowed_mime_types = array['audio/*', 'application/octet-stream']
where id = 'dj-kit-audio';
