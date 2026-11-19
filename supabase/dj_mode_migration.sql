-- DJ view (job 353): an Artist account can switch on "I'm a DJ", which
-- turns the app into a simpler layout built around collecting performers'
-- sets (DJ Tools as the home). Stored on the account so the phone and the
-- desktop follow the same switch. Only the account itself reads or writes it
-- (user_preferences' existing row rules). Safe to run more than once.

alter table public.user_preferences
  add column if not exists dj_mode boolean not null default false;
