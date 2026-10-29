-- Rating after the venue's Event Form is sent (job 195, 2026-10-29).
--
-- The intake forms already ask "How was this form?" after they're sent
-- (submit_intake_rating). This does the same for the Event Form acts open
-- from a venue's link or key (/v/<code>): a rating saves to app_ratings with
-- source 'event_form'. Only once that act has sent the form. Safe to run
-- more than once.

create or replace function public.submit_event_link_rating(p_code text, p_token uuid, p_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_link public.event_links;
  v_key public.event_link_keys;
  v_resp public.event_link_responses;
  v_show record;
  v_email text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1 to 5';
  end if;
  select * into v_link from public.event_links where code = v_code;
  if not found then
    select * into v_key from public.event_link_keys where code = v_code;
    if v_key.id is null then
      raise exception 'This link is not valid';
    end if;
    select * into v_link from public.event_links where id = v_key.link_id;
    select * into v_resp from public.event_link_responses where id = v_key.response_id;
  elsif p_token is not null then
    select * into v_resp from public.event_link_responses where token = p_token and link_id = v_link.id;
  end if;
  if v_resp.id is null or v_resp.submitted_at is null then
    raise exception 'Send the form before rating';
  end if;
  select event_name, band_name, venue, date into v_show from public.shows where id = v_link.show_id;
  if auth.uid() is not null then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  insert into public.app_ratings (rating, comment, user_email, submitted_at, source, context)
  values (
    p_rating,
    nullif(left(btrim(coalesce(p_comment, '')), 2000), ''),
    coalesce(v_email, ''),
    now(),
    'event_form',
    left(concat_ws(' / ', nullif(v_resp.act_name, ''), nullif(coalesce(nullif(v_show.event_name, ''), v_show.band_name), ''), nullif(v_show.venue, ''), v_show.date::text), 300)
  );
end;
$function$;
revoke all on function public.submit_event_link_rating(text, uuid, integer, text) from public;
grant execute on function public.submit_event_link_rating(text, uuid, integer, text) to anon, authenticated;
