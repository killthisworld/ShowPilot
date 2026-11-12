-- Lock-screen alerts, round 1 (job 305, 2026-11-12).
--
-- Each phone that turns on "Lock-screen alerts" saves its push address here
-- (push_subscriptions, private to its owner). Things worth an alert go into
-- push_outbox (never readable by apps). Every minute, if anything is waiting,
-- pg_cron calls the send-push edge function, which sends them with the
-- VAPID key, removes phones that no longer exist, and marks them sent.
--
-- Round 1 alerts: event announcements and time changes (event_announcements,
-- which the time-change trigger already fills and updates), to everyone on
-- the event except whoever made it, and only to people with alerts on.
-- A time change edited again within 10 minutes updates its waiting alert
-- (same tag, so the phone replaces it), and one put back is dropped.
--
-- The cron call uses the same vault key as the fan emails
-- (digest_cron_secret, check_digest_secret). Safe to run again.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) < 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Own phones: read" on public.push_subscriptions;
drop policy if exists "Own phones: remove" on public.push_subscriptions;
create policy "Own phones: read" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "Own phones: remove" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.push_subscriptions to authenticated;

-- Save (or move to this account) this phone's push address. A phone signed
-- into another account before belongs to whoever turned alerts on last.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  url text not null default '/',
  tag text,
  created_at timestamptz not null default now(),
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0
);
create index if not exists push_outbox_waiting_idx on public.push_outbox (send_after) where sent_at is null;
create unique index if not exists push_outbox_tag_user_idx on public.push_outbox (tag, user_id) where sent_at is null and tag is not null;
alter table public.push_outbox enable row level security; -- no policies: apps can't read or write it

-- Queue one alert for everyone on an event (except p_skip) who has alerts on.
create or replace function public.queue_event_push(p_show_id uuid, p_skip uuid, p_title text, p_body text, p_url text, p_tag text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.push_outbox (user_id, title, body, url, tag)
  select m, left(p_title, 120), left(coalesce(p_body, ''), 300), p_url, p_tag
  from public.gig_member_ids(p_show_id) m
  where m is distinct from p_skip
    and exists (select 1 from public.push_subscriptions s where s.user_id = m)
  on conflict (tag, user_id) where sent_at is null and tag is not null
    do update set title = excluded.title, body = excluded.body, url = excluded.url, created_at = now();
end;
$$;
revoke all on function public.queue_event_push(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.push_for_announcement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_show record;
  v_title text;
  v_body text;
begin
  if tg_op = 'DELETE' then
    delete from public.push_outbox where tag = 'ann:' || old.id and sent_at is null;
    return old;
  end if;
  select id, share_token, coalesce(nullif(event_name, ''), nullif(band_name, ''), venue, 'Your event') as title
    into v_show from public.shows where id = new.show_id;
  if v_show.id is null then return new; end if;
  if new.kind = 'time_change' then
    v_title := 'Time change · ' || v_show.title;
    v_body := coalesce(new.label, 'A time') || ': ' || coalesce(new.from_time, '') || ' → ' || coalesce(new.to_time, '');
  else
    v_title := coalesce(new.author_name, 'Someone') || ' · ' || v_show.title;
    v_body := new.body;
  end if;
  perform public.queue_event_push(new.show_id, new.author_id, v_title, v_body, '/gig/web?token=' || v_show.share_token, 'ann:' || new.id);
  return new;
end;
$$;
revoke all on function public.push_for_announcement() from public, anon, authenticated;

drop trigger if exists push_for_announcement on public.event_announcements;
create trigger push_for_announcement
  after insert or update of to_time, body or delete on public.event_announcements
  for each row execute function public.push_for_announcement();

-- For the send-push function (service role only): what's waiting, with the
-- phones to send it to; then what went out and which phones are gone.
create or replace function public.push_due(p_limit integer default 200)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'title', o.title, 'body', o.body, 'url', o.url, 'tag', o.tag,
      'subs', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
               from public.push_subscriptions s where s.user_id = o.user_id))
    ), '[]'::jsonb)
  from (select * from public.push_outbox
        where sent_at is null and send_after <= now() and attempts < 5
        order by send_after limit greatest(1, least(p_limit, 500))) o;
$$;
create or replace function public.mark_push_done(p_sent uuid[], p_failed uuid[], p_gone text[])
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.push_outbox set sent_at = now(), attempts = attempts + 1 where id = any(coalesce(p_sent, '{}'));
  update public.push_outbox set attempts = attempts + 1 where id = any(coalesce(p_failed, '{}'));
  delete from public.push_subscriptions where endpoint = any(coalesce(p_gone, '{}'));
  update public.push_subscriptions set last_ok_at = now()
    where user_id in (select user_id from public.push_outbox where id = any(coalesce(p_sent, '{}')));
  delete from public.push_outbox where sent_at < now() - interval '14 days' or (sent_at is null and attempts >= 5);
$$;
revoke all on function public.push_due(integer) from public, anon, authenticated;
revoke all on function public.mark_push_done(uuid[], uuid[], text[]) from public, anon, authenticated;
grant execute on function public.push_due(integer) to service_role;
grant execute on function public.mark_push_done(uuid[], uuid[], text[]) to service_role;

-- Every minute, only when something is waiting (replaces itself if run again).
select cron.unschedule(jobid) from cron.job where jobname = 'send-push';
select cron.schedule(
  'send-push',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://tbskirwlveqbjqyvtpiz.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from public.push_outbox where sent_at is null and send_after <= now() and attempts < 5);
  $job$
);
