-- Job 400: an audio engineer sends an event's stage plot to the LD.
-- The LD sees it on their event for that date and loads the members (where
-- they stand, what they play) onto their 3D stage.

create table if not exists public.stage_plot_shares (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  from_name text,
  to_user uuid references auth.users(id) on delete cascade,
  to_email text,
  show_id uuid,
  event_name text,
  event_date date,
  venue text,
  acts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists stage_plot_shares_to_user on public.stage_plot_shares (to_user) where used_at is null;
create index if not exists stage_plot_shares_to_email on public.stage_plot_shares (lower(to_email)) where used_at is null;
alter table public.stage_plot_shares enable row level security;
-- Read only through the functions below; the sender can see what they sent.
drop policy if exists "sender reads own shares" on public.stage_plot_shares;
create policy "sender reads own shares" on public.stage_plot_shares for select using (from_user = auth.uid());

-- Send: the acts as they are on the sender's screen (names + members).
create or replace function public.send_stage_plot(p_email text, p_acts jsonb, p_show_id uuid default null, p_event_name text default null, p_date date default null, p_venue text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_to uuid; v_name text; v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'that email doesn''t look right'; end if;
  if jsonb_typeof(p_acts) <> 'array' or pg_column_size(p_acts) > 400000 then raise exception 'nothing to send'; end if;
  if p_show_id is not null and not exists (select 1 from shows where id = p_show_id and owner_id = auth.uid()) then raise exception 'not your event'; end if;
  select id into v_to from auth.users where lower(email) = v_email limit 1;
  select display_name into v_name from user_preferences where user_id = auth.uid();
  insert into stage_plot_shares (from_user, from_name, to_user, to_email, show_id, event_name, event_date, venue, acts)
  values (auth.uid(), v_name, v_to, v_email, p_show_id, nullif(btrim(p_event_name), ''), p_date, nullif(btrim(p_venue), ''), (
    select coalesce(jsonb_agg(jsonb_build_object('band_name', a->>'band_name', 'band_members', coalesce(a->'band_members', '[]'::jsonb))), '[]'::jsonb)
    from jsonb_array_elements(p_acts) a))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'has_account', v_to is not null);
end $$;

-- The LD's stage plots waiting to be loaded.
create or replace function public.my_stage_plot_shares()
returns setof public.stage_plot_shares language sql stable security definer set search_path = public as $$
  select * from stage_plot_shares
  where used_at is null
    and (to_user = auth.uid() or (to_user is null and lower(to_email) = lower((select email from auth.users where id = auth.uid()))))
  order by created_at desc limit 50;
$$;

-- Loaded (or dismissed): it leaves the LD's list.
create or replace function public.use_stage_plot_share(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update stage_plot_shares set used_at = now(), to_user = auth.uid()
  where id = p_id and used_at is null
    and (to_user = auth.uid() or (to_user is null and lower(to_email) = lower((select email from auth.users where id = auth.uid()))));
$$;

revoke all on function public.send_stage_plot(text, jsonb, uuid, text, date, text) from public, anon;
revoke all on function public.my_stage_plot_shares() from public, anon;
revoke all on function public.use_stage_plot_share(uuid) from public, anon;
grant execute on function public.send_stage_plot(text, jsonb, uuid, text, date, text) to authenticated;
grant execute on function public.my_stage_plot_shares() to authenticated;
grant execute on function public.use_stage_plot_share(uuid) to authenticated;
