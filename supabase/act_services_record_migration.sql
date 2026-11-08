-- Job 263 (2026-11-08): keep a record of each act's multi-track answer with the
-- event. The answer lived only on the intake request (tour_manager_requests /
-- opener_requests .multitrack_interest), so clearing Manage Links lost it.
-- Now each submitted answer is also written to show_act_services, tied to the
-- event and the act's name. Lineup edits (which rebuild show_bands) and
-- clearing links don't touch it; deleting the event does.
--
-- The two submit functions are patched in place from their live definitions
-- (only the record inserts are added), and existing answers on requests that
-- haven't been cleared yet are copied in.

create table if not exists public.show_act_services (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  band_name text,
  role text,
  multitrack_interest boolean not null,
  source text, -- 'headliner' | 'opener' | 'backfill'
  created_at timestamptz not null default now()
);
create index if not exists show_act_services_show_idx on public.show_act_services (show_id);

alter table public.show_act_services enable row level security;
drop policy if exists "Show owner reads act services" on public.show_act_services;
create policy "Show owner reads act services" on public.show_act_services
  for select to authenticated
  using (exists (select 1 from public.shows s where s.id = show_id and s.owner_id = auth.uid()));
revoke all on public.show_act_services from anon;
grant select on public.show_act_services to authenticated;

do $do$
declare
  d text;
  n text;
begin
  -- Opener: record the answer once the act is on an event.
  d := pg_get_functiondef('public.submit_opener_request(uuid,jsonb)'::regprocedure);
  n := replace(d, $a$    nullif(p_form->>'requested_order', '')::int
  );
end;$a$, $a$    nullif(p_form->>'requested_order', '')::int
  );

  -- Keep the multi-track answer with the event (job 263).
  if v_multitrack is not null then
    insert into public.show_act_services (show_id, band_name, role, multitrack_interest, source)
    values (v_show_id, p_form->>'band_name', v_role, v_multitrack, 'opener');
  end if;
end;$a$);
  if n = d then raise exception 'submit_opener_request patch did not apply'; end if;
  execute n;

  -- Headliner: record theirs, and openers who answered before the event existed.
  d := pg_get_functiondef('public.submit_tour_manager_request(uuid,jsonb)'::regprocedure);
  n := replace(d, $a$      v_pending_opener.requested_order
    );
  end loop;$a$, $a$      v_pending_opener.requested_order
    );
    if v_pending_opener.multitrack_interest is not null then
      insert into public.show_act_services (show_id, band_name, role, multitrack_interest, source)
      values (v_show_id, v_pending_opener.band_name, v_pending_opener.role, v_pending_opener.multitrack_interest, 'opener');
    end if;
  end loop;$a$);
  if n = d then raise exception 'submit_tour_manager_request opener-loop patch did not apply'; end if;
  d := n;
  n := replace(d, $a$  update public.tour_manager_requests
  set status = 'submitted',$a$, $a$  -- Keep the multi-track answer with the event (job 263).
  if v_multitrack is not null then
    insert into public.show_act_services (show_id, band_name, role, multitrack_interest, source)
    values (v_show_id, p_form->>'band_name', v_role, v_multitrack, 'headliner');
  end if;

  update public.tour_manager_requests
  set status = 'submitted',$a$);
  if n = d then raise exception 'submit_tour_manager_request patch did not apply'; end if;
  execute n;
end
$do$;

-- Answers still on requests that haven't been cleared.
insert into public.show_act_services (show_id, band_name, role, multitrack_interest, source, created_at)
select s.id, t.band_name, null, t.multitrack_interest, 'backfill', coalesce(t.created_at, now())
from public.tour_manager_requests t
join public.shows s on s.id = coalesce(t.created_show_id, t.target_show_id)
where t.status = 'submitted' and t.multitrack_interest is not null
  and not exists (select 1 from public.show_act_services x where x.show_id = s.id and coalesce(x.band_name, '') = coalesce(t.band_name, ''));

insert into public.show_act_services (show_id, band_name, role, multitrack_interest, source, created_at)
select s.id, o.band_name, o.role, o.multitrack_interest, 'backfill', coalesce(o.submitted_at, now())
from public.opener_requests o
join public.tour_manager_requests t on t.id = o.tour_manager_request_id
join public.shows s on s.id = coalesce(t.created_show_id, t.target_show_id)
where o.status = 'submitted' and o.multitrack_interest is not null
  and not exists (select 1 from public.show_act_services x where x.show_id = s.id and coalesce(x.band_name, '') = coalesce(o.band_name, ''));
