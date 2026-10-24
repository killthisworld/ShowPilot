-- ============================================================
-- Migration: task window (do the task right there, submit, claim & save)
-- ============================================================
--
-- A bulletin board task opens its own window: a summary plus a "Do it here"
-- area that depends on the task's kind, a Submit & mark done button, and
-- Claim & save for later (the existing claim; claimed tasks live in My tasks).
--
--   gig_tasks.kind        'plain' (default) | 'upload' | 'answer' | 'checklist'
--   gig_tasks.spec        what the task asks for:
--                           answer:    { "questions": [{ "id", "label", "type": text|yesno|time|date|number }] }
--                           checklist: { "items": [{ "id", "text" }] }
--   gig_tasks.submission  what was handed in:
--                           { "files": [{ "name", "url", "size", "type" }], "answers": { id: value },
--                             "checks": { id: true }, "note", "submitted_by", "submitted_at" }
--
-- New functions (same access model as the rest of gig_tasks: SECURITY
-- DEFINER, own checks, no table policies):
--   get_gig_task(token, task)           full task for the window; the submission
--                                       only for people on the event
--   set_gig_task_setup(token, task, kind, spec)   owner sets what the task asks for
--   submit_gig_task(token, task, submission)       hand it in + mark done; who may:
--                                       exactly who may mark it done today
--
-- Files go to the input-files bucket (like event Documents) under
-- <uid>/task-files/<task id>/; submitted links must point at this project's
-- storage.

alter table public.gig_tasks add column if not exists kind text not null default 'plain';
alter table public.gig_tasks add column if not exists spec jsonb not null default '{}'::jsonb;
alter table public.gig_tasks add column if not exists submission jsonb;

do $$ begin
  alter table public.gig_tasks add constraint gig_tasks_kind_check check (kind in ('plain', 'upload', 'answer', 'checklist'));
exception when duplicate_object then null; end $$;

-- Is the signed-in user on this event (owner, accepted invite, or linked)?
create or replace function public.is_on_gig(p_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.uid() is not null and (
    exists (select 1 from public.shows s where s.id = p_show_id and s.owner_id = auth.uid())
    or exists (select 1 from public.gig_invites gi where gi.show_id = p_show_id and gi.status = 'accepted' and gi.accepted_by = auth.uid())
    or exists (select 1 from public.linked_gigs lg join public.shows s on s.share_token = lg.share_token where s.id = p_show_id and lg.user_id = auth.uid())
  );
$function$;

revoke all on function public.is_on_gig(uuid) from public, anon;
grant execute on function public.is_on_gig(uuid) to authenticated;

create or replace function public.get_gig_task(p_token uuid, p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_out jsonb;
  v_can_see boolean;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    return null;
  end if;

  v_can_see := public.is_on_gig(v_show.id);

  select to_jsonb(t) - 'submission'
    || jsonb_build_object(
      'created_by_name', cb.display_name,
      'claimed_by_name', cl.display_name,
      'has_submission', t.submission is not null,
      'submission', case when v_can_see then t.submission else null end,
      'submitted_by_name', sb.display_name
    )
  into v_out
  from public.gig_tasks t
  left join public.user_preferences cb on cb.user_id = t.created_by
  left join public.user_preferences cl on cl.user_id = t.claimed_by
  left join public.user_preferences sb on sb.user_id = nullif(t.submission->>'submitted_by', '')::uuid
  where t.id = p_task_id and t.show_id = v_show.id;

  return v_out;
end;
$function$;

revoke all on function public.get_gig_task(uuid, uuid) from public;
grant execute on function public.get_gig_task(uuid, uuid) to anon, authenticated;

-- Owner sets what the task asks for. Unknown fields are dropped; sizes capped.
create or replace function public.set_gig_task_setup(p_token uuid, p_task_id uuid, p_kind text, p_spec jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_spec jsonb := '{}'::jsonb;
  v_updated public.gig_tasks;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    raise exception 'Gig not found';
  end if;
  if auth.uid() is null or auth.uid() <> v_show.owner_id then
    raise exception 'Only the event owner can set up a task';
  end if;
  if p_kind not in ('plain', 'upload', 'answer', 'checklist') then
    raise exception 'Unknown task kind';
  end if;

  if p_kind = 'answer' then
    v_spec := jsonb_build_object('questions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', left(coalesce(nullif(q->>'id', ''), md5(random()::text)), 40),
          'label', left(btrim(q->>'label'), 200),
          'type', case when q->>'type' in ('text', 'yesno', 'time', 'date', 'number') then q->>'type' else 'text' end
        ) order by ord)
      from jsonb_array_elements(coalesce(p_spec->'questions', '[]'::jsonb)) with ordinality as x(q, ord)
      where coalesce(btrim(q->>'label'), '') <> '' and ord <= 12
    ), '[]'::jsonb));
    if jsonb_array_length(v_spec->'questions') = 0 then
      raise exception 'Add at least one question';
    end if;
  elsif p_kind = 'checklist' then
    v_spec := jsonb_build_object('items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', left(coalesce(nullif(i->>'id', ''), md5(random()::text)), 40),
          'text', left(btrim(i->>'text'), 200)
        ) order by ord)
      from jsonb_array_elements(coalesce(p_spec->'items', '[]'::jsonb)) with ordinality as x(i, ord)
      where coalesce(btrim(i->>'text'), '') <> '' and ord <= 25
    ), '[]'::jsonb));
    if jsonb_array_length(v_spec->'items') = 0 then
      raise exception 'Add at least one item';
    end if;
  end if;

  update public.gig_tasks set kind = p_kind, spec = v_spec, updated_at = now()
  where id = p_task_id and show_id = v_show.id
  returning * into v_updated;
  if v_updated is null then
    raise exception 'Task not found';
  end if;
  return to_jsonb(v_updated);
end;
$function$;

revoke all on function public.set_gig_task_setup(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.set_gig_task_setup(uuid, uuid, text, jsonb) to authenticated;

-- Hand the task in and mark it done. Who may: exactly who may mark it done
-- (set_gig_task_status). A task someone else has claimed can't be handed in
-- by another person (the owner can). Checks what the kind needs.
create or replace function public.submit_gig_task(p_token uuid, p_task_id uuid, p_submission jsonb)
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
  v_has_grant boolean;
  v_role_match text[];
  v_files jsonb;
  v_answers jsonb;
  v_checks jsonb;
  v_note text;
  v_prefix constant text := 'https://tbskirwlveqbjqyvtpiz.supabase.co/storage/v1/object/public/';
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
      where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid() and v_task.section = any(coalesce(granted_sections, '{}'))
    ) into v_has_grant;
    if not v_has_role and not v_has_grant then
      raise exception 'You do not have permission to complete this task';
    end if;
    if v_task.claimed_by is not null and v_task.claimed_by <> auth.uid() then
      raise exception 'Already claimed by someone else';
    end if;
  end if;
  if v_task.status = 'done' then
    raise exception 'This task is already done';
  end if;

  -- Files: only links into this project's storage, at most 20.
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', left(coalesce(f->>'name', 'file'), 200),
      'url', f->>'url',
      'size', case when (f->>'size') ~ '^[0-9]+$' then (f->>'size')::bigint else null end,
      'type', left(coalesce(f->>'type', ''), 100)
    ) order by ord), '[]'::jsonb)
  into v_files
  from jsonb_array_elements(case when jsonb_typeof(p_submission->'files') = 'array' then p_submission->'files' else '[]'::jsonb end) with ordinality as x(f, ord)
  where ord <= 20 and left(coalesce(f->>'url', ''), length(v_prefix)) = v_prefix;

  v_answers := case when jsonb_typeof(p_submission->'answers') = 'object' then p_submission->'answers' else '{}'::jsonb end;
  v_checks := case when jsonb_typeof(p_submission->'checks') = 'object' then p_submission->'checks' else '{}'::jsonb end;
  v_note := nullif(left(btrim(coalesce(p_submission->>'note', '')), 2000), '');

  if v_task.kind = 'upload' and jsonb_array_length(v_files) = 0 then
    raise exception 'Add at least one file';
  end if;
  if v_task.kind = 'answer' and exists (
    select 1 from jsonb_array_elements(coalesce(v_task.spec->'questions', '[]'::jsonb)) q
    where coalesce(btrim(v_answers->>(q->>'id')), '') = ''
  ) then
    raise exception 'Answer every question';
  end if;
  if v_task.kind = 'checklist' and exists (
    select 1 from jsonb_array_elements(coalesce(v_task.spec->'items', '[]'::jsonb)) i
    where coalesce((v_checks->>(i->>'id'))::boolean, false) = false
  ) then
    raise exception 'Check off every item';
  end if;

  update public.gig_tasks set
    submission = jsonb_build_object(
      'files', v_files,
      'answers', (select coalesce(jsonb_object_agg(k, left(v, 500)), '{}'::jsonb) from jsonb_each_text(v_answers) as a(k, v)),
      'checks', v_checks,
      'note', v_note,
      'submitted_by', auth.uid(),
      'submitted_at', now()
    ),
    status = 'done',
    completed_by = auth.uid(),
    completed_at = now(),
    claimed_by = coalesce(claimed_by, auth.uid()),
    claimed_at = coalesce(claimed_at, now()),
    updated_at = now()
  where id = p_task_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$function$;

revoke all on function public.submit_gig_task(uuid, uuid, jsonb) from public, anon;
grant execute on function public.submit_gig_task(uuid, uuid, jsonb) to authenticated;
