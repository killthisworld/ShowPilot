-- Job 435: the 3D stage an LD sent with a lighting intake link goes on the
-- event when the act submits (the event the link was made for, or the one
-- the submission creates). It replaces the event's stage: the one sent is
-- the one the LD chose for this show. The link's own bookkeeping (stage_id)
-- is left off.
-- Patches the live submit_tour_manager_request in place: one line added
-- before its final return.

do $mig$
declare
  def text := pg_get_functiondef('public.submit_tour_manager_request(uuid, jsonb)'::regprocedure);
  anchor text := E'  return v_show_id;\nend;';
  addition text := E'  -- The 3D stage the LD sent with the link (job 435) goes on the event.\n'
    || E'  if jsonb_typeof(v_request.lighting_rig) = ''object'' and jsonb_array_length(coalesce(v_request.lighting_rig->''items'', ''[]''::jsonb)) > 0 then\n'
    || E'    update public.shows set lighting_rig = v_request.lighting_rig - ''stage_id'', updated_at = now() where id = v_show_id;\n'
    || E'  end if;\n\n';
begin
  if position('job 435' in def) > 0 then
    raise notice 'already applied';
    return;
  end if;
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'submit_tour_manager_request: the final return was not found exactly once';
  end if;
  execute replace(def, anchor, addition || anchor);
end
$mig$;
