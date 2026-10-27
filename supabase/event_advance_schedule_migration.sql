-- The venue's advance schedule (job 185, piece 3, 2026-10-27).
--
-- A venue template can carry steps that go out on their own, counted from
-- the show date: a message in the event's Mgmt / Artist room, a task for
-- Mgmt / Artist, or the event link email to the act's contact. Loading the
-- template onto an event schedules them here; the venue can change or skip
-- each one on the event's Advance schedule page.
--
-- 1. event_advance_steps: one row per scheduled step. Only the functions
--    below and the edge function run-advance-steps (service role) touch it.
-- 2. schedule_event_advance(show, steps): add steps (venue side only). A
--    step already on the event (same step id, not skipped) isn't added twice.
-- 3. get_event_advance(show): the event's steps for the venue side.
-- 4. update_event_advance(id, ...): change the text / time, skip, or put a
--    skipped step back. Only steps that haven't gone out.
-- 5. claim_due_advance_steps(): for the edge function. Marks the due steps
--    'sending' and returns them (service role only).
-- 6. pg_cron runs run-advance-steps every 15 minutes, with the same
--    x-cron-secret the fan countdown uses (vault: digest_cron_secret).
-- Safe to run more than once.

create table if not exists public.event_advance_steps (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  created_by uuid not null,
  step_id text not null,
  how text not null check (how in ('chat', 'task', 'email')),
  title text not null default '',
  body text not null default '',
  send_at timestamptz not null,
  only_if_incomplete boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'skipped', 'failed')),
  result text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_advance_steps_show_idx on public.event_advance_steps (show_id, send_at);
create index if not exists event_advance_steps_due_idx on public.event_advance_steps (send_at) where status = 'scheduled';
alter table public.event_advance_steps enable row level security;
revoke all on public.event_advance_steps from anon, authenticated;

-- Venue side of the event (same rule as the deal and the event link).
create or replace function public.advance_can_manage(p_show uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((public.biz_access(p_show)->>'venue')::boolean, false);
$function$;
revoke all on function public.advance_can_manage(uuid) from public, anon;
grant execute on function public.advance_can_manage(uuid) to authenticated;

create or replace function public.get_event_advance(p_show uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.advance_can_manage(p_show) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'step_id', s.step_id, 'how', s.how, 'title', s.title, 'body', s.body,
      'send_at', s.send_at, 'only_if_incomplete', s.only_if_incomplete, 'status', s.status,
      'result', s.result, 'sent_at', s.sent_at
    ) order by s.send_at, s.created_at)
    from public.event_advance_steps s where s.show_id = p_show
  ), '[]'::jsonb);
end;
$function$;
revoke all on function public.get_event_advance(uuid) from public, anon;
grant execute on function public.get_event_advance(uuid) to authenticated;

-- p_steps: [{ step_id, how, title, body, send_at, only_if_incomplete }]
create or replace function public.schedule_event_advance(p_show uuid, p_steps jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_step jsonb;
  v_added int := 0;
  v_skipped int := 0;
  v_at timestamptz;
  v_how text;
  v_id text;
begin
  if auth.uid() is null or not public.advance_can_manage(p_show) then
    raise exception 'Only the venue side of this event can schedule its advance';
  end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) > 30 then
    raise exception 'Up to 30 steps at a time';
  end if;
  for v_step in select * from jsonb_array_elements(p_steps)
  loop
    v_how := v_step->>'how';
    v_id := left(coalesce(nullif(btrim(v_step->>'step_id'), ''), md5(random()::text)), 60);
    begin
      v_at := (v_step->>'send_at')::timestamptz;
    exception when others then
      v_at := null;
    end;
    if v_how not in ('chat', 'task', 'email') or v_at is null or v_at < now() - interval '5 minutes'
       or exists (select 1 from public.event_advance_steps where show_id = p_show and step_id = v_id and status <> 'skipped') then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.event_advance_steps (show_id, created_by, step_id, how, title, body, send_at, only_if_incomplete)
    values (p_show, auth.uid(), v_id, v_how, left(coalesce(v_step->>'title', ''), 200), left(coalesce(v_step->>'body', ''), 4000),
            v_at, coalesce((v_step->>'only_if_incomplete')::boolean, false));
    v_added := v_added + 1;
  end loop;
  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end;
$function$;
revoke all on function public.schedule_event_advance(uuid, jsonb) from public, anon;
grant execute on function public.schedule_event_advance(uuid, jsonb) to authenticated;

-- p_status: null (leave), 'skipped' or 'scheduled' (put back).
create or replace function public.update_event_advance(p_id uuid, p_title text default null, p_body text default null, p_send_at timestamptz default null, p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.event_advance_steps;
begin
  select * into v_row from public.event_advance_steps where id = p_id;
  if v_row is null then
    raise exception 'Step not found';
  end if;
  if auth.uid() is null or not public.advance_can_manage(v_row.show_id) then
    raise exception 'Only the venue side of this event can change its advance';
  end if;
  if v_row.status not in ('scheduled', 'skipped', 'failed') then
    raise exception 'That step has already gone out';
  end if;
  if p_status is not null and p_status not in ('scheduled', 'skipped') then
    raise exception 'Unknown status';
  end if;
  update public.event_advance_steps set
    title = coalesce(left(p_title, 200), title),
    body = coalesce(left(p_body, 4000), body),
    send_at = coalesce(p_send_at, send_at),
    status = coalesce(p_status, status),
    result = case when p_status = 'scheduled' then null else result end,
    updated_at = now()
  where id = p_id
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;
revoke all on function public.update_event_advance(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.update_event_advance(uuid, text, text, timestamptz, text) to authenticated;

-- For the edge function: take the due steps (up to 50) so two runs can't
-- both send one. A step left 'sending' for an hour (a crashed run) is
-- picked up again.
create or replace function public.claim_due_advance_steps()
returns setof public.event_advance_steps
language sql
security definer
set search_path to 'public'
as $function$
  update public.event_advance_steps s set status = 'sending', updated_at = now()
  where s.id in (
    select id from public.event_advance_steps
    where (status = 'scheduled' and send_at <= now())
       or (status = 'sending' and updated_at < now() - interval '1 hour')
    order by send_at
    limit 50
    for update skip locked
  )
  returning s.*;
$function$;
revoke all on function public.claim_due_advance_steps() from public, anon, authenticated;
grant execute on function public.claim_due_advance_steps() to service_role;

-- Every 15 minutes.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'run-advance-steps') then
    perform cron.unschedule('run-advance-steps');
  end if;
end $$;
select cron.schedule(
  'run-advance-steps',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://tbskirwlveqbjqyvtpiz.supabase.co/functions/v1/run-advance-steps',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
