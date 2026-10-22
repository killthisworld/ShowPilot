-- ============================================================
-- Migration: rating + feedback after the Performer Intake form
-- ============================================================
--
-- After a band / tour manager submits the Performer Intake form (/tm-intake),
-- they see the same 5-star rating and comment box as Settings. Their rating
-- goes into the same app_ratings table, tagged with where it came from.
--
-- Intake senders usually aren't signed in, so they can't use the table's
-- "authenticated users can insert" policy. This SECURITY DEFINER function
-- lets them rate only with a real, submitted intake link (no open spam door).
-- Nobody can read ratings from the app; read them in the Supabase SQL editor:
--
--   select submitted_at, source, rating, comment, user_email, context
--   from public.app_ratings
--   order by submitted_at desc;
--
--   -- just the intake form:
--   select submitted_at, rating, comment, context
--   from public.app_ratings where source = 'performer_intake'
--   order by submitted_at desc;

alter table public.app_ratings add column if not exists source text not null default 'settings';
alter table public.app_ratings add column if not exists context text;

create or replace function public.submit_intake_rating(p_token uuid, p_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request record;
  v_email text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1 to 5';
  end if;

  select * into v_request from public.tour_manager_requests where invite_token = p_token;
  if v_request is null then
    raise exception 'Invalid intake link';
  end if;
  if v_request.status is distinct from 'submitted' then
    raise exception 'Submit the form before rating';
  end if;

  if auth.uid() is not null then
    select email into v_email from auth.users where id = auth.uid();
  end if;

  insert into public.app_ratings (rating, comment, user_email, submitted_at, source, context)
  values (
    p_rating,
    nullif(left(btrim(coalesce(p_comment, '')), 2000), ''),
    coalesce(v_email, ''),
    now(),
    'performer_intake',
    left(concat_ws(' / ', nullif(v_request.band_name, ''), nullif(v_request.venue, ''), v_request.date::text), 300)
  );
end;
$function$;

revoke all on function public.submit_intake_rating(uuid, integer, text) from public;
grant execute on function public.submit_intake_rating(uuid, integer, text) to anon, authenticated;
