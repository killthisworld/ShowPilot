-- ============================================================
-- Migration: allow anonymous, token-verified editing of shared shows
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================================
--
-- Why this exists: the /shared/:id page lets anyone with a valid share_token
-- edit a show without logging in. Our normal Row Level Security policies only
-- allow the owner to update a show, so a plain table update from an anonymous
-- visitor would be blocked. This function checks the token server-side (where
-- it can't be tampered with) before making the update, which is the secure
-- way to allow this without opening up the whole table to public writes.

create or replace function public.update_shared_show(
  p_show_id uuid,
  p_token uuid,
  p_updates jsonb
)
returns setof public.shows
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only proceed if the token matches this show's share_token
  if not exists (
    select 1 from public.shows
    where id = p_show_id and share_token = p_token
  ) then
    raise exception 'Invalid share token';
  end if;

  return query
  update public.shows
  set
    band_name = coalesce((p_updates->>'band_name'), band_name),
    venue = coalesce((p_updates->>'venue'), venue),
    location = coalesce((p_updates->>'location'), location),
    console = coalesce((p_updates->>'console'), console),
    contacts = coalesce((p_updates->'contacts'), contacts),
    band_members = coalesce((p_updates->'band_members'), band_members),
    general_notes = coalesce((p_updates->>'general_notes'), general_notes),
    updated_at = now()
  where id = p_show_id and share_token = p_token
  returning *;
end;
$$;

-- Allow both logged-out (anon) and logged-in (authenticated) visitors to call this
grant execute on function public.update_shared_show(uuid, uuid, jsonb) to anon, authenticated;
