-- Admin view (job 406): a read-only look at any account's data, for when a
-- user appeals to us about a deal, an agreement or an event that went wrong.
--
-- Design:
--  * Who is an admin lives in its own table, site_admins. It is NOT
--    profiles.role: every user can update their own profile row, so that
--    column can't be trusted.
--  * No broad "admins can read everything" policies. The page reads through the
--    admin_* functions below. Each one checks the caller is an admin, only
--    selects (nothing can be changed), and writes a line to admin_access_log.
--  * site_admins and admin_access_log have row level security on and no
--    grants: only the functions (and the dashboard) can touch them.
--
-- To add or remove an admin later (SQL editor):
--   insert into public.site_admins (user_id, note)
--     select id, 'name' from auth.users where email = 'someone@example.com';
--   delete from public.site_admins where user_id = '<id>';

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  added_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from anon, authenticated;

create table if not exists public.admin_access_log (
  id bigserial primary key,
  admin_id uuid,
  action text not null,
  target_user uuid,
  target_show uuid,
  detail text,
  at timestamptz not null default now()
);
alter table public.admin_access_log enable row level security;
revoke all on public.admin_access_log from anon, authenticated;
revoke all on sequence public.admin_access_log_id_seq from anon, authenticated;

-- Jay's account
insert into public.site_admins (user_id, note)
  select id, 'Jay' from auth.users where email = 'killthisworld44@gmail.com'
  on conflict do nothing;

create or replace function public.is_site_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.site_admins where user_id = auth.uid());
$$;

-- Internal: refuse non-admins, log the look.
create or replace function public._admin_guard(p_action text, p_user uuid default null, p_show uuid default null, p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_site_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.admin_access_log (admin_id, action, target_user, target_show, detail)
    values (auth.uid(), p_action, p_user, p_show, left(p_detail, 200));
end $$;

-- Find accounts by email, name or username.
create or replace function public.admin_find_users(p_q text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare q text := coalesce(trim(p_q), ''); r jsonb;
begin
  perform public._admin_guard('find_users', null, null, q);
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) into r from (
    select u.id, u.email, up.display_name, up.username, u.created_at, u.last_sign_in_at, ap.plan,
           (select count(*) from public.shows s where s.owner_id = u.id) as events
    from auth.users u
    left join public.user_preferences up on up.user_id = u.id
    left join public.account_plans ap on ap.user_id = u.id
    where q = '' or u.email ilike '%' || q || '%' or up.display_name ilike '%' || q || '%' or up.username ilike '%' || q || '%'
    order by u.created_at desc limit 50
  ) x;
  return r;
end $$;

-- Find events by act, venue or place.
create or replace function public.admin_find_events(p_q text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare q text := coalesce(trim(p_q), ''); r jsonb;
begin
  perform public._admin_guard('find_events', null, null, q);
  select coalesce(jsonb_agg(x order by x.date desc), '[]'::jsonb) into r from (
    select s.id, s.band_name, s.venue, s.location, s.date, s.status, u.email as owner_email
    from public.shows s left join auth.users u on u.id = s.owner_id
    where q = '' or s.band_name ilike '%' || q || '%' or s.venue ilike '%' || q || '%' or s.location ilike '%' || q || '%'
    order by s.date desc limit 50
  ) x;
  return r;
end $$;

-- One account: who, plan, events they own / are linked to, packages, templates.
create or replace function public.admin_user_overview(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_guard('user_overview', p_user);
  return jsonb_build_object(
    'user', (select to_jsonb(x) from (
        select u.id, u.email, u.phone, u.created_at, u.last_sign_in_at, up.display_name, up.username
        from auth.users u left join public.user_preferences up on up.user_id = u.id where u.id = p_user) x),
    'plan', (select to_jsonb(a) from public.account_plans a where a.user_id = p_user),
    'events_owned', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'band_name', s.band_name, 'venue', s.venue, 'date', s.date, 'status', s.status) order by s.date desc)
        from public.shows s where s.owner_id = p_user), '[]'::jsonb),
    'events_linked', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'band_name', s.band_name, 'venue', s.venue, 'date', s.date, 'status', s.status) order by s.date desc)
        from public.linked_gigs l join public.shows s on s.id = l.show_id where l.user_id = p_user), '[]'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'kind', b.kind, 'act_name', b.act_name, 'to_name', b.to_name,
          'status', b.status, 'sent_at', b.sent_at, 'updated_at', b.updated_at, 'role', case when b.created_by = p_user then 'sender' else 'recipient' end) order by b.updated_at desc)
        from (select * from public.booking_packages where created_by = p_user or venue_user_id = p_user order by updated_at desc limit 200) b), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'category', t.category, 'name', t.name, 'updated_at', t.updated_at) order by t.updated_at desc)
        from public.saved_templates t where t.owner_id = p_user), '[]'::jsonb)
  );
end $$;

-- One event: everything attached to it, including the chats.
create or replace function public.admin_event(p_show uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_guard('event', null, p_show);
  return jsonb_build_object(
    'event', (select to_jsonb(s) - 'share_token' from public.shows s where s.id = p_show),
    'owner', (select jsonb_build_object('id', u.id, 'email', u.email, 'display_name', up.display_name)
        from public.shows s join auth.users u on u.id = s.owner_id left join public.user_preferences up on up.user_id = u.id where s.id = p_show),
    'acts', coalesce((select jsonb_agg(to_jsonb(b) order by b.sort_order) from public.show_bands b where b.show_id = p_show), '[]'::jsonb),
    'deal', (select to_jsonb(d) from public.event_deals d where d.show_id = p_show),
    'settlement', (select to_jsonb(e) from public.event_settlements e where e.show_id = p_show),
    'records', coalesce((select jsonb_agg(to_jsonb(r) order by r.filed_at) from public.business_records r where r.show_id = p_show), '[]'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'kind', b.kind, 'act_name', b.act_name, 'status', b.status, 'updated_at', b.updated_at) order by b.updated_at)
        from public.booking_packages b where b.show_id = p_show), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(distinct jsonb_build_object('id', u.id, 'email', u.email, 'display_name', up.display_name))
        from (select s.owner_id as uid from public.shows s where s.id = p_show
              union select l.user_id from public.linked_gigs l where l.show_id = p_show) k
        join auth.users u on u.id = k.uid left join public.user_preferences up on up.user_id = u.id), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('label', i.label, 'role', i.invited_role, 'status', i.status, 'accepted_by', i.accepted_by, 'accepted_at', i.accepted_at, 'created_at', i.created_at) order by i.created_at)
        from public.gig_invites i where i.show_id = p_show), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.event_announcements a where a.show_id = p_show), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.gig_tasks t where t.show_id = p_show), '[]'::jsonb),
    'guests', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.event_guests g where g.show_id = p_show), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc) from (select * from public.gig_activity where show_id = p_show order by at desc limit 200) a), '[]'::jsonb),
    'chats', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'section', c.section,
          'messages', coalesce((select jsonb_agg(jsonb_build_object('at', m.created_at, 'from', coalesce(up.display_name, u.email, 'unknown'), 'body', m.body) order by m.created_at)
              from public.messages m left join auth.users u on u.id = m.sender_id left join public.user_preferences up on up.user_id = m.sender_id
              where m.conversation_id = c.id), '[]'::jsonb)))
        from public.conversations c where c.show_id = p_show), '[]'::jsonb)
  );
end $$;

-- One booking package: the offer, the replies, the rounds, both sides.
create or replace function public.admin_package(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_guard('package', null, (select show_id from public.booking_packages where id = p_id), p_id::text);
  return (select to_jsonb(b)
      || jsonb_build_object('sender_email', (select email from auth.users where id = b.created_by),
                            'recipient_email', (select email from auth.users where id = b.venue_user_id))
    from public.booking_packages b where b.id = p_id);
end $$;

-- The log itself, newest first.
create or replace function public.admin_access_log_list(p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_guard('view_log');
  return coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'admin', a.email, 'action', l.action, 'target_user', l.target_user,
         'target_show', l.target_show, 'detail', l.detail) order by l.at desc)
    from (select * from public.admin_access_log order by at desc limit least(greatest(p_limit, 1), 500)) l
    left join auth.users a on a.id = l.admin_id), '[]'::jsonb);
end $$;

revoke all on function public._admin_guard(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.is_site_admin() from public, anon;
revoke all on function public.admin_find_users(text) from public, anon;
revoke all on function public.admin_find_events(text) from public, anon;
revoke all on function public.admin_user_overview(uuid) from public, anon;
revoke all on function public.admin_event(uuid) from public, anon;
revoke all on function public.admin_package(uuid) from public, anon;
revoke all on function public.admin_access_log_list(int) from public, anon;
grant execute on function public.is_site_admin() to authenticated;
grant execute on function public.admin_find_users(text) to authenticated;
grant execute on function public.admin_find_events(text) to authenticated;
grant execute on function public.admin_user_overview(uuid) to authenticated;
grant execute on function public.admin_event(uuid) to authenticated;
grant execute on function public.admin_package(uuid) to authenticated;
grant execute on function public.admin_access_log_list(int) to authenticated;
