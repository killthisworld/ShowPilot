-- An act's own photo on the DJ's set (job 380, Jay 2026-11-19).
--
-- When an act with a Show Pilot account sends their set while signed in, the
-- set page calls dj_slot_photo_from_me(token): their profile photo (from
-- their own account, never a URL the page passes in) is copied onto their
-- slot, and DJ Tools shows it behind the act's card. Without an account the
-- DJ sees the act's photo from the event's lineup, if it has one.
-- Safe to run again.

alter table public.dj_set_slots add column if not exists photo_url text;

create or replace function public.dj_slot_photo_from_me(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v text;
begin
  if auth.uid() is null then return; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return; end if;
  select nullif(trim(profile_photo_url), '') into v from public.user_preferences where user_id = auth.uid();
  if v is null then return; end if;
  update public.dj_set_slots set photo_url = v where token = p_token and status = 'submitted';
end;
$$;
revoke all on function public.dj_slot_photo_from_me(text) from public, anon;
grant execute on function public.dj_slot_photo_from_me(text) to authenticated;
