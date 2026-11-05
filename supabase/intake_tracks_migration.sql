-- Tracks on the intake form (job 74, 2026-11-05)
--
-- The person making an intake link can tick "Ask for tracks?" (like
-- "Include additional services?"). The act then sees "Do you have tracks to
-- send?" on the form. If they answer Yes, right after they send the form the
-- app asks for their set slot and opens the DJ set form (/dj/set/<token>), so
-- they can add their track list and WAVs to their set. The WAVs go to the
-- Google Drive of whoever made the intake link (their DJ Tools), under the
-- event's set request, which is made on first use.
--
-- New columns only, plus two new functions; the existing intake functions
-- (get_* / submit_*) are not changed.

alter table public.tour_manager_requests
  add column if not exists ask_tracks boolean not null default false,
  add column if not exists has_tracks boolean,
  add column if not exists dj_slot_token text;

alter table public.opener_requests
  add column if not exists ask_tracks boolean not null default false,
  add column if not exists has_tracks boolean,
  add column if not exists dj_slot_token text;

-- Does this intake link ask for tracks? (p_kind: 'tm' = main link, 'opener'.)
create or replace function public.intake_asks_tracks(p_token uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_kind = 'opener' then (select o.ask_tracks from public.opener_requests o where o.invite_token = p_token)
    else (select r.ask_tracks from public.tour_manager_requests r where r.invite_token = p_token)
  end
$$;

-- After the act sends the form and said they have tracks: their set slot on
-- the event (made once, then reused) and its token for /dj/set/<token>.
-- Only works for a link that asks for tracks and has been submitted.
create or replace function public.intake_dj_slot(p_token uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_show uuid;
  v_artist text;
  v_existing text;
  v_status text;
  v_ask boolean;
  v_tm public.tour_manager_requests;
  v_op public.opener_requests;
  v_sh public.shows;
  v_req uuid;
  v_slot_token text;
begin
  if p_token is null then return null; end if;

  if p_kind = 'opener' then
    select * into v_op from public.opener_requests where invite_token = p_token;
    if v_op.id is null then return null; end if;
    select * into v_tm from public.tour_manager_requests where id = v_op.tour_manager_request_id;
    v_owner := v_op.engineer_user_id;
    v_show := coalesce(v_tm.created_show_id, v_tm.target_show_id);
    v_artist := coalesce(nullif(trim(v_op.band_name), ''), 'Artist');
    v_existing := v_op.dj_slot_token;
    v_status := v_op.status;
    v_ask := v_op.ask_tracks;
  else
    select * into v_tm from public.tour_manager_requests where invite_token = p_token;
    if v_tm.id is null then return null; end if;
    v_owner := v_tm.engineer_user_id;
    v_show := coalesce(v_tm.created_show_id, v_tm.target_show_id);
    v_artist := coalesce(nullif(trim(v_tm.band_name), ''), 'Artist');
    v_existing := v_tm.dj_slot_token;
    v_status := v_tm.status;
    v_ask := v_tm.ask_tracks;
  end if;

  if not coalesce(v_ask, false) or v_status is distinct from 'submitted' or v_owner is null then
    return null;
  end if;

  -- Already made: hand back the same slot.
  if v_existing is not null and exists (select 1 from public.dj_set_slots where token = v_existing) then
    return v_existing;
  end if;

  -- The event's set request for this link's owner, made on first use.
  if v_show is not null then
    select * into v_sh from public.shows where id = v_show;
    select id into v_req from public.dj_set_requests
      where owner_id = v_owner and show_id = v_show order by created_at limit 1;
  end if;
  if v_req is null then
    insert into public.dj_set_requests (owner_id, show_id, title, event_date, venue)
    values (
      v_owner,
      v_sh.id,
      left(coalesce(nullif(trim(v_sh.event_name), ''), nullif(trim(v_sh.venue), ''), nullif(trim(v_sh.band_name), ''), 'Set'), 120),
      v_sh.date,
      left(nullif(trim(v_sh.venue), ''), 120)
    )
    returning id into v_req;
  end if;

  -- This act's slot: reuse one with the same name, else add one at the end.
  select token into v_slot_token from public.dj_set_slots
    where request_id = v_req and lower(trim(artist_name)) = lower(v_artist) order by created_at limit 1;
  if v_slot_token is null then
    insert into public.dj_set_slots (request_id, position, artist_name)
    values (v_req, coalesce((select max(position) from public.dj_set_slots where request_id = v_req), 0) + 1, left(v_artist, 120))
    returning token into v_slot_token;
  end if;

  if p_kind = 'opener' then
    update public.opener_requests set has_tracks = true, dj_slot_token = v_slot_token where id = v_op.id;
  else
    update public.tour_manager_requests set has_tracks = true, dj_slot_token = v_slot_token where id = v_tm.id;
  end if;

  return v_slot_token;
end $$;

-- An act that answered No: remembered so the sender can see it.
create or replace function public.intake_no_tracks(p_token uuid, p_kind text)
returns void language sql security definer set search_path = public as $$
  update public.tour_manager_requests set has_tracks = false
    where p_kind is distinct from 'opener' and invite_token = p_token and ask_tracks;
  update public.opener_requests set has_tracks = false
    where p_kind = 'opener' and invite_token = p_token and ask_tracks;
$$;

revoke all on function public.intake_asks_tracks(uuid, text) from public;
revoke all on function public.intake_dj_slot(uuid, text) from public;
revoke all on function public.intake_no_tracks(uuid, text) from public;
grant execute on function public.intake_asks_tracks(uuid, text) to anon, authenticated;
grant execute on function public.intake_dj_slot(uuid, text) to anon, authenticated;
grant execute on function public.intake_no_tracks(uuid, text) to anon, authenticated;
