-- Settlement on the night (job 73, "On the road" stage 7, 2026-11-11).
--
-- One settlement per event: the night's numbers (gross door, costs, buyout,
-- deposit already paid, the venue's merch cut, any other adjustment) next to
-- the deal (event_deals), what's owed, and whether it's been paid. Same
-- privacy as the deal and the paperwork: only the event owner, the venue
-- side and the manager / artist side (public.biz_access) ever see it - never
-- crew or anyone who only holds the share link. Either side can fill it in
-- (the venue usually has the door numbers, the tour manager checks them);
-- changing a number after it's marked paid opens it again.
-- The signed sheet itself is filed as a business record (kind 'other').

create table if not exists public.event_settlements (
  show_id uuid primary key references public.shows(id) on delete cascade,
  figures jsonb not null default '{}'::jsonb,
  owed numeric,
  status text not null default 'open' check (status in ('open', 'paid')),
  paid_at timestamptz,
  paid_by_name text,
  updated_by_name text,
  updated_at timestamptz not null default now()
);

-- Read and written only through the functions below.
alter table public.event_settlements enable row level security;

create or replace function public.get_event_settlement(p_show uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_access jsonb := public.biz_access(p_show);
  v_row jsonb;
begin
  if v_access is null or not coalesce((v_access->>'can_view')::boolean, false) then
    return jsonb_build_object('can_view', false);
  end if;
  select to_jsonb(s) into v_row from public.event_settlements s where s.show_id = p_show;
  return v_access || jsonb_build_object('settlement', v_row);
end;
$function$;

create or replace function public.save_event_settlement(p_show uuid, p_figures jsonb, p_owed numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_access jsonb := public.biz_access(p_show);
  v_row public.event_settlements;
begin
  if v_access is null or not coalesce((v_access->>'can_view')::boolean, false) then
    raise exception 'Only the venue and the manager / artist can settle this event';
  end if;
  if jsonb_typeof(coalesce(p_figures, '{}'::jsonb)) <> 'object' then
    raise exception 'Settlement figures must be an object';
  end if;
  insert into public.event_settlements as s (show_id, figures, owed, status, updated_by_name, updated_at)
  values (p_show, coalesce(p_figures, '{}'::jsonb), p_owed, 'open', public.my_display_name(), now())
  on conflict (show_id) do update set
    figures = excluded.figures,
    owed = excluded.owed,
    -- a changed number opens a paid settlement again
    status = case when s.figures is distinct from excluded.figures or s.owed is distinct from excluded.owed then 'open' else s.status end,
    paid_at = case when s.figures is distinct from excluded.figures or s.owed is distinct from excluded.owed then null else s.paid_at end,
    paid_by_name = case when s.figures is distinct from excluded.figures or s.owed is distinct from excluded.owed then null else s.paid_by_name end,
    updated_by_name = excluded.updated_by_name,
    updated_at = now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.set_settlement_paid(p_show uuid, p_paid boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_access jsonb := public.biz_access(p_show);
  v_row public.event_settlements;
begin
  if v_access is null or not coalesce((v_access->>'can_view')::boolean, false) then
    raise exception 'Only the venue and the manager / artist can settle this event';
  end if;
  insert into public.event_settlements (show_id) values (p_show) on conflict (show_id) do nothing;
  update public.event_settlements set
    status = case when p_paid then 'paid' else 'open' end,
    paid_at = case when p_paid then now() else null end,
    paid_by_name = case when p_paid then public.my_display_name() else null end
  where show_id = p_show
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.get_event_settlement(uuid) from public, anon;
revoke all on function public.save_event_settlement(uuid, jsonb, numeric) from public, anon;
revoke all on function public.set_settlement_paid(uuid, boolean) from public, anon;
grant execute on function public.get_event_settlement(uuid) to authenticated;
grant execute on function public.save_event_settlement(uuid, jsonb, numeric) to authenticated;
grant execute on function public.set_settlement_paid(uuid, boolean) to authenticated;
