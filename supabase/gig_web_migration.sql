-- ============================================================
-- Migration: Gig Web (radial hub) + Venue full-profile page
-- Run this in Supabase SQL Editor AFTER schema.sql and the other
-- migrations already applied.
--
-- NOT YET APPLIED. Reviewed and staged locally only, per project
-- rule (see CLAUDE.md): every DDL/RPC change here waits for explicit
-- go-ahead before it's run against the live project.
-- ============================================================
--
-- Why this exists: the new Gig Web hub shows a per-role progress
-- ring for all 5 roles (the existing get_gigs_progress RPC only
-- covers 4 - no engineer). The Venue role's new "full profile" page
-- shows a constellation of that venue account's OTHER events, each
-- taggable with a user-customizable category (name + color, default
-- New/In Progress/Ready to Go, freely renamed/recolored/added/
-- removed) - nothing like that exists yet, so it's new tables/RPCs.

-- ------------------------------------------------------------
-- 1. get_gigs_progress: add an 'engineer' entry alongside the
--    existing venue/promoter/booking_agent/manager_band ones.
--    Everything else in this function is byte-for-byte unchanged -
--    this is purely additive.
-- ------------------------------------------------------------
create or replace function public.get_gigs_progress(p_show_ids uuid[])
returns table(show_id uuid, progress jsonb)
language sql
stable security definer
set search_path to 'public'
as $function$
  with invited_roles as (
    select gi.show_id, array_agg(distinct gi.invited_role) as roles
    from gig_invites gi
    where gi.show_id = any(p_show_ids)
    group by gi.show_id
  ),
  performer_stats as (
    select
      sb.show_id,
      bool_or(coalesce(sb.band_name, '') <> '') as has_band_name,
      bool_or(
        exists (
          select 1 from jsonb_array_elements(coalesce(sb.band_members, '[]'::jsonb)) m
          where coalesce(m->>'name', '') <> ''
        )
      ) as has_member,
      bool_or(coalesce(sb.stage_plot_url, '') <> '' or jsonb_array_length(coalesce(sb.stage_plot_files, '[]'::jsonb)) > 0) as has_stage_plot
    from show_bands sb
    where sb.show_id = any(p_show_ids)
    group by sb.show_id
  )
  select
    s.id as show_id,
    jsonb_build_object(
      'included_sections', to_jsonb(coalesce(s.included_sections, array['venue','promoter','booking_agent','manager','engineer'])),
      'venue', jsonb_build_object(
        'invited', coalesce('venue' = any(coalesce(s.included_sections, array['venue','promoter','booking_agent','manager','engineer'])), false) or coalesce('venue' = any(ir.roles), false),
        'percent', (
          (case when coalesce(s.wifi_network,'') <> '' then 1 else 0 end) +
          (case when coalesce(s.console,'') <> '' then 1 else 0 end) +
          (case when coalesce(s.power_notes,'') <> '' then 1 else 0 end)
        )::numeric / 3.0
      ),
      'promoter', jsonb_build_object(
        'invited', coalesce('promoter' = any(coalesce(s.included_sections, array['venue','promoter','booking_agent','manager','engineer'])), false) or coalesce('promoter' = any(ir.roles), false),
        'percent', (
          (case when coalesce(s.promoter_info->>'door_time','') <> '' then 1 else 0 end) +
          (case when coalesce(s.promoter_info->>'capacity','') <> '' then 1 else 0 end) +
          (case when coalesce(s.promoter_info->>'ticket_price','') <> '' then 1 else 0 end) +
          (case when coalesce(s.promoter_info->>'ticket_link','') <> '' then 1 else 0 end) +
          (case when coalesce(s.promoter_info->>'settlement_notes','') <> '' then 1 else 0 end)
        )::numeric / 5.0
      ),
      'booking_agent', jsonb_build_object(
        'invited', coalesce('booking_agent' = any(coalesce(s.included_sections, array['venue','promoter','booking_agent','manager','engineer'])), false) or coalesce('booking_agent' = any(ir.roles), false),
        'percent', (
          (case when coalesce(s.booking_agent_info->>'deal_terms','') <> '' then 1 else 0 end) +
          (case when coalesce(s.booking_agent_info->>'contract_status','') <> '' then 1 else 0 end) +
          (case when coalesce(s.booking_agent_info->>'agency_contact','') <> '' then 1 else 0 end)
        )::numeric / 3.0
      ),
      'manager_band', jsonb_build_object(
        'invited', true,
        'percent', (
          (case when coalesce(s.manager_info->>'contact_name','') <> '' then 1 else 0 end) +
          (case when coalesce(s.manager_info->>'contact_phone','') <> '' then 1 else 0 end) +
          (case when coalesce(s.manager_info->>'contact_email','') <> '' then 1 else 0 end) +
          (case when coalesce(s.manager_info->>'advancing_notes','') <> '' then 1 else 0 end) +
          (case when coalesce(s.manager_info->>'guest_list','') <> '' then 1 else 0 end) +
          (case when coalesce(ps.has_band_name, false) then 1 else 0 end) +
          (case when coalesce(ps.has_member, false) then 1 else 0 end) +
          (case when coalesce(ps.has_stage_plot, false) then 1 else 0 end)
        )::numeric / 8.0
      ),
      -- New: engineer_info covers both the "audio" and "lighting" roles,
      -- which share one section (see SharedGig's Audio/Lighting card) -
      -- so its 3 contact fields are counted across both, out of 6 total.
      'engineer', jsonb_build_object(
        'invited', coalesce('engineer' = any(coalesce(s.included_sections, array['venue','promoter','booking_agent','manager','engineer'])), false) or coalesce('engineer' = any(ir.roles), false) or coalesce('lighting' = any(ir.roles), false),
        'percent', (
          (case when coalesce(s.engineer_info->'audio'->>'contact_name','') <> '' then 1 else 0 end) +
          (case when coalesce(s.engineer_info->'audio'->>'contact_phone','') <> '' then 1 else 0 end) +
          (case when coalesce(s.engineer_info->'audio'->>'contact_email','') <> '' then 1 else 0 end) +
          (case when coalesce(s.engineer_info->'lighting'->>'contact_name','') <> '' then 1 else 0 end) +
          (case when coalesce(s.engineer_info->'lighting'->>'contact_phone','') <> '' then 1 else 0 end) +
          (case when coalesce(s.engineer_info->'lighting'->>'contact_email','') <> '' then 1 else 0 end)
        )::numeric / 6.0
      )
    ) as progress
  from shows s
  left join invited_roles ir on ir.show_id = s.id
  left join performer_stats ps on ps.show_id = s.id
  where s.id = any(p_show_ids);
$function$;

-- ------------------------------------------------------------
-- 2. venue_event_categories: a venue account's own list of
--    name+color categories for tagging its events, exactly like
--    user_preferences.genre_tags is a user's own list of genres -
--    same "one flat table scoped by owner" shape as saved_templates,
--    wallets, fellow_pilots elsewhere in this schema.
-- ------------------------------------------------------------
create table if not exists public.venue_event_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  label text not null,
  color text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.venue_event_categories is
  'A venue account''s own set of event categories (name + color), used to tag their other shows on the Gig Web Venue profile constellation. Freely renamed/recolored/added/removed by that account - not shared across accounts.';

alter table public.venue_event_categories enable row level security;

create policy "Users can view their own event categories"
  on public.venue_event_categories for select
  using (auth.uid() = user_id);

create policy "Users can insert their own event categories"
  on public.venue_event_categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own event categories"
  on public.venue_event_categories for update
  using (auth.uid() = user_id);

create policy "Users can delete their own event categories"
  on public.venue_event_categories for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 3. gig_invites.category_id: which category (from the accepting
--    venue account's own list above) this show falls under, from
--    that venue's point of view. Lives on the invite row (not on
--    shows) because the category is scoped to the venue account
--    that accepted the invite, not to the show itself.
-- ------------------------------------------------------------
alter table public.gig_invites
  add column if not exists category_id uuid references public.venue_event_categories(id) on delete set null;

-- ------------------------------------------------------------
-- 4. get_my_venue_events: the shows a signed-in user holds an
--    accepted 'venue' invite for (optionally excluding one show -
--    the one they're currently viewing the hub for). gig_invites
--    has no SELECT policy for the accepted invitee (only the show's
--    owner can see it directly), so this has to run as a security
--    definer, same pattern as get_shared_gig / get_gig_section_permissions.
-- ------------------------------------------------------------
create or replace function public.get_my_venue_events(p_exclude_show_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select coalesce(jsonb_agg(row_to_json(e) order by e.date desc nulls last), '[]'::jsonb)
  into v_result
  from (
    select
      s.id as show_id,
      s.event_name,
      s.venue,
      s.date,
      s.city,
      s.state,
      s.share_token,
      gi.id as invite_id,
      gi.category_id
    from public.gig_invites gi
    join public.shows s on s.id = gi.show_id
    where gi.invited_role = 'venue'
      and gi.status = 'accepted'
      and gi.accepted_by = auth.uid()
      and (p_exclude_show_id is null or s.id <> p_exclude_show_id)
  ) e;

  return v_result;
end;
$function$;

-- ------------------------------------------------------------
-- 5. set_gig_invite_category: lets the accepted venue invitee tag
--    one of their events with one of their own categories (or clear
--    it with a null p_category_id). Same reasoning as above - the
--    invitee has no direct UPDATE access to gig_invites, so this
--    goes through a security definer that checks ownership itself.
-- ------------------------------------------------------------
create or replace function public.set_gig_invite_category(p_invite_id uuid, p_category_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.venue_event_categories
    where id = p_category_id and user_id = auth.uid()
  ) then
    raise exception 'Invalid category';
  end if;

  update public.gig_invites
  set category_id = p_category_id
  where id = p_invite_id and accepted_by = auth.uid();
end;
$function$;

grant execute on function public.get_my_venue_events(uuid) to authenticated;
grant execute on function public.set_gig_invite_category(uuid, uuid) to authenticated;
