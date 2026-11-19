-- Tidy Bookings (job 361). Safe to run more than once.
--
-- 1. Remove a booking from YOUR Bookings only: booking_packages.hidden_for
--    holds who took it off their list; the other side still sees it, and
--    nothing about the booking or its event changes.
--    hide_booking_package(code, hide) takes it off (or puts it back) for the
--    sender or the venue / act it was sent to.
-- 2. The two lists leave out what you removed. list_my_booking_packages also
--    gets opened_at back (job 354): job 348's migration re-created it after
--    job 354's had added it.
-- 3. Add an event to your Logbook from Bookings: add_show_to_logbook(show)
--    marks it done when it's yours, or, for an event shared with you
--    (linked_gigs), puts it in your Logbook before its date has passed
--    (linked_gigs.in_logbook).

-- 1 -----------------------------------------------------------------------
alter table public.booking_packages
  add column if not exists hidden_for uuid[] not null default '{}';

create or replace function public.hide_booking_package(p_code text, p_hide boolean default true)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'Sign in first';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  update public.booking_packages b
     set hidden_for = case when p_hide then array_append(array_remove(b.hidden_for, v_uid), v_uid)
                           else array_remove(b.hidden_for, v_uid) end
   where b.code = upper(trim(p_code))
     and (b.created_by = v_uid
          or b.venue_user_id = v_uid
          or (b.venue_user_id is null and coalesce(b.to_email, '') <> '' and lower(b.to_email) = v_email));
end;
$function$;

revoke all on function public.hide_booking_package(text, boolean) from public, anon;
grant execute on function public.hide_booking_package(text, boolean) to authenticated;

-- 2 -----------------------------------------------------------------------
-- As job 348 left it, plus opened_at (job 354) and without what you removed.
create or replace function public.list_my_booking_packages()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'code', b.code, 'kind', b.kind, 'act_name', b.act_name, 'status', b.status,
           'to_name', b.to_name, 'wants', b.wants, 'sent_at', b.sent_at, 'updated_at', b.updated_at,
           'photo_url', b.data->>'photo_url', 'offers', b.offers, 'offers_from', b.offers_from, 'responded_at', b.responded_at,
           'picked_date', b.picked_date, 'show_id', b.show_id, 'opened_at', b.opened_at
         ) order by b.updated_at desc), '[]'::jsonb)
    from public.booking_packages b
   where b.created_by = auth.uid() and b.status <> 'withdrawn'
     and not (auth.uid() = any(b.hidden_for));
$function$;

revoke all on function public.list_my_booking_packages() from public, anon;
grant execute on function public.list_my_booking_packages() to authenticated;

-- As job 348 left it, without what you removed.
create or replace function public.list_incoming_booking_packages()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', b.code, 'kind', b.kind, 'act_name', b.act_name, 'status', b.status, 'wants', b.wants,
           'offers', b.offers, 'offers_from', b.offers_from, 'sent_at', b.sent_at, 'responded_at', b.responded_at,
           'picked_date', b.picked_date, 'show_id', b.show_id,
           'photo_url', b.data->>'photo_url',
           'sender_name', (select nullif(p.display_name, '') from public.user_preferences p where p.user_id = b.created_by),
           'sender_type', (select p.account_type from public.user_preferences p where p.user_id = b.created_by)
         ) order by coalesce(b.responded_at, b.sent_at) desc), '[]'::jsonb)
    from public.booking_packages b
   where b.status in ('sent', 'offered', 'countered', 'declined', 'booked')
     and b.created_by <> auth.uid()
     and not (auth.uid() = any(b.hidden_for))
     and (b.venue_user_id = auth.uid()
          or (b.venue_user_id is null and b.to_email <> ''
              and lower(b.to_email) = lower((select u.email from auth.users u where u.id = auth.uid()))));
$function$;

revoke all on function public.list_incoming_booking_packages() from public, anon;
grant execute on function public.list_incoming_booking_packages() to authenticated;

-- 3 -----------------------------------------------------------------------
alter table public.linked_gigs
  add column if not exists in_logbook boolean not null default false;

create or replace function public.add_show_to_logbook(p_show uuid)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first';
  end if;
  if exists (select 1 from public.shows s where s.id = p_show and s.owner_id = v_uid) then
    update public.shows set done = true where id = p_show;
    return 'own';
  end if;
  update public.linked_gigs set in_logbook = true where user_id = v_uid and show_id = p_show;
  if found then
    return 'linked';
  end if;
  raise exception 'This event isn''t yours or shared with you';
end;
$function$;

revoke all on function public.add_show_to_logbook(uuid) from public, anon;
grant execute on function public.add_show_to_logbook(uuid) to authenticated;
