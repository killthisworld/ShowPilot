-- Fan profile customization (job 84): the fan's own look, saved on their
-- account so it follows them to any device. Shape:
--   { "star": "#E4E0FF", "sky": "galaxy" | "black" | "still", "home": "shows" | "stars" }
-- Their name uses the existing display_name column. Covered by the existing
-- "own row only" policies on user_preferences. Safe to run more than once.

alter table public.user_preferences add column if not exists fan_style jsonb;
