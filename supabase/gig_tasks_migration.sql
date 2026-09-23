-- Gig Tasks: free-form, owner-created to-dos on a gig's board, each
-- pointed at one of the five profile sections (venue, promoter,
-- booking_agent, manager, engineer). Deliberately separate from
-- show_requirements, which is a structured per-section checklist (a
-- name/value/status triple like "Stage Plot" / confirmed) - a task like
-- "Book venues for East Coast leg" isn't a fact to confirm, it's an
-- action to go do, so it gets its own lightweight table instead of
-- overloading requirements with a second shape.
--
-- Same access model as show_requirements: RLS is enabled with zero
-- policies (deny-all direct table access), and every read/write goes
-- through the SECURITY DEFINER RPCs below, which carry out their own
-- permission checks.

create table if not exists public.gig_tasks (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  section text not null check (section = any (array['venue'::text, 'promoter'::text, 'booking_agent'::text, 'manager'::text, 'engineer'::text])),
  title text not null,
  status text not null default 'open' check (status = any (array['open'::text, 'done'::text])),
  created_by uuid references auth.users(id),
  completed_by uuid references auth.users(id),
  completed_at timestamp with time zone,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.gig_tasks enable row level security;

create index if not exists gig_tasks_show_id_idx on public.gig_tasks (show_id);

-- Only the gig owner can create a task and assign it to a section -
-- "owner creates, section holder completes" per the agreed design.
create or replace function public.add_gig_task(p_token uuid, p_section text, p_title text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_section text;
  v_new_row public.gig_tasks;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Gig not found';
  end if;

  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  if auth.uid() <> v_show.owner_id then
    raise exception 'Only the gig owner can add tasks';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'Task needs a title';
  end if;

  v_section := case when p_section = 'lighting' then 'engineer' else p_section end;

  insert into public.gig_tasks (show_id, section, title, created_by, sort_order)
  values (
    v_show.id, v_section, btrim(p_title), auth.uid(),
    (select coalesce(max(sort_order), -1) + 1 from public.gig_tasks where show_id = v_show.id and section = v_section)
  )
  returning * into v_new_row;

  return to_jsonb(v_new_row);
end;
$function$;

-- Marks a task done (or reopens it with p_done := false) - the owner, or
-- whoever can already edit that task's section (holds the role, or was
-- granted the section), mirroring update_show_requirement's permission
-- check exactly so "who can complete a task" always matches "who can
-- edit that profile".
create or replace function public.set_gig_task_status(p_token uuid, p_task_id uuid, p_done boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_task record;
  v_is_owner boolean;
  v_has_role boolean;
  v_role_claimed boolean;
  v_role_invited boolean;
  v_has_grant boolean;
  v_role_match text[];
  v_updated public.gig_tasks;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Gig not found';
  end if;

  select * into v_task from public.gig_tasks where id = p_task_id and show_id = v_show.id;
  if v_task is null then
    raise exception 'Task not found';
  end if;

  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  v_is_owner := (auth.uid() = v_show.owner_id);

  if not v_is_owner then
    if v_task.section in ('engineer', 'lighting') then
      v_role_match := array['engineer', 'lighting'];
    else
      v_role_match := array[v_task.section];
    end if;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid() and invited_role = any(v_role_match)
    ) into v_has_role;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and invited_role = any(v_role_match)
    ) into v_role_claimed;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and invited_role = any(v_role_match)
    ) into v_role_invited;

    select exists(
      select 1 from public.gig_invites
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid() and v_task.section = any(coalesce(granted_sections, '{}'))
    ) into v_has_grant;

    if not v_has_role and not v_has_grant and (v_role_claimed or not v_role_invited) then
      raise exception 'You do not have permission to complete this task';
    end if;
  end if;

  update public.gig_tasks set
    status = case when p_done then 'done' else 'open' end,
    completed_by = case when p_done then auth.uid() else null end,
    completed_at = case when p_done then now() else null end,
    updated_at = now()
  where id = p_task_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$function$;

-- Only the owner can remove a task outright (they're the only one who
-- can create one).
create or replace function public.delete_gig_task(p_token uuid, p_task_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Gig not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_show.owner_id then
    raise exception 'Only the gig owner can remove tasks';
  end if;

  delete from public.gig_tasks where id = p_task_id and show_id = v_show.id;
end;
$function$;

-- get_shared_gig, re-published with a `tasks` array alongside the
-- existing `requirements` array - additive only, every other field is
-- unchanged from the current live definition.
create or replace function public.get_shared_gig(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_bands jsonb;
  v_requirements jsonb;
  v_tasks jsonb;
  v_owner_name text;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    return null;
  end if;

  select up.display_name into v_owner_name
  from public.user_preferences up
  where up.user_id = v_show.owner_id;

  select coalesce(jsonb_agg(row_to_json(b) order by b.sort_order), '[]'::jsonb) into v_bands
  from (
    select
      sb.role, sb.band_name, sb.genre_tags, sb.set_length_minutes, sb.sort_order,
      sb.band_members, sb.stage_plot_url, sb.stage_plot_files, sb.artist_fx_notes, sb.general_notes,
      sb.submitter_name, sb.submitter_phone, sb.submitter_email, sb.requested_order,
      up.card_share_token as submitter_card_share_token,
      up.display_name as submitter_card_display_name
    from public.show_bands sb
    left join public.user_preferences up on up.user_id = sb.submitter_card_user_id
    where sb.show_id = v_show.id
    order by sb.sort_order
  ) b;

  select coalesce(jsonb_agg(row_to_json(r) order by r.section, r.sort_order), '[]'::jsonb) into v_requirements
  from (
    select id, section, name, value, status, note, sort_order, created_at, updated_at
    from public.show_requirements
    where show_id = v_show.id
    order by section, sort_order
  ) r;

  select coalesce(jsonb_agg(row_to_json(t) order by t.section, t.sort_order), '[]'::jsonb) into v_tasks
  from (
    select id, section, title, status, created_by, completed_by, completed_at, sort_order, created_at, updated_at
    from public.gig_tasks
    where show_id = v_show.id
    order by section, sort_order
  ) t;

  return jsonb_build_object(
    'id', v_show.id,
    'event_name', v_show.event_name,
    'band_name', v_show.band_name,
    'venue', v_show.venue,
    'date', v_show.date,
    'city', v_show.city,
    'state', v_show.state,
    'event_type', v_show.event_type,
    'bands', v_bands,
    'requirements', v_requirements,
    'tasks', v_tasks,
    'wifi_network', v_show.wifi_network,
    'wifi_password', v_show.wifi_password,
    'console', v_show.console,
    'power_notes', v_show.power_notes,
    'venue_checklist', v_show.venue_checklist,
    'venue_documents', v_show.venue_documents,
    'manager_info', v_show.manager_info,
    'promoter_info', v_show.promoter_info,
    'booking_agent_info', v_show.booking_agent_info,
    'engineer_info', v_show.engineer_info,
    'owner_id', v_show.owner_id,
    'owner_display_name', v_owner_name,
    'included_sections', v_show.included_sections
  );
end;
$function$;
