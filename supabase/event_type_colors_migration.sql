-- Each person's own event-type colors: { "<type, lowercased>": "#RRGGBB" }.
-- Read and written by the signed-in user through user_preferences (same
-- row and policies as custom_event_types); only changes that person's
-- screens. Empty means everything uses the built-in colors.
alter table public.user_preferences
  add column if not exists event_type_colors jsonb not null default '{}'::jsonb;
