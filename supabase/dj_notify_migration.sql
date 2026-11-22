-- DJ notifications (job 469, 2026-11-22).
--
-- Lock-screen alerts (job 305's push_outbox, sent each minute by send-push)
-- for the things a DJ needs to hear about, to DJs with alerts on:
--   * a new date request from their press kit   -> opens Bookings › Requests
--   * a promoter's message in a request chat    -> opens that chat
--   * an act submitting their set               -> opens Sets
-- One alert per thing (tag), so a burst of chat messages that haven't gone
-- out yet becomes one alert showing the latest.
--
-- A new date request also emails the DJ (everyone, alerts on or not): the
-- insert calls the dj-notify edge function through pg_net, guarded by the
-- same vault key as the cron jobs (digest_cron_secret). Promoter messages
-- already email the DJ from dj-request-chat (at most every 30 minutes).
--
-- Phones that turned alerts on with the old VAPID key move to the new one by
-- themselves the next time the app opens (src/lib/push.js); their old push
-- address then reports gone and send-push removes it.
-- Safe to run again.

-- Queue one alert for one person, if they have alerts on.
create or replace function public.queue_user_push(p_user uuid, p_title text, p_body text, p_url text, p_tag text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user is null or not exists (select 1 from public.push_subscriptions s where s.user_id = p_user) then return; end if;
  insert into public.push_outbox (user_id, title, body, url, tag)
  values (p_user, left(p_title, 120), left(coalesce(p_body, ''), 300), coalesce(p_url, '/'), p_tag)
  on conflict (tag, user_id) where sent_at is null and tag is not null
    do update set title = excluded.title, body = excluded.body, url = excluded.url, created_at = now();
end;
$$;
revoke all on function public.queue_user_push(uuid, text, text, text, text) from public, anon, authenticated;

-- "Fri, Dec 4"
create or replace function public.dj_short_date(d date)
returns text language sql immutable set search_path to 'public' as $$
  select trim(to_char(d, 'Dy, Mon')) || ' ' || extract(day from d)::int;
$$;

-- New date request: alert + email.
create or replace function public.dj_notify_new_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
begin
  perform public.queue_user_push(
    new.owner_id,
    'Date request · ' || public.dj_short_date(new.date),
    concat_ws(' · ', nullif(trim(new.name), ''), nullif(concat_ws(' at ', nullif(trim(new.event_name), ''), nullif(trim(new.venue), '')), '')),
    '/dj/gigs?tab=requests',
    'djreq:' || new.id);
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'digest_cron_secret';
  if v_secret is not null then
    perform net.http_post(
      url := 'https://tbskirwlveqbjqyvtpiz.supabase.co/functions/v1/dj-notify',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('kind', 'new_request', 'id', new.id),
      timeout_milliseconds := 20000);
  end if;
  return new;
exception when others then
  -- Never lose a promoter's request over a notification.
  raise warning 'dj_notify_new_request: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.dj_notify_new_request() from public, anon, authenticated;
drop trigger if exists dj_notify_new_request on public.dj_date_requests;
create trigger dj_notify_new_request after insert on public.dj_date_requests
  for each row execute function public.dj_notify_new_request();

-- Promoter wrote in a request chat: alert.
create or replace function public.dj_notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  if new.sender <> 'promoter' then return new; end if;
  select id, owner_id, name, date into r from public.dj_date_requests where id = new.request_id;
  if r.id is null then return new; end if;
  perform public.queue_user_push(
    r.owner_id,
    coalesce(nullif(trim(r.name), ''), 'A promoter') || ' · ' || public.dj_short_date(r.date),
    new.body,
    '/?view=chats&thread=' || r.id,
    'djchat:' || r.id);
  return new;
exception when others then
  raise warning 'dj_notify_chat_message: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.dj_notify_chat_message() from public, anon, authenticated;
drop trigger if exists dj_notify_chat_message on public.dj_request_messages;
create trigger dj_notify_chat_message after insert on public.dj_request_messages
  for each row execute function public.dj_notify_chat_message();

-- An act submitted their set: alert.
create or replace function public.dj_notify_set_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_title text;
begin
  if new.status <> 'submitted' or old.status = 'submitted' then return new; end if;
  select coalesce(nullif(trim(title), ''), nullif(trim(venue), ''), 'your event') into v_title from public.dj_set_requests where id = new.request_id;
  perform public.queue_user_push(
    new.owner_id,
    'Set submitted · ' || coalesce(nullif(trim(new.artist_name), ''), 'An act'),
    coalesce(v_title, 'your event'),
    '/',
    'djset:' || new.id);
  return new;
exception when others then
  raise warning 'dj_notify_set_submitted: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.dj_notify_set_submitted() from public, anon, authenticated;
drop trigger if exists dj_notify_set_submitted on public.dj_set_slots;
create trigger dj_notify_set_submitted after update of status on public.dj_set_slots
  for each row execute function public.dj_notify_set_submitted();

