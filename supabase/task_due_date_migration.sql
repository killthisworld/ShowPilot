-- Job 65: the event owner can set, change or clear a task's due date after
-- the task is made (phone quick-add could only set one at creation).
-- Same owner-only check as set_gig_task_details. p_due_date null clears it.
-- Safe to run more than once.

create or replace function public.set_gig_task_due_date(p_token uuid, p_task_id uuid, p_due_date date default null)
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
    raise exception 'Only the event owner can change a due date (permission)';
  end if;

  update public.gig_tasks set
    due_date = p_due_date,
    updated_at = now()
  where id = p_task_id and show_id = v_show.id
  returning * into v_updated;

  if v_updated is null then
    raise exception 'Task not found';
  end if;
  return to_jsonb(v_updated);
end;
$function$;

revoke all on function public.set_gig_task_due_date(uuid, uuid, date) from public, anon;
grant execute on function public.set_gig_task_due_date(uuid, uuid, date) to authenticated;
