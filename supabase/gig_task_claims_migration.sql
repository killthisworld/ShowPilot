-- ============================================================
-- Migration: task details + claiming (bulletin board task summaries)
-- ============================================================
--
-- Every bulletin board task opens a summary: what needs doing (details the
-- event owner writes), which profile it's for, who added it and when, the
-- due date, and who has claimed it. Whoever can mark a task done can claim
-- it (one person per task) and let it go again; the event owner can always
-- release a claim. Claimed tasks show first on that profile's
-- "Current tasks" node.
--
-- Same access model as the rest of gig_tasks: no table policies, every
-- read/write goes through SECURITY DEFINER functions with their own checks.

alter table public.gig_tasks add column if not exists details text;
alter table public.gig_tasks add column if not exists claimed_by uuid references auth.users(id) on delete set null;
alter table public.gig_tasks add column if not exists claimed_at timestamp with time zone;

-- Owner writes or clears a task's details (what needs doing). Empty = none.
create or replace function public.set_gig_task_details(p_token uuid, p_task_id uuid, p_details text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_updated public.gig_tasks;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Gig not found';
  end if;
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;
  if auth.uid() <> v_show.owner_id then
    raise exception 'Only the event owner can edit task details';
  end if;

  update public.gig_tasks set
    details = nullif(left(btrim(coalesce(p_details, '')), 2000), ''),
    updated_at = now()
  where id = p_task_id and show_id = v_show.id
  returning * into v_updated;

  if v_updated is null then
    raise exception 'Task not found';
  end if;
  return to_jsonb(v_updated);
end;
$function$;

-- Claim (p_claim = true) or let go of (false) a task. Who may claim is
-- exactly who may mark it done (set_gig_task_status's check). One person
-- per task: a task someone else holds can't be claimed. Letting go: the
-- person who holds it, or the event owner.
create or replace function public.claim_gig_task(p_token uuid, p_task_id uuid, p_claim boolean default true)
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
  v_holder text;
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

  if not p_claim then
    if v_task.claimed_by is null then
      return to_jsonb(v_task);
    end if;
    if v_task.claimed_by <> auth.uid() and not v_is_owner then
      raise exception 'Only the person who claimed this task can let it go';
    end if;
    update public.gig_tasks set claimed_by = null, claimed_at = null, updated_at = now()
    where id = p_task_id
    returning * into v_updated;
    return to_jsonb(v_updated);
  end if;

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
      raise exception 'You do not have permission to claim this task';
    end if;
  end if;

  if v_task.status = 'done' then
    raise exception 'This task is already done';
  end if;

  if v_task.claimed_by is not null and v_task.claimed_by <> auth.uid() then
    select display_name into v_holder from public.user_preferences where user_id = v_task.claimed_by;
    raise exception 'Already claimed by %', coalesce(nullif(v_holder, ''), 'someone else');
  end if;

  update public.gig_tasks set
    claimed_by = auth.uid(),
    claimed_at = coalesce(v_task.claimed_at, now()),
    updated_at = now()
  where id = p_task_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$function$;

revoke all on function public.set_gig_task_details(uuid, uuid, text) from public, anon;
revoke all on function public.claim_gig_task(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_gig_task_details(uuid, uuid, text) to authenticated;
grant execute on function public.claim_gig_task(uuid, uuid, boolean) to authenticated;

-- get_shared_gig: same as before, plus each task's due date, details, who
-- claimed it (and when), and the display names of who added and claimed it.
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
    select gt.id, gt.section, gt.title, gt.status, gt.created_by, gt.completed_by, gt.completed_at,
      gt.sort_order, gt.created_at, gt.updated_at, gt.due_date, gt.details, gt.claimed_by, gt.claimed_at,
      cb.display_name as created_by_name,
      cl.display_name as claimed_by_name
    from public.gig_tasks gt
    left join public.user_preferences cb on cb.user_id = gt.created_by
    left join public.user_preferences cl on cl.user_id = gt.claimed_by
    where gt.show_id = v_show.id
    order by gt.section, gt.sort_order
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
    'icon_url', v_show.icon_url,
    'bands', v_bands,
    'requirements', v_requirements,
    'tasks', v_tasks,
    'wifi_network', v_show.wifi_network,
    'wifi_password', v_show.wifi_password,
    'console', v_show.console,
    'power_notes', v_show.power_notes,
    'venue_checklist', v_show.venue_checklist,
    'venue_documents', v_show.venue_documents,
    'venue_info', v_show.venue_info,
    'manager_info', v_show.manager_info,
    'promoter_info', v_show.promoter_info,
    'booking_agent_info', v_show.booking_agent_info,
    'engineer_info', v_show.engineer_info,
    'owner_id', v_show.owner_id,
    'owner_display_name', v_owner_name,
    'included_sections', v_show.included_sections,
    'done', v_show.done
  );
end;
$function$;
