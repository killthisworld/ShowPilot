-- ============================================================
-- Migration: delegated section access per invite
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================================
--
-- Why this exists: previously an invite only unlocked the one section
-- matching its invited_role - access was a hard yes/no based on being
-- the owner or holding that exact role. This lets the owner delegate
-- edit access to additional sections on a per-invite basis, so a single
-- collaborator can be trusted with more than just their own field
-- without being made a co-owner.
--
-- The recipient still only sees "(You)" on the section matching their
-- own invited_role (that logic is unchanged, in the frontend). Sections
-- listed in granted_sections just stop showing the lock icon and become
-- editable for them, same as if they held that role outright.

alter table public.gig_invites
  add column if not exists granted_sections text[] not null default '{}';

comment on column public.gig_invites.granted_sections is
  'Canonical section keys (venue, promoter, booking_agent, manager, engineer) this invite''s recipient is additionally allowed to edit, on top of their own invited_role section. Set by the owner when creating the invite.';

-- ------------------------------------------------------------
-- get_gig_section_permissions: also report which sections the
-- signed-in viewer has been granted, across any invite for this show
-- they've accepted.
-- ------------------------------------------------------------
create or replace function public.get_gig_section_permissions(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_is_owner boolean := false;
  v_my_roles text[] := '{}';
  v_claimed_roles text[] := '{}';
  v_invited_roles text[] := '{}';
  v_granted_sections text[] := '{}';
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    return null;
  end if;

  v_is_owner := (auth.uid() is not null and auth.uid() = v_show.owner_id);

  if auth.uid() is not null then
    select coalesce(array_agg(distinct invited_role), '{}')
    into v_my_roles
    from public.gig_invites
    where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid();

    -- Sections explicitly delegated to this user via any invite (for
    -- this show) they've accepted, on top of that invite's own role.
    select coalesce(array_agg(distinct gs), '{}')
    into v_granted_sections
    from public.gig_invites gi, unnest(gi.granted_sections) as gs
    where gi.show_id = v_show.id and gi.status = 'accepted' and gi.accepted_by = auth.uid();
  end if;

  select coalesce(array_agg(distinct invited_role), '{}')
  into v_claimed_roles
  from public.gig_invites
  where show_id = v_show.id and status = 'accepted';

  -- Any role that has ever had an invite generated for it, regardless of
  -- whether it's been accepted yet - this is what makes a section
  -- editable at all for a non-owner.
  select coalesce(array_agg(distinct invited_role), '{}')
  into v_invited_roles
  from public.gig_invites
  where show_id = v_show.id;

  return jsonb_build_object(
    'is_owner', v_is_owner,
    'my_roles', to_jsonb(v_my_roles),
    'claimed_roles', to_jsonb(v_claimed_roles),
    'invited_roles', to_jsonb(v_invited_roles),
    'granted_sections', to_jsonb(v_granted_sections)
  );
end;
$function$;

-- ------------------------------------------------------------
-- update_gig_section: honor a delegated grant for this section, in
-- addition to the existing own-role / first-claim checks.
-- ------------------------------------------------------------
create or replace function public.update_gig_section(p_token uuid, p_section text, p_updates jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_is_owner boolean;
  v_has_role boolean;
  v_has_grant boolean;
  v_role_claimed boolean;
  v_role_invited boolean;
  v_role_match text[];
  v_section_key text;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Gig not found';
  end if;

  v_is_owner := (auth.uid() is not null and auth.uid() = v_show.owner_id);

  if not v_is_owner then
    if auth.uid() is null then
      raise exception 'Must be signed in to edit';
    end if;

    -- The Audio/Lighting section covers two distinct invited roles that
    -- both write to the same engineer_info field. Before a first-time
    -- invite is accepted the frontend can't yet tell which of the two the
    -- caller holds, so treat them as one pair here too.
    if p_section in ('engineer', 'lighting') then
      v_role_match := array['engineer', 'lighting'];
    else
      v_role_match := array[p_section];
    end if;

    -- granted_sections always stores the canonical section key (the
    -- engineer/lighting pair collapses to 'engineer'), so normalize.
    v_section_key := case when p_section = 'lighting' then 'engineer' else p_section end;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid() and invited_role = any(v_role_match)
    ) into v_has_role;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid()
        and v_section_key = any(granted_sections)
    ) into v_has_grant;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and invited_role = any(v_role_match)
    ) into v_role_claimed;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and invited_role = any(v_role_match)
    ) into v_role_invited;

    if not v_has_role and not v_has_grant and (v_role_claimed or not v_role_invited) then
      raise exception 'You do not have permission to edit this section';
    end if;
  end if;

  if p_section = 'venue' then
    update public.shows set
      venue = coalesce(p_updates->>'venue', venue),
      city = coalesce(p_updates->>'city', city),
      state = coalesce(p_updates->>'state', state),
      wifi_network = coalesce(p_updates->>'wifi_network', wifi_network),
      wifi_password = coalesce(p_updates->>'wifi_password', wifi_password),
      console = coalesce(p_updates->>'console', console),
      power_notes = coalesce(p_updates->>'power_notes', power_notes),
      venue_checklist = coalesce(p_updates->'venue_checklist', venue_checklist)
    where id = v_show.id;
  elsif p_section = 'manager' then
    update public.shows set manager_info = p_updates where id = v_show.id;
  elsif p_section = 'promoter' then
    update public.shows set promoter_info = p_updates where id = v_show.id;
  elsif p_section = 'booking_agent' then
    update public.shows set booking_agent_info = p_updates where id = v_show.id;
  elsif p_section in ('engineer', 'lighting') then
    update public.shows set engineer_info = p_updates where id = v_show.id;
  else
    raise exception 'Unknown section: %', p_section;
  end if;
end;
$function$;

-- ------------------------------------------------------------
-- update_shared_gig: a delegated grant for 'manager' should also let
-- someone save the lineup (bands), same as actually holding the
-- manager role.
-- ------------------------------------------------------------
create or replace function public.update_shared_gig(p_token uuid, p_updates jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_band jsonb;
  v_location text;
  v_is_owner boolean;
  v_has_manager_role boolean;
  v_has_manager_grant boolean;
  v_manager_claimed boolean;
  v_manager_invited boolean;
  v_wants_event_fields boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in required to edit';
  end if;

  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Invalid share link';
  end if;

  v_is_owner := (auth.uid() = v_show.owner_id);

  v_wants_event_fields := (
    p_updates ? 'event_name' or p_updates ? 'band_name' or p_updates ? 'venue' or
    p_updates ? 'date' or p_updates ? 'city' or p_updates ? 'state' or p_updates ? 'event_type'
  );

  if v_wants_event_fields and not v_is_owner then
    raise exception 'Only the owner can edit event details';
  end if;

  if p_updates ? 'bands' and not v_is_owner then
    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid() and invited_role = 'manager'
    ) into v_has_manager_role;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid()
        and 'manager' = any(granted_sections)
    ) into v_has_manager_grant;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and invited_role = 'manager'
    ) into v_manager_claimed;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and invited_role = 'manager'
    ) into v_manager_invited;

    if not v_has_manager_role and not v_has_manager_grant and (v_manager_claimed or not v_manager_invited) then
      raise exception 'You do not have permission to edit the lineup';
    end if;
  end if;

  if v_wants_event_fields then
    v_location := trim(both ', ' from concat_ws(', ', nullif(p_updates->>'city', ''), nullif(p_updates->>'state', '')));

    update public.shows set
      event_name = coalesce(p_updates->>'event_name', event_name),
      band_name = coalesce(nullif(p_updates->>'band_name', ''), band_name),
      venue = coalesce(p_updates->>'venue', venue),
      date = coalesce(nullif(p_updates->>'date', '')::date, date),
      city = coalesce(nullif(p_updates->>'city', ''), city),
      state = coalesce(nullif(p_updates->>'state', ''), state),
      location = coalesce(nullif(v_location, ''), location),
      event_type = coalesce(nullif(p_updates->>'event_type', ''), event_type)
    where id = v_show.id;
  end if;

  if p_updates ? 'bands' then
    delete from public.show_bands where show_id = v_show.id;
    for v_band in select * from jsonb_array_elements(p_updates->'bands')
    loop
      if coalesce(v_band->>'band_name', '') <> '' then
        insert into public.show_bands (
          show_id, role, sort_order, band_name, genre_tags, set_length_minutes,
          band_members, stage_plot_url, stage_plot_files, artist_fx_notes, general_notes,
          submitter_name, submitter_phone, submitter_email, submitter_card_user_id, requested_order
        )
        values (
          v_show.id,
          coalesce(nullif(v_band->>'role', ''), 'N/A'),
          coalesce((v_band->>'sort_order')::int, 0),
          v_band->>'band_name',
          coalesce(v_band->'genre_tags', '[]'::jsonb),
          nullif(v_band->>'set_length_minutes', '')::int,
          coalesce(v_band->'band_members', '[]'::jsonb),
          v_band->>'stage_plot_url',
          coalesce(v_band->'stage_plot_files', '[]'::jsonb),
          coalesce(v_band->'artist_fx_notes', '[]'::jsonb),
          v_band->>'general_notes',
          v_band->>'submitter_name',
          v_band->>'submitter_phone',
          v_band->>'submitter_email',
          nullif(v_band->>'submitter_card_user_id', '')::uuid,
          nullif(v_band->>'requested_order', '')::int
        );
      end if;
    end loop;
  end if;
end;
$function$;

grant execute on function public.get_gig_section_permissions(uuid) to anon, authenticated;
grant execute on function public.update_gig_section(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.update_shared_gig(uuid, jsonb) to anon, authenticated;
