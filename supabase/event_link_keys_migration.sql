-- A key per act for the Event Form (job 190, 2026-10-29).
--
-- The venue builds one form per event (event_links). Each act on the bill
-- gets its own key: a code of its own (/v/<key code>) that opens the same
-- form, already named for that act, with that act's answers on it from any
-- device. The event's original link still works (acts type their name).
--
-- 1. event_link_keys: one row per act key. The key's answers are one
--    event_link_responses row (response_id), made on the first save.
-- 2. create_event_link_key(show, act name) / delete_event_link_key(id):
--    venue side only (same check as the link itself).
-- 3. get_event_link_admin: adds `keys` (code, act name, response id).
-- 4. get_event_link_public / save_event_link_response: a key code works
--    like the link's code, tied to that act's answers.
-- 5. gen_event_link_code stays; new codes are checked against both tables.
-- Bodies of 3 and 4 are the live ones with the key parts added. Safe to run
-- more than once.

create table if not exists public.event_link_keys (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.event_links(id) on delete cascade,
  code text not null unique,
  act_name text not null default '',
  response_id uuid references public.event_link_responses(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists event_link_keys_link_idx on public.event_link_keys (link_id, created_at);
alter table public.event_link_keys enable row level security;
revoke all on public.event_link_keys from anon, authenticated;

create or replace function public.create_event_link_key(p_show uuid, p_act_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_access jsonb := public.biz_access(p_show);
  v_link public.event_links;
  v_key public.event_link_keys;
  v_code text;
  v_try integer := 0;
  v_name text := left(btrim(coalesce(p_act_name, '')), 120);
begin
  if v_access is null or not coalesce((v_access->>'venue')::boolean, false) and not coalesce((v_access->>'is_owner')::boolean, false) then
    raise exception 'Only the venue side can make keys for this event';
  end if;
  if v_name = '' then
    raise exception 'Name the act first';
  end if;
  select * into v_link from public.event_links where show_id = p_show;
  if not found then
    raise exception 'Create the form first';
  end if;
  if (select count(*) from public.event_link_keys where link_id = v_link.id) >= 30 then
    raise exception 'Up to 30 keys per event';
  end if;
  loop
    v_code := public.gen_event_link_code();
    v_try := v_try + 1;
    if not exists (select 1 from public.event_links where code = v_code) then
      begin
        insert into public.event_link_keys (link_id, code, act_name, created_by)
        values (v_link.id, v_code, v_name, auth.uid())
        returning * into v_key;
        exit;
      exception when unique_violation then
        if v_try > 5 then raise; end if;
      end;
    elsif v_try > 5 then
      raise exception 'Could not make a code, try again';
    end if;
  end loop;
  return to_jsonb(v_key);
end;
$function$;
revoke all on function public.create_event_link_key(uuid, text) from public, anon;
grant execute on function public.create_event_link_key(uuid, text) to authenticated;

-- Removing a key stops it working; answers already given stay with the event.
create or replace function public.delete_event_link_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show uuid;
  v_access jsonb;
begin
  select l.show_id into v_show from public.event_link_keys k join public.event_links l on l.id = k.link_id where k.id = p_id;
  if v_show is null then
    raise exception 'Key not found';
  end if;
  v_access := public.biz_access(v_show);
  if v_access is null or not coalesce((v_access->>'venue')::boolean, false) and not coalesce((v_access->>'is_owner')::boolean, false) then
    raise exception 'Only the venue side can remove keys';
  end if;
  delete from public.event_link_keys where id = p_id;
end;
$function$;
revoke all on function public.delete_event_link_key(uuid) from public, anon;
grant execute on function public.delete_event_link_key(uuid) to authenticated;

create or replace function public.get_event_link_admin(p_show uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_access jsonb := public.biz_access(p_show);
  v_link public.event_links;
begin
  if v_access is null or not coalesce((v_access->>'venue')::boolean, false) and not coalesce((v_access->>'is_owner')::boolean, false) then
    return jsonb_build_object('can_view', false);
  end if;
  select * into v_link from public.event_links where show_id = p_show;
  if not found then
    return jsonb_build_object('can_view', true, 'link', null, 'responses', '[]'::jsonb, 'keys', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'can_view', true,
    'link', to_jsonb(v_link),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'act_name', r.act_name, 'answers', r.answers,
        'submitted_at', r.submitted_at, 'updated_at', r.updated_at
      ) order by r.created_at)
      from public.event_link_responses r where r.link_id = v_link.id
    ), '[]'::jsonb),
    'keys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'code', k.code, 'act_name', k.act_name, 'response_id', k.response_id, 'created_at', k.created_at
      ) order by k.created_at)
      from public.event_link_keys k where k.link_id = v_link.id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.get_event_link_public(p_code text, p_token uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_link public.event_links;
  v_key public.event_link_keys;
  v_show record;
  v_resp public.event_link_responses;
  v_bands jsonb;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  select * into v_link from public.event_links where code = v_code;
  if not found then
    -- An act's own key (job 190).
    select * into v_key from public.event_link_keys where code = v_code;
    if v_key.id is null then
      return null;
    end if;
    select * into v_link from public.event_links where id = v_key.link_id;
    if not found then
      return null;
    end if;
  end if;
  select event_name, band_name, venue, date, city, state, icon_url, event_type,
         venue_info, manager_info, promoter_info
    into v_show from public.shows where id = v_link.show_id;
  if v_key.id is not null then
    if v_key.response_id is not null then
      select * into v_resp from public.event_link_responses where id = v_key.response_id;
    end if;
  elsif p_token is not null then
    select * into v_resp from public.event_link_responses where token = p_token and link_id = v_link.id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('band_name', b.band_name, 'role', b.role, 'set_length_minutes', b.set_length_minutes) order by b.sort_order nulls last, b.id), '[]'::jsonb)
    into v_bands
    from public.show_bands b
   where b.show_id = v_link.show_id and coalesce(btrim(b.band_name), '') <> '';
  return jsonb_build_object(
    'title', coalesce(nullif(v_show.event_name, ''), v_show.band_name),
    'venue', v_show.venue,
    'date', v_show.date,
    'place', nullif(concat_ws(', ', v_show.city, v_show.state), ''),
    'message', v_link.message,
    'blocks', v_link.blocks,
    'asks', v_link.asks,
    'key', case when v_key.id is null then null else jsonb_build_object('act_name', v_key.act_name) end,
    'overview', jsonb_build_object(
      'image', coalesce(nullif(v_show.icon_url, ''), v_show.venue_info->>'photo_url'),
      'event_type', v_show.event_type,
      'address', v_show.venue_info->>'address',
      'load_in', v_show.venue_info->>'load_in_location',
      'parking', v_show.venue_info->>'parking',
      'schedule', coalesce(v_show.venue_info->'schedule', '[]'::jsonb),
      'set_times', coalesce(v_show.manager_info->'set_times', '{}'::jsonb),
      'bands', v_bands,
      'ticket_link', v_show.promoter_info->>'ticket_link',
      'website', v_show.venue_info->>'website'
    ),
    'response', case when v_resp.id is null then null else jsonb_build_object(
      'act_name', v_resp.act_name, 'answers', v_resp.answers, 'submitted_at', v_resp.submitted_at) end
  );
end;
$function$;

create or replace function public.save_event_link_response(p_code text, p_token uuid, p_act_name text, p_answers jsonb, p_submit boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_link public.event_links;
  v_key public.event_link_keys;
  v_resp public.event_link_responses;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_name text;
begin
  select * into v_link from public.event_links where code = v_code;
  if not found then
    select * into v_key from public.event_link_keys where code = v_code for update;
    if v_key.id is null then
      raise exception 'This link is not valid';
    end if;
    select * into v_link from public.event_links where id = v_key.link_id;
    if not found then
      raise exception 'This link is not valid';
    end if;
  end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'Answers must be an object';
  end if;
  if length(coalesce(p_answers, '{}'::jsonb)::text) > 200000 then
    raise exception 'That is too much to save at once';
  end if;
  -- A key's answers are its own row, whoever opens it; its name is the venue's.
  v_name := case when v_key.id is not null then v_key.act_name else left(btrim(coalesce(p_act_name, '')), 120) end;
  if v_key.id is not null then
    if v_key.response_id is not null then
      select * into v_resp from public.event_link_responses where id = v_key.response_id;
    end if;
  elsif p_token is not null then
    select * into v_resp from public.event_link_responses where token = p_token and link_id = v_link.id;
  end if;
  if v_resp.id is null then
    insert into public.event_link_responses (link_id, act_name, answers, submitted_at)
    values (v_link.id, v_name, coalesce(p_answers, '{}'::jsonb),
            case when p_submit then now() else null end)
    returning * into v_resp;
    if v_key.id is not null then
      update public.event_link_keys set response_id = v_resp.id where id = v_key.id;
    end if;
  else
    update public.event_link_responses
       set act_name = case when v_key.id is not null then v_name else left(btrim(coalesce(p_act_name, act_name)), 120) end,
           answers = coalesce(p_answers, answers),
           submitted_at = case when p_submit then now() else submitted_at end,
           updated_at = now()
     where id = v_resp.id
     returning * into v_resp;
  end if;
  return jsonb_build_object('token', v_resp.token, 'submitted_at', v_resp.submitted_at);
end;
$function$;

-- Emails sent with an act's key are logged against that key, so each key
-- shows who it was emailed to.
alter table public.event_link_sends add column if not exists key_code text;

create or replace function public.get_event_link_sends(p_show uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_access jsonb := public.biz_access(p_show);
begin
  if v_access is null or not coalesce((v_access->>'venue')::boolean, false) and not coalesce((v_access->>'is_owner')::boolean, false) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'to_email', s.to_email, 'status', s.status, 'error', s.error,
      'created_at', s.created_at, 'sent_at', s.sent_at, 'key_code', s.key_code
    ) order by s.created_at desc)
    from (select * from public.event_link_sends where show_id = p_show order by created_at desc limit 200) s
  ), '[]'::jsonb);
end;
$function$;
