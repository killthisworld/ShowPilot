-- Event types a person deleted from their lists (Settings > Event colors).
-- Built-in types (Concert, Festival, ...) are always offered by the app, so
-- deleting one is remembered here; custom types are also removed from
-- custom_event_types. Events that already use a deleted type keep it.
-- Re-adding the same name takes it off this list.
alter table public.user_preferences
  add column if not exists hidden_event_types jsonb not null default '[]'::jsonb;
