-- Weekly "new shows near you" email (job 93).
-- Every Thursday at 14:00 UTC (10 AM Eastern) the fan-weekly-digest edge
-- function emails each fan who has local shows on (fan_style.discover) and
-- hasn't turned the email off (fan_style.digest = false) the listed shows in
-- their state they haven't been sent before and haven't RSVP'd to. Nothing
-- new = no email. Each email has a one-click unsubscribe link.
--
-- The schedule calls the function with a random key kept in the vault
-- (created here, never leaves the database); the function checks it with
-- check_digest_secret. Safe to run more than once.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The key the schedule sends and the function checks.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'digest_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'digest_cron_secret', 'Weekly fan digest: pg_cron -> fan-weekly-digest');
  end if;
end $$;

create or replace function public.check_digest_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_secret, '') <> ''
     and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret');
$$;
revoke all on function public.check_digest_secret(text) from public, anon, authenticated;
grant execute on function public.check_digest_secret(text) to service_role;

-- Which listed shows each fan has already had in a digest.
create table if not exists public.fan_digest_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, show_id)
);
alter table public.fan_digest_sent enable row level security;
-- No policies: only the service role (the edge function) touches it.

-- Unsubscribe without signing in: a per-fan token in the email link.
alter table public.user_preferences add column if not exists fan_digest_token uuid not null default gen_random_uuid();

-- This week's batch: one row per fan with something new (service role only).
create or replace function public.fan_digest_batch()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with fans as (
    select p.user_id, u.email, nullif(trim(p.display_name), '') as name,
      nullif(trim(p.fan_style->>'city'), '') as city, p.fan_style->>'state' as st, p.fan_digest_token as token
    from public.user_preferences p
    join auth.users u on u.id = p.user_id
    where p.account_type = 'fan'
      and p.fan_style->>'discover' = 'true'
      and coalesce(p.fan_style->>'digest', 'true') <> 'false'
      and coalesce(p.fan_style->>'state', '') <> ''
      and coalesce(u.email, '') <> ''
  ),
  picks as (
    select f.user_id, s.id as show_id, jsonb_build_object(
      'show_id', s.id,
      'fan_token', s.fan_token,
      'fan_slug', s.fan_slug,
      'event_name', s.event_name,
      'band_name', case when h ? 'band' then null else s.band_name end,
      'event_type', nullif(trim(s.event_type), ''),
      'date', s.date,
      'show_time', s.fan_page->>'show_time',
      'venue', case when s.fan_page->>'venue_where' = 'email' then null else s.venue end,
      'city', s.city,
      'state', s.state,
      'flyer_url', case when h ? 'flyer' then null else s.fan_page->>'flyer_url' end,
      'entry', case when s.fan_page->>'entry' = 'rsvp' then 'rsvp' else 'tickets' end,
      'price', case when h ? 'tickets' then null else nullif(s.promoter_info->>'ticket_price', '') end,
      'local', lower(trim(coalesce(s.city, ''))) = lower(coalesce(f.city, ''))
    ) as show,
    row_number() over (partition by f.user_id order by lower(trim(coalesce(s.city, ''))) = lower(coalesce(f.city, '')) desc, s.date) as rn
    from fans f
    join public.shows s
      on s.fan_page_enabled is true
     and coalesce(s.archived, false) = false
     and s.fan_page->>'discover' = 'true'
     and s.date >= current_date
     and s.date <= current_date + 120
    cross join lateral (select coalesce(s.fan_page->'hidden', '[]'::jsonb) as h) hid
    where not (h ? 'date') and not (h ? 'venue')
      and lower(trim(coalesce(s.state, ''))) in (lower(f.st), lower(coalesce((select n from (values
        ('AL','Alabama'),('AK','Alaska'),('AZ','Arizona'),('AR','Arkansas'),('CA','California'),('CO','Colorado'),('CT','Connecticut'),
        ('DE','Delaware'),('DC','District of Columbia'),('FL','Florida'),('GA','Georgia'),('HI','Hawaii'),('ID','Idaho'),('IL','Illinois'),
        ('IN','Indiana'),('IA','Iowa'),('KS','Kansas'),('KY','Kentucky'),('LA','Louisiana'),('ME','Maine'),('MD','Maryland'),
        ('MA','Massachusetts'),('MI','Michigan'),('MN','Minnesota'),('MS','Mississippi'),('MO','Missouri'),('MT','Montana'),('NE','Nebraska'),
        ('NV','Nevada'),('NH','New Hampshire'),('NJ','New Jersey'),('NM','New Mexico'),('NY','New York'),('NC','North Carolina'),
        ('ND','North Dakota'),('OH','Ohio'),('OK','Oklahoma'),('OR','Oregon'),('PA','Pennsylvania'),('RI','Rhode Island'),
        ('SC','South Carolina'),('SD','South Dakota'),('TN','Tennessee'),('TX','Texas'),('UT','Utah'),('VT','Vermont'),('VA','Virginia'),
        ('WA','Washington'),('WV','West Virginia'),('WI','Wisconsin'),('WY','Wyoming')) v(a, n) where v.a = f.st), '')))
      and not exists (select 1 from public.fan_digest_sent d where d.user_id = f.user_id and d.show_id = s.id)
      and not exists (select 1 from public.fan_rsvps r where r.show_id = s.id and lower(r.email) = lower(f.email))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', f.user_id, 'email', f.email, 'name', f.name, 'city', f.city, 'state', f.st, 'token', f.token,
    'shows', (select jsonb_agg(p.show order by p.rn) from picks p where p.user_id = f.user_id and p.rn <= 6),
    'more', greatest(0, (select count(*) from picks p where p.user_id = f.user_id) - 6)
  )), '[]'::jsonb)
  from fans f
  where exists (select 1 from picks p where p.user_id = f.user_id);
$$;
revoke all on function public.fan_digest_batch() from public, anon, authenticated;
grant execute on function public.fan_digest_batch() to service_role;

-- After a fan's email goes out, remember every show it covered.
create or replace function public.mark_fan_digest_sent(p_user_id uuid, p_show_ids uuid[])
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.fan_digest_sent (user_id, show_id)
  select p_user_id, x from unnest(p_show_ids) x
  on conflict do nothing;
$$;
revoke all on function public.mark_fan_digest_sent(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mark_fan_digest_sent(uuid, uuid[]) to service_role;

-- One-click unsubscribe from the email link (no sign-in needed).
create or replace function public.unsubscribe_fan_digest(p_token uuid)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  with u as (
    update public.user_preferences
       set fan_style = coalesce(fan_style, '{}'::jsonb) || '{"digest": false}'::jsonb
     where fan_digest_token = p_token
    returning 1
  )
  select exists (select 1 from u);
$$;
revoke all on function public.unsubscribe_fan_digest(uuid) from public;
grant execute on function public.unsubscribe_fan_digest(uuid) to anon, authenticated;

-- The weekly schedule (replaces itself if run again).
select cron.unschedule(jobid) from cron.job where jobname = 'fan-weekly-digest';
select cron.schedule(
  'fan-weekly-digest',
  '0 14 * * 4',
  $job$
  select net.http_post(
    url := 'https://tbskirwlveqbjqyvtpiz.supabase.co/functions/v1/fan-weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
