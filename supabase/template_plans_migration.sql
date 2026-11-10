-- Template plans (job 295). Company profiles build their own template only:
--   venue            -> one venue template (their room).
--   manager / artist -> one manager template (their side) and their acts as
--                       artist templates: 1 act free, more on a plan.
-- Techs (audio / lighting) keep any number of venue and artist templates.
-- Prices aren't set yet (no Stripe): plans are rows here, an upgrade is a
-- request Jay turns on by hand (insert into account_plans).
-- Safe to run more than once.

-- The plans on offer. acts = how many act (artist) templates; null = no limit.
create table if not exists public.template_plans (
  id text primary key,
  label text not null,
  acts integer,
  price_label text,          -- shown as is; null = "Price coming soon"
  blurb text,
  sort integer not null default 0,
  active boolean not null default true
);
alter table public.template_plans enable row level security;
drop policy if exists "Anyone can see the plans" on public.template_plans;
create policy "Anyone can see the plans" on public.template_plans for select using (active);
grant select on public.template_plans to anon, authenticated;

insert into public.template_plans (id, label, acts, price_label, blurb, sort) values
  ('free',      'Your act',         1,    'Free', 'One act: your own.', 0),
  ('roster',    'Small roster',     5,    null,   'Up to 5 acts, each with its own template.', 1),
  ('unlimited', 'Full roster',      null, null,   'As many acts as you manage or book.', 2)
on conflict (id) do nothing;

-- Who's on which plan. Closed: only set by hand (or by payments later).
create table if not exists public.account_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null references public.template_plans(id),
  granted_at timestamptz not null default now(),
  note text
);
alter table public.account_plans enable row level security;
revoke all on public.account_plans from anon, authenticated;

-- Upgrade requests from the Upgrade screen.
create table if not exists public.template_plan_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null references public.template_plans(id),
  note text,
  status text not null default 'open' check (status in ('open', 'done', 'declined')),
  created_at timestamptz not null default now()
);
alter table public.template_plan_requests enable row level security;
revoke all on public.template_plan_requests from anon, authenticated;
create index if not exists template_plan_requests_user on public.template_plan_requests (user_id, created_at desc);

-- How many act templates this account may keep (null = no limit, from a
-- plan whose acts is null).
create or replace function public.template_act_limit(p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has boolean;
  v_acts integer;
begin
  select true, tp.acts into v_has, v_acts
    from public.account_plans ap join public.template_plans tp on tp.id = ap.plan
   where ap.user_id = p_user;
  if v_has then return v_acts; end if;
  return coalesce((select acts from public.template_plans where id = 'free'), 1);
end;
$$;
revoke all on function public.template_act_limit(uuid) from public, anon, authenticated;

-- The rule, on every save of a template (My Templates, Save as template on an
-- event, Save to template on a stage plot).
create or replace function public.enforce_template_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_count integer;
  v_limit integer;
begin
  select account_type into v_type from public.user_preferences where user_id = new.owner_id;
  if v_type is null or v_type not in ('venue', 'manager', 'band') then
    return new; -- techs and everyone else: no limit
  end if;
  if tg_op = 'UPDATE' and new.category = old.category and new.owner_id = old.owner_id then
    return new; -- editing a template they already have
  end if;

  if v_type = 'venue' and new.category <> 'venue' then
    raise exception 'TEMPLATE_LIMIT: a venue keeps one template, its own venue' using errcode = 'P0001';
  end if;
  if v_type in ('manager', 'band') and new.category not in ('manager', 'artist') then
    raise exception 'TEMPLATE_LIMIT: managers and artists keep their own manager and act templates' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.saved_templates
   where owner_id = new.owner_id and category = new.category and id <> new.id;

  if new.category in ('venue', 'manager') then
    if v_count >= 1 then
      raise exception 'TEMPLATE_LIMIT: one % template per account', new.category using errcode = 'P0001';
    end if;
  else
    v_limit := public.template_act_limit(new.owner_id);
    if v_limit is not null and v_count >= v_limit then
      raise exception 'TEMPLATE_LIMIT_ACTS: your plan holds % act template(s)', v_limit using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists saved_templates_limits on public.saved_templates;
create trigger saved_templates_limits
  before insert or update of category, owner_id on public.saved_templates
  for each row execute function public.enforce_template_limits();

-- What My Templates and the Upgrade screen show.
create or replace function public.get_my_template_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_type text;
  v_plan text;
  v_limit integer;
begin
  if v_uid is null then return null; end if;
  select account_type into v_type from public.user_preferences where user_id = v_uid;
  select plan into v_plan from public.account_plans where user_id = v_uid;
  v_limit := public.template_act_limit(v_uid);
  return jsonb_build_object(
    'account_type', v_type,
    'limited', coalesce(v_type in ('venue', 'manager', 'band'), false),
    'plan', coalesce(v_plan, 'free'),
    'acts_limit', v_limit,
    'acts_used', (select count(*) from public.saved_templates where owner_id = v_uid and category = 'artist'),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', label, 'acts', acts, 'price_label', price_label, 'blurb', blurb) order by sort), '[]'::jsonb)
                from public.template_plans where active),
    'requested', (select jsonb_build_object('plan', plan, 'at', created_at) from public.template_plan_requests
                   where user_id = v_uid and status = 'open' order by created_at desc limit 1)
  );
end;
$$;
revoke all on function public.get_my_template_plan() from public, anon;
grant execute on function public.get_my_template_plan() to authenticated;

create or replace function public.request_template_plan(p_plan text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.user_preferences where user_id = v_uid and account_type in ('manager', 'band')) then
    raise exception 'Plans are for artist and manager accounts';
  end if;
  if not exists (select 1 from public.template_plans where id = p_plan and active and id <> 'free') then
    raise exception 'No such plan';
  end if;
  -- One open request at a time: a new pick replaces the old one.
  update public.template_plan_requests set status = 'declined' where user_id = v_uid and status = 'open';
  insert into public.template_plan_requests (user_id, plan, note) values (v_uid, p_plan, nullif(left(coalesce(p_note, ''), 500), ''));
  return public.get_my_template_plan();
end;
$$;
revoke all on function public.request_template_plan(text, text) from public, anon;
grant execute on function public.request_template_plan(text, text) to authenticated;

-- Turning an account on by hand, until payments:
--   insert into public.account_plans (user_id, plan, note) values ('<user id>', 'roster', 'by hand')
--   on conflict (user_id) do update set plan = excluded.plan, granted_at = now(), note = excluded.note;
--   update public.template_plan_requests set status = 'done' where user_id = '<user id>' and status = 'open';
