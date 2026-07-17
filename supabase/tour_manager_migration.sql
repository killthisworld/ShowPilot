-- ============================================================
-- Migration: allow anonymous tour manager submission to create a show
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================================
--
-- Why this exists: an anonymous tour manager (no login) fills out a form and
-- it needs to create a Show owned by the *engineer*, not by them. Normal RLS
-- policies correctly block an anonymous user from inserting a row owned by
-- someone else — so this function does it server-side after verifying the
-- invite_token is valid, which is the secure way to allow this.

create or replace function public.submit_tour_manager_request(
  p_token uuid,
  p_form jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_show_id uuid;
begin
  select * into v_request from public.tour_manager_requests where invite_token = p_token;
  if v_request is null then
    raise exception 'Invalid invite token';
  end if;

  insert into public.shows (
    owner_id, band_name, venue, date, location, genre_tags, console,
    wifi_network, wifi_password, contacts, stage_plot_url, stage_plot_files,
    band_members, general_notes, status
  ) values (
    v_request.engineer_user_id,
    p_form->>'band_name',
    p_form->>'venue',
    nullif(p_form->>'date', '')::date,
    p_form->>'location',
    coalesce(p_form->'genre_tags', '[]'::jsonb),
    p_form->>'console',
    p_form->>'wifi_network',
    p_form->>'wifi_password',
    coalesce(p_form->'contacts', '[]'::jsonb),
    p_form->>'stage_plot_url',
    coalesce(p_form->'stage_plot_files', '[]'::jsonb),
    coalesce(p_form->'band_members', '[]'::jsonb),
    p_form->>'general_notes',
    'not_started'
  ) returning id into v_show_id;

  update public.tour_manager_requests
  set status = 'submitted',
      band_name = p_form->>'band_name',
      venue = p_form->>'venue',
      date = nullif(p_form->>'date', '')::date,
      location = p_form->>'location',
      console = p_form->>'console',
      wifi_network = p_form->>'wifi_network',
      wifi_password = p_form->>'wifi_password',
      contacts = coalesce(p_form->'contacts', '[]'::jsonb),
      band_members = coalesce(p_form->'band_members', '[]'::jsonb),
      general_notes = p_form->>'general_notes',
      created_show_id = v_show_id
  where id = v_request.id;

  return v_show_id;
end;
$$;

grant execute on function public.submit_tour_manager_request(uuid, jsonb) to anon, authenticated;
