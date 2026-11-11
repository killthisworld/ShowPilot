-- Template packages (job 298): a venue sends its one template as a package
-- (a web the act / tech opens at /vp/CODE). The package is the template as it
-- is now, with the private parts taken out on the server: the deal, event
-- link setup and email, saved replies, task presets, the advance schedule,
-- any section the venue left out, and any field it hid. A tech can keep it
-- in their own My Templates as a venue template.
-- Safe to run more than once.

create table if not exists public.template_shares (
  code text primary key,
  template_id uuid not null references public.saved_templates(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  opened_count integer not null default 0,
  last_opened_at timestamptz
);
create unique index if not exists template_shares_template on public.template_shares (template_id);
alter table public.template_shares enable row level security;
revoke all on public.template_shares from anon, authenticated;

-- My template's package link (made once, kept).
create or replace function public.share_my_template()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tpl uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  select st.id into v_tpl
    from public.saved_templates st
    join public.user_preferences up on up.user_id = st.owner_id
   where st.owner_id = v_uid and up.account_type = 'venue' and st.category = 'venue'
   order by st.updated_at desc nulls last limit 1;
  if v_tpl is null then raise exception 'Make your venue template first'; end if;
  select code into v_code from public.template_shares where template_id = v_tpl;
  if v_code is not null then return v_code; end if;
  loop
    v_code := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', ''), 1, 6));
    exit when length(v_code) = 6 and not exists (select 1 from public.template_shares where code = v_code);
  end loop;
  insert into public.template_shares (code, template_id, owner_id) values (v_code, v_tpl, v_uid);
  return v_code;
end;
$$;
revoke all on function public.share_my_template() from public, anon;
grant execute on function public.share_my_template() to authenticated;

-- The template's data with the private parts taken out.
create or replace function public.template_package_data(p_data jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  d jsonb := coalesce(p_data, '{}'::jsonb);
  ex jsonb := coalesce(d->'exclude', '[]'::jsonb);
  k text;
  part text;
  -- part -> its fields (event-level fields in gig, the rest in section)
  parts jsonb := '{
    "address": {"gig": ["venue","city","state"], "section": ["address","capacity","age_policy","photo_url"]},
    "load_in": {"section": ["load_in_location","parking","load_in_notes"]},
    "schedule": {"section": ["schedule","hard_curfew","load_out_by"]},
    "wifi_power": {"gig": ["wifi_network","wifi_password","power_notes"]},
    "house_gear": {"gig": ["console"], "section": ["pa","backline","mics_monitors"]},
    "hospitality": {"section": ["green_room","meals","drink_tickets","hospitality_notes"]},
    "documents": {"gig": ["venue_documents"], "section": ["documents"]}
  }'::jsonb;
begin
  -- Never in a package.
  d := d #- '{section,tpl_deal}' #- '{section,event_link_setup}' #- '{section,event_link_email}'
         #- '{section,saved_replies}' #- '{section,task_presets}' #- '{section,advance_steps}' #- '{section,done_pages}';
  -- Sections left out of the template, and their top-level copies.
  for part in select jsonb_array_elements_text(ex) loop
    if parts ? part then
      for k in select jsonb_array_elements_text(coalesce(parts->part->'gig', '[]'::jsonb)) loop
        d := (d #- array['gig', k]) - k;
      end loop;
      for k in select jsonb_array_elements_text(coalesce(parts->part->'section', '[]'::jsonb)) loop
        d := d #- array['section', k];
      end loop;
      if part = 'address' then d := d - 'venue_photo_url'; end if;
    end if;
    d := d #- array['page', 'extra', part];
  end loop;
  -- Fields the venue hid.
  for k in select jsonb_array_elements_text(v) from jsonb_each(coalesce(d->'page'->'hidden', '{}'::jsonb)) as h(key, v) where jsonb_typeof(v) = 'array' loop
    d := ((d #- array['gig', k]) #- array['section', k]) - k;
    if k = 'photo_url' then d := d - 'venue_photo_url'; end if;
  end loop;
  -- Their own sections left out.
  if jsonb_typeof(d->'page'->'custom') = 'array' then
    d := jsonb_set(d, '{page,custom}', coalesce((
      select jsonb_agg(c) from jsonb_array_elements(d->'page'->'custom') c where not (ex ? (c->>'id'))
    ), '[]'::jsonb));
  end if;
  d := ((d - 'exclude') #- '{page,hidden}') #- '{page,loads}';
  return d;
end;
$$;
revoke all on function public.template_package_data(jsonb) from public, anon, authenticated;

-- What the package page shows. No account needed.
create or replace function public.get_template_package(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.template_shares;
  v_tpl public.saved_templates;
  v_me text;
begin
  select * into v_share from public.template_shares where code = upper(trim(p_code));
  if v_share is null then return null; end if;
  select * into v_tpl from public.saved_templates where id = v_share.template_id;
  if v_tpl is null then return null; end if;
  update public.template_shares set opened_count = opened_count + 1, last_opened_at = now()
   where code = v_share.code and (auth.uid() is null or auth.uid() <> v_share.owner_id);
  select account_type into v_me from public.user_preferences where user_id = auth.uid();
  return jsonb_build_object(
    'code', v_share.code,
    'name', v_tpl.name,
    'data', public.template_package_data(v_tpl.data),
    'updated_at', v_tpl.updated_at,
    'is_owner', auth.uid() = v_share.owner_id,
    'my_type', v_me,
    'owner', (select jsonb_build_object('name', up.display_name, 'photo', up.profile_photo_url, 'card', up.card_share_token)
                from public.user_preferences up where up.user_id = v_share.owner_id)
  );
end;
$$;
revoke all on function public.get_template_package(text) from public;
grant execute on function public.get_template_package(text) to anon, authenticated;

-- A tech keeps the package as a venue template of their own (updates the one
-- they kept before from the same package, by name).
create or replace function public.keep_template_package(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_type text;
  v_share public.template_shares;
  v_tpl public.saved_templates;
  v_data jsonb;
  v_id uuid;
  v_updated boolean := false;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  select account_type into v_type from public.user_preferences where user_id = v_uid;
  if v_type is null or v_type not in ('engineer', 'lighting') then
    raise exception 'Only audio and lighting techs keep venue templates';
  end if;
  select * into v_share from public.template_shares where code = upper(trim(p_code));
  if v_share is null then raise exception 'This package is gone'; end if;
  select * into v_tpl from public.saved_templates where id = v_share.template_id;
  v_data := public.template_package_data(v_tpl.data) || jsonb_build_object('from_package', v_share.code);
  select id into v_id from public.saved_templates
   where owner_id = v_uid and category = 'venue' and (data->>'from_package' = v_share.code or lower(name) = lower(v_tpl.name))
   order by updated_at desc nulls last limit 1;
  if v_id is not null then
    update public.saved_templates set data = v_data, name = v_tpl.name, updated_at = now() where id = v_id;
    v_updated := true;
  else
    insert into public.saved_templates (owner_id, category, name, data) values (v_uid, 'venue', v_tpl.name, v_data) returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'updated', v_updated);
end;
$$;
revoke all on function public.keep_template_package(text) from public, anon;
grant execute on function public.keep_template_package(text) to authenticated;
