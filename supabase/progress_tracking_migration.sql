-- Progress you can see (job 354). Safe to run more than once.
--
-- 1. DJ Tools: when a performer's set link was sent (copied or shared by the
--    DJ, or marked sent), so a night shows "link sent" vs "no link yet".
-- 2. Booking packages: when the venue first opened the package, so the
--    sender's Bookings > Sent shows Sent > Opened > Dates offered > Booked.
--    mark_booking_package_opened(code) is called by the package page; it
--    only counts someone other than the sender, and only the first time.
-- 3. A venue's template package link (/vp): how many times it was opened and
--    when last, for the venue's own Bookings > Sent.

-- 1 -----------------------------------------------------------------------
alter table public.dj_set_slots
  add column if not exists link_sent_at timestamptz;

-- 2 -----------------------------------------------------------------------
alter table public.booking_packages
  add column if not exists opened_at timestamptz;

create or replace function public.mark_booking_package_opened(p_code text)
returns void
language sql
volatile
security definer
set search_path to 'public'
as $function$
  update public.booking_packages b
     set opened_at = now()
   where b.code = upper(trim(p_code))
     and b.opened_at is null
     and b.status not in ('draft', 'withdrawn')
     and (auth.uid() is null or auth.uid() <> b.created_by);
$function$;

revoke all on function public.mark_booking_package_opened(text) from public;
grant execute on function public.mark_booking_package_opened(text) to anon, authenticated;

-- The sender's list, as now (job 347) plus opened_at.
create or replace function public.list_my_booking_packages()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'code', b.code, 'act_name', b.act_name, 'status', b.status,
           'to_name', b.to_name, 'wants', b.wants, 'sent_at', b.sent_at, 'updated_at', b.updated_at,
           'photo_url', b.data->>'photo_url', 'offers', b.offers, 'offers_from', b.offers_from, 'responded_at', b.responded_at,
           'picked_date', b.picked_date, 'show_id', b.show_id, 'opened_at', b.opened_at
         ) order by b.updated_at desc), '[]'::jsonb)
    from public.booking_packages b
   where b.created_by = auth.uid() and b.status <> 'withdrawn';
$function$;

revoke all on function public.list_my_booking_packages() from public, anon;
grant execute on function public.list_my_booking_packages() to authenticated;

-- 3 -----------------------------------------------------------------------
create or replace function public.my_template_share_stats()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', s.code, 'created_at', s.created_at,
           'opened_count', s.opened_count, 'last_opened_at', s.last_opened_at,
           'name', t.name
         ) order by s.created_at desc), '[]'::jsonb)
    from public.template_shares s
    join public.saved_templates t on t.id = s.template_id
   where s.owner_id = auth.uid();
$function$;

revoke all on function public.my_template_share_stats() from public, anon;
grant execute on function public.my_template_share_stats() to authenticated;
