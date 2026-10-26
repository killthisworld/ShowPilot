-- ============================================================
-- Migration: the venue's event link (job 176)
-- Run this in Supabase SQL Editor
-- ============================================================
--
-- A venue (or the event owner) makes ONE link per event. Acts open
-- showpilot.space/e/<code>, read the info the venue chose to share, and
-- fill in the checklist the venue set (blurb, photo, flyer, inputs, ...).
-- The venue sees who has answered what.
--
--   event_links           one per event: the info blocks acts see (text the
--                         venue approved, stored as a snapshot), the asks
--                         (the checklist) and reminder settings
--   event_link_responses  one per act that opens the link: their answers
--
-- Acts need no account. Their answers are saved under a private response
-- token kept in their browser, so they can come back and finish.
-- Everything goes through the security-definer functions below; the tables
-- themselves are closed to the app.

create table if not exists public.event_links (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null unique references public.shows(id) on delete cascade,
  code text not null unique,
  blocks jsonb not null default '[]'::jsonb,   -- [{key, title, body}]
  asks jsonb not null default '[]'::jsonb,     -- [{key, label, type, required, hint}]
  message text,                                -- note shown above the info
  remind_days integer,                         -- null = no reminders
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.event_links enable row level security;
revoke all on public.event_links from anon, authenticated;

create table if not exists public.event_link_responses (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.event_links(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  act_name text not null default '',
  answers jsonb not null default '{}'::jsonb,   -- { ask_key: text | {url,name} | [..] }
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_link_responses_link_idx on public.event_link_responses (link_id);
alter table public.event_link_responses enable row level security;
revoke all on public.event_link_responses from anon, authenticated;

-- 6 characters, no look-alikes (same alphabet as the intake short links).
create or replace function public.gen_event_link_code()
returns text
language plpgsql
volatile
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1);
  end loop;
  return v_code;
end;
$function$;

-- ------------------------------------------------------------
-- Venue side (signed in; same access as the business pages)
-- ------------------------------------------------------------

-- The link for an event plus every response. Null link if none yet.
create or replace function public.get_event_link_admin(p_show uuid)
returns jsonb
language plpgsql
stable
security definer
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
    return jsonb_build_object('can_view', true, 'link', null, 'responses', '[]'::jsonb);
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
    ), '[]'::jsonb)
  );
end;
$function$;

-- Create or update the link (blocks, asks, message, reminders).
create or replace function public.save_event_link(
  p_show uuid, p_blocks jsonb, p_asks jsonb, p_message text, p_remind_days integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_access jsonb := public.biz_access(p_show);
  v_link public.event_links;
  v_code text;
  v_try integer := 0;
begin
  if v_access is null or not coalesce((v_access->>'venue')::boolean, false) and not coalesce((v_access->>'is_owner')::boolean, false) then
    raise exception 'Only the venue side can send this link';
  end if;
  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_asks, '[]'::jsonb)) <> 'array' then
    raise exception 'Blocks and asks must be lists';
  end if;
  select * into v_link from public.event_links where show_id = p_show;
  if found then
    update public.event_links
       set blocks = coalesce(p_blocks, '[]'::jsonb), asks = coalesce(p_asks, '[]'::jsonb),
           message = nullif(btrim(coalesce(p_message, '')), ''), remind_days = p_remind_days,
           updated_at = now()
     where id = v_link.id
     returning * into v_link;
  else
    loop
      v_code := public.gen_event_link_code();
      v_try := v_try + 1;
      begin
        insert into public.event_links (show_id, code, blocks, asks, message, remind_days, created_by)
        values (p_show, v_code, coalesce(p_blocks, '[]'::jsonb), coalesce(p_asks, '[]'::jsonb),
                nullif(btrim(coalesce(p_message, '')), ''), p_remind_days, auth.uid())
        returning * into v_link;
        exit;
      exception when unique_violation then
        if v_try > 5 then raise; end if;
      end;
    end loop;
  end if;
  return to_jsonb(v_link);
end;
$function$;

-- ------------------------------------------------------------
-- Act side (no account): read the link, save answers
-- ------------------------------------------------------------

-- What an act sees. If they pass their response token, their saved answers
-- come back too so the form is filled in when they return.
create or replace function public.get_event_link_public(p_code text, p_token uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_link public.event_links;
  v_show record;
  v_resp public.event_link_responses;
begin
  select * into v_link from public.event_links where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    return null;
  end if;
  select event_name, band_name, venue, date, city, state into v_show from public.shows where id = v_link.show_id;
  if p_token is not null then
    select * into v_resp from public.event_link_responses where token = p_token and link_id = v_link.id;
  end if;
  return jsonb_build_object(
    'title', coalesce(nullif(v_show.event_name, ''), v_show.band_name),
    'venue', v_show.venue,
    'date', v_show.date,
    'place', nullif(concat_ws(', ', v_show.city, v_show.state), ''),
    'message', v_link.message,
    'blocks', v_link.blocks,
    'asks', v_link.asks,
    'response', case when v_resp.id is null then null else jsonb_build_object(
      'act_name', v_resp.act_name, 'answers', v_resp.answers, 'submitted_at', v_resp.submitted_at) end
  );
end;
$function$;

-- Save an act's answers. First call (no token) opens a response and returns
-- its token; later calls pass the token. p_submit marks it handed in.
create or replace function public.save_event_link_response(
  p_code text, p_token uuid, p_act_name text, p_answers jsonb, p_submit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link public.event_links;
  v_resp public.event_link_responses;
begin
  select * into v_link from public.event_links where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'This link is not valid';
  end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'Answers must be an object';
  end if;
  if length(coalesce(p_answers, '{}'::jsonb)::text) > 200000 then
    raise exception 'That is too much to save at once';
  end if;
  if p_token is not null then
    select * into v_resp from public.event_link_responses where token = p_token and link_id = v_link.id;
  end if;
  if v_resp.id is null then
    insert into public.event_link_responses (link_id, act_name, answers, submitted_at)
    values (v_link.id, left(btrim(coalesce(p_act_name, '')), 120), coalesce(p_answers, '{}'::jsonb),
            case when p_submit then now() else null end)
    returning * into v_resp;
  else
    update public.event_link_responses
       set act_name = left(btrim(coalesce(p_act_name, act_name)), 120),
           answers = coalesce(p_answers, answers),
           submitted_at = case when p_submit then now() else submitted_at end,
           updated_at = now()
     where id = v_resp.id
     returning * into v_resp;
  end if;
  return jsonb_build_object('token', v_resp.token, 'submitted_at', v_resp.submitted_at);
end;
$function$;

revoke all on function public.get_event_link_admin(uuid) from public;
revoke all on function public.save_event_link(uuid, jsonb, jsonb, text, integer) from public;
revoke all on function public.get_event_link_public(text, uuid) from public;
revoke all on function public.save_event_link_response(text, uuid, text, jsonb, boolean) from public;
grant execute on function public.get_event_link_admin(uuid) to authenticated;
grant execute on function public.save_event_link(uuid, jsonb, jsonb, text, integer) to authenticated;
grant execute on function public.get_event_link_public(text, uuid) to anon, authenticated;
grant execute on function public.save_event_link_response(text, uuid, text, jsonb, boolean) to anon, authenticated;
