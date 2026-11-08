-- Job 274 (2026-11-08): your own instruments for stage plots, made with the
-- gear in "What do they play?": [{ "id", "label", "color", "icon" }].
-- Read and written by the owner like the rest of user_preferences (existing
-- own-row policies). A member given one stores its label / color / icon on
-- themselves, so nothing else changes.
alter table public.user_preferences add column if not exists custom_stage_positions jsonb not null default '[]'::jsonb;
