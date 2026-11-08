-- Job 265 (2026-11-08): the engineer's own additional services. In Settings >
-- Customize an engineer adds services (e.g. "Video recording"), each asked as
-- a Yes / No on their intake links that include additional services, next to
-- the built-in multi-track question.
--
--   user_preferences.extra_services   [{ "id", "label", "question" }]
--   tour_manager_requests / opener_requests.service_answers   [{ "label", "answer" }]
--   show_act_services.services        same, kept with the event (job 263)
--
-- get_tour_manager_request / get_opener_request return the engineer's list as
-- extra_services when the link includes services. The submit functions keep
-- the answers (label + Yes / No, at most 20) on the request and with the event.
-- All four functions are patched in place from their live definitions.

alter table public.user_preferences add column if not exists extra_services jsonb not null default '[]'::jsonb;
alter table public.tour_manager_requests add column if not exists service_answers jsonb not null default '[]'::jsonb;
alter table public.opener_requests add column if not exists service_answers jsonb not null default '[]'::jsonb;
alter table public.show_act_services add column if not exists services jsonb not null default '[]'::jsonb;
alter table public.show_act_services alter column multitrack_interest drop not null;

do $do$
declare
  d text;
  n text;
  calc constant text := $a$    v_multitrack := (p_form->>'multitrack_interest')::boolean;
  end if;

  -- The engineer's own services (job 265): [{label, answer}] Yes / No answers.
  if v_request.include_services and jsonb_typeof(p_form->'service_answers') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('label', left(btrim(q.x->>'label'), 80), 'answer', (q.x->>'answer')::boolean)), '[]'::jsonb)
      into v_services
      from (select x from jsonb_array_elements(p_form->'service_answers') x
             where jsonb_typeof(x) = 'object' and coalesce(btrim(x->>'label'), '') <> '' and x->>'answer' in ('true', 'false')
             limit 20) q;
  end if;$a$;
begin
  -- get_tour_manager_request: the engineer's services list.
  d := pg_get_functiondef('public.get_tour_manager_request(uuid)'::regprocedure);
  n := replace(d, $a$  v_pic := v_pic || jsonb_build_object('engineer', v_eng);$a$,
    $a$  v_pic := v_pic || jsonb_build_object('engineer', v_eng);
  -- The engineer's own services, asked when the link includes services (job 265).
  v_pic := v_pic || jsonb_build_object('extra_services', case when r.include_services
    then coalesce((select e.extra_services from public.user_preferences e where e.user_id = r.engineer_user_id), '[]'::jsonb)
    else '[]'::jsonb end);$a$);
  if n = d then raise exception 'get_tour_manager_request patch did not apply'; end if;
  execute n;

  -- get_opener_request: same.
  d := pg_get_functiondef('public.get_opener_request(uuid)'::regprocedure);
  n := replace(d, $a$    'include_services', o.include_services,$a$,
    $a$    'include_services', o.include_services,
    'extra_services', case when o.include_services then coalesce(e.extra_services, '[]'::jsonb) else '[]'::jsonb end,$a$);
  if n = d then raise exception 'get_opener_request patch did not apply'; end if;
  execute n;

  -- submit_opener_request
  d := pg_get_functiondef('public.submit_opener_request(uuid,jsonb)'::regprocedure);
  n := replace(d, $a$  v_multitrack boolean;$a$, $a$  v_multitrack boolean;
  v_services jsonb := '[]'::jsonb;$a$);
  n := replace(n, $a$    v_multitrack := (p_form->>'multitrack_interest')::boolean;
  end if;$a$, calc);
  n := replace(n, $a$      multitrack_interest = v_multitrack
  where id = v_request.id;$a$, $a$      multitrack_interest = v_multitrack,
      service_answers = v_services
  where id = v_request.id;$a$);
  n := replace(n, $a$  if v_multitrack is not null then
    insert into public.show_act_services (show_id, band_name, role, multitrack_interest, source)
    values (v_show_id, p_form->>'band_name', v_role, v_multitrack, 'opener');$a$, $a$  if v_multitrack is not null or jsonb_array_length(v_services) > 0 then
    insert into public.show_act_services (show_id, band_name, role, multitrack_interest, services, source)
    values (v_show_id, p_form->>'band_name', v_role, v_multitrack, v_services, 'opener');$a$);
  if (length(n) - length(replace(n, 'v_services', ''))) / length('v_services') < 5 then
    raise exception 'submit_opener_request patch did not fully apply';
  end if;
  execute n;

  -- submit_tour_manager_request
  d := pg_get_functiondef('public.submit_tour_manager_request(uuid,jsonb)'::regprocedure);
  n := replace(d, $a$  v_multitrack boolean;$a$, $a$  v_multitrack boolean;
  v_services jsonb := '[]'::jsonb;$a$);
  n := replace(n, $a$    v_multitrack := (p_form->>'multitrack_interest')::boolean;
  end if;$a$, calc);
  n := replace(n, $a$      multitrack_interest = v_multitrack
  where id = v_request.id;$a$, $a$      multitrack_interest = v_multitrack,
      service_answers = v_services
  where id = v_request.id;$a$);
  n := replace(n, $a$  if v_multitrack is not null then
    insert into public.show_act_services (show_id, band_name, role, multitrack_interest, source)
    values (v_show_id, p_form->>'band_name', v_role, v_multitrack, 'headliner');$a$, $a$  if v_multitrack is not null or jsonb_array_length(v_services) > 0 then
    insert into public.show_act_services (show_id, band_name, role, multitrack_interest, services, source)
    values (v_show_id, p_form->>'band_name', v_role, v_multitrack, v_services, 'headliner');$a$);
  n := replace(n, $a$    if v_pending_opener.multitrack_interest is not null then
      insert into public.show_act_services (show_id, band_name, role, multitrack_interest, source)
      values (v_show_id, v_pending_opener.band_name, v_pending_opener.role, v_pending_opener.multitrack_interest, 'opener');$a$, $a$    if v_pending_opener.multitrack_interest is not null or jsonb_array_length(coalesce(v_pending_opener.service_answers, '[]'::jsonb)) > 0 then
      insert into public.show_act_services (show_id, band_name, role, multitrack_interest, services, source)
      values (v_show_id, v_pending_opener.band_name, v_pending_opener.role, v_pending_opener.multitrack_interest, coalesce(v_pending_opener.service_answers, '[]'::jsonb), 'opener');$a$);
  if (length(n) - length(replace(n, 'v_services', ''))) / length('v_services') < 5
     or position('v_pending_opener.service_answers' in n) = 0 then
    raise exception 'submit_tour_manager_request patch did not fully apply';
  end if;
  execute n;
end
$do$;
