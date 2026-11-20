-- Job 440: "Share with LD" on the audio engineer's stage plot.
--  - Send straight to an LD in your Fellow Pilots (their account).
--  - Or make a link anyone can open; an LD who opens it signed in claims it
--    and it waits on their event like a sent plot (job 400's inbox).
-- What travels: each act's name and members - name, position, what they
-- play, if they sing, where they stand. No notes, no audio details.

alter table public.stage_plot_shares add column if not exists link_token uuid unique;

-- The members as the LD needs them.
create or replace function public.stage_plot_acts_clean(p_acts jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'band_name', left(coalesce(a->>'band_name', ''), 120),
    'band_members', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', left(coalesce(m->>'name', ''), 80),
        'position', m->'position',
        'instruments', case when jsonb_typeof(m->'instruments') = 'array' then (
          select coalesce(jsonb_agg(jsonb_build_object('name', left(coalesce(i->>'name', ''), 60))), '[]'::jsonb)
          from (select i from jsonb_array_elements(m->'instruments') i limit 12) x) else '[]'::jsonb end,
        'vocals', m->'vocals',
        'stage_x', m->'stage_x',
        'stage_y', m->'stage_y'
      )))
      from (select m from jsonb_array_elements(case when jsonb_typeof(a->'band_members') = 'array' then a->'band_members' else '[]'::jsonb end) m limit 40) y
    ), '[]'::jsonb)
  )), '[]'::jsonb)
  from (select a from jsonb_array_elements(case when jsonb_typeof(p_acts) = 'array' then p_acts else '[]'::jsonb end) a limit 20) z;
$$;

-- To an LD in your Fellow Pilots, straight to their account.
create or replace function public.send_stage_plot_to_pilot(p_user uuid, p_acts jsonb, p_show_id uuid default null, p_event_name text default null, p_date date default null, p_venue text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not exists (select 1 from fellow_pilots where owner_id = auth.uid() and pilot_user_id = p_user) then raise exception 'not one of your Fellow Pilots'; end if;
  if jsonb_typeof(p_acts) <> 'array' or pg_column_size(p_acts) > 400000 then raise exception 'nothing to send'; end if;
  select display_name into v_name from user_preferences where user_id = auth.uid();
  insert into stage_plot_shares (from_user, from_name, to_user, show_id, event_name, event_date, venue, acts)
  values (auth.uid(), v_name, p_user,
    case when exists (select 1 from shows where id = p_show_id and owner_id = auth.uid()) then p_show_id end,
    nullif(btrim(p_event_name), ''), p_date, nullif(btrim(p_venue), ''), stage_plot_acts_clean(p_acts))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- A link to share any way (text, email, AirDrop).
create or replace function public.create_stage_plot_link(p_acts jsonb, p_show_id uuid default null, p_event_name text default null, p_date date default null, p_venue text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_name text; v_token uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if jsonb_typeof(p_acts) <> 'array' or pg_column_size(p_acts) > 400000 then raise exception 'nothing to send'; end if;
  select display_name into v_name from user_preferences where user_id = auth.uid();
  insert into stage_plot_shares (from_user, from_name, show_id, event_name, event_date, venue, acts, link_token)
  values (auth.uid(), v_name,
    case when exists (select 1 from shows where id = p_show_id and owner_id = auth.uid()) then p_show_id end,
    nullif(btrim(p_event_name), ''), p_date, nullif(btrim(p_venue), ''), stage_plot_acts_clean(p_acts), v_token);
  return v_token;
end $$;

-- Opening the link: what it holds (anyone with the link).
create or replace function public.get_stage_plot_link(p_token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('from_name', from_name, 'event_name', event_name, 'event_date', event_date, 'venue', venue, 'acts', acts,
    'mine', to_user is not null and to_user = auth.uid(), 'taken', to_user is not null and to_user is distinct from auth.uid())
  from stage_plot_shares where link_token = p_token;
$$;

-- An LD signed in takes it: it waits on their event like a sent plot.
create or replace function public.claim_stage_plot_link(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update stage_plot_shares set to_user = auth.uid(), used_at = null
  where link_token = p_token and (to_user is null or to_user = auth.uid())
  returning id into v_id;
  if v_id is null then raise exception 'this stage plot was already loaded by someone else'; end if;
  return v_id;
end $$;

revoke all on function public.stage_plot_acts_clean(jsonb) from public, anon;
revoke all on function public.send_stage_plot_to_pilot(uuid, jsonb, uuid, text, date, text) from public, anon;
revoke all on function public.create_stage_plot_link(jsonb, uuid, text, date, text) from public, anon;
revoke all on function public.get_stage_plot_link(uuid) from public;
revoke all on function public.claim_stage_plot_link(uuid) from public, anon;
grant execute on function public.stage_plot_acts_clean(jsonb) to authenticated;
grant execute on function public.send_stage_plot_to_pilot(uuid, jsonb, uuid, text, date, text) to authenticated;
grant execute on function public.create_stage_plot_link(jsonb, uuid, text, date, text) to authenticated;
grant execute on function public.get_stage_plot_link(uuid) to anon, authenticated;
grant execute on function public.claim_stage_plot_link(uuid) to authenticated;
