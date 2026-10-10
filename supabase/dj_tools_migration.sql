-- DJ tools: per-event set links, lineup slots, and Google Drive delivery.
--
-- A DJ (Manager / Artist profile) connects their own Google Drive once, makes
-- a "set request" for an event, adds the lineup as ordered slots, and sends
-- each artist their slot's link. The artist (no account needed) opens
-- /dj/set/<token>, fills in their track list in play order, gear needs and
-- announce notes, and attaches WAV files. The WAVs go straight from the
-- artist's browser into the DJ's Drive (Show Pilot never stores the audio);
-- only the track list, settings and file references live here.
--
-- Security:
-- * Drive tokens and OAuth states are server-only (RLS on, no policies,
--   privileges revoked): only the dj-drive / dj-set-upload edge functions
--   (service role) can read them.
-- * Set requests and slots are readable and writable only by their owner.
-- * Artists never touch the tables directly. They go through two SECURITY
--   DEFINER functions that take the slot's own token and expose only that
--   slot plus the event basics and running order (names and times).
-- * Uploaded-file rows are written only by the edge function after it has
--   checked the file really landed in that slot's Drive folder, and a track
--   can only point at a file recorded for its own slot.
-- * Nothing is added to public.shows (see work board job 2: that table is
--   currently readable by anyone).

-- ---------------------------------------------------------------------------
-- Drive connection (one per user) and short-lived OAuth states
-- ---------------------------------------------------------------------------
create table if not exists public.dj_drive_connections (
  owner_id        uuid primary key references auth.users(id) on delete cascade,
  provider        text not null default 'google',
  account_email   text,
  refresh_token   text not null,
  root_folder_id  text,                       -- "Show Pilot" folder in their Drive
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.dj_oauth_states (
  state       text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  return_to   text,
  created_at  timestamptz not null default now()
);

alter table public.dj_drive_connections enable row level security;
alter table public.dj_oauth_states      enable row level security;
revoke all on public.dj_drive_connections from anon, authenticated;
revoke all on public.dj_oauth_states      from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Set requests (one per event) and lineup slots (one per artist)
-- ---------------------------------------------------------------------------
create table if not exists public.dj_set_requests (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  show_id          uuid references public.shows(id) on delete set null,
  title            text not null check (char_length(title) between 1 and 120),
  event_date       date,
  venue            text check (venue is null or char_length(venue) <= 120),
  due_at           timestamptz,
  note             text check (note is null or char_length(note) <= 2000),
  drive_folder_id  text,                      -- event folder, made on first upload
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists dj_set_requests_owner_idx on public.dj_set_requests (owner_id, event_date);

create table if not exists public.dj_set_slots (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null references public.dj_set_requests(id) on delete cascade,
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position         int not null default 1,
  artist_name      text not null default '' check (char_length(artist_name) <= 120),
  set_start        text check (set_start is null or set_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  set_end          text check (set_end is null or set_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  token            text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status           text not null default 'waiting' check (status in ('waiting', 'started', 'submitted')),
  tracks           jsonb not null default '[]'::jsonb,
  gear             jsonb not null default '{}'::jsonb,
  announce         text check (announce is null or char_length(announce) <= 1000),
  contact          text check (contact is null or char_length(contact) <= 200),
  drive_folder_id  text,                      -- this artist's folder, made on first upload
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists dj_set_slots_request_idx on public.dj_set_slots (request_id, position);

-- A slot always belongs to the same owner as its request.
create or replace function public.dj_slot_owner_matches()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select owner_id into new.owner_id from public.dj_set_requests where id = new.request_id;
  if new.owner_id is null then raise exception 'Unknown set request'; end if;
  return new;
end $$;
drop trigger if exists dj_slot_owner_matches on public.dj_set_slots;
create trigger dj_slot_owner_matches before insert or update of request_id on public.dj_set_slots
  for each row execute function public.dj_slot_owner_matches();

-- Files that really arrived in a slot's Drive folder (written by the edge function).
create table if not exists public.dj_set_files (
  id             uuid primary key default gen_random_uuid(),
  slot_id        uuid not null references public.dj_set_slots(id) on delete cascade,
  drive_file_id  text not null unique,
  name           text,
  size_bytes     bigint,
  sample_rate    int,
  bit_depth      int,
  channels       int,
  duration_sec   numeric,
  web_view_link  text,
  created_at     timestamptz not null default now()
);
create index if not exists dj_set_files_slot_idx on public.dj_set_files (slot_id);

alter table public.dj_set_requests enable row level security;
alter table public.dj_set_slots    enable row level security;
alter table public.dj_set_files    enable row level security;
revoke all on public.dj_set_requests from anon;
revoke all on public.dj_set_slots    from anon;
revoke all on public.dj_set_files    from anon, authenticated;
grant select, insert, update, delete on public.dj_set_requests to authenticated;
grant select, insert, update, delete on public.dj_set_slots    to authenticated;
grant select on public.dj_set_files to authenticated;

drop policy if exists "Owners manage their set requests" on public.dj_set_requests;
create policy "Owners manage their set requests" on public.dj_set_requests
  for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners manage their lineup slots" on public.dj_set_slots;
create policy "Owners manage their lineup slots" on public.dj_set_slots
  for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Owners see files sent to their slots" on public.dj_set_files;
create policy "Owners see files sent to their slots" on public.dj_set_files
  for select to authenticated
  using (exists (select 1 from public.dj_set_slots s where s.id = slot_id and s.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Artist-facing functions (token-gated)
-- ---------------------------------------------------------------------------

-- Everything the artist's page needs for one slot, or null for a bad token.
create or replace function public.get_dj_slot(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.dj_set_slots;
  r public.dj_set_requests;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into s from public.dj_set_slots where token = p_token;
  if s.id is null then return null; end if;
  select * into r from public.dj_set_requests where id = s.request_id;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'title', r.title, 'event_date', r.event_date, 'venue', r.venue,
      'due_at', r.due_at, 'note', r.note,
      'dj_name', (select nullif(display_name, '') from public.user_preferences where user_id = r.owner_id),
      'drive_connected', exists (select 1 from public.dj_drive_connections c where c.owner_id = r.owner_id)
    ),
    'slot', jsonb_build_object(
      'position', s.position, 'artist_name', s.artist_name,
      'set_start', s.set_start, 'set_end', s.set_end,
      'status', s.status, 'submitted_at', s.submitted_at,
      'tracks', s.tracks, 'gear', s.gear, 'announce', s.announce, 'contact', s.contact
    ),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.drive_file_id, 'name', f.name, 'size_bytes', f.size_bytes,
        'sample_rate', f.sample_rate, 'bit_depth', f.bit_depth, 'channels', f.channels,
        'duration_sec', f.duration_sec) order by f.created_at)
      from public.dj_set_files f where f.slot_id = s.id), '[]'::jsonb),
    'lineup', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', x.position, 'artist_name', x.artist_name,
        'set_start', x.set_start, 'set_end', x.set_end, 'is_you', x.id = s.id)
        order by x.position, x.created_at)
      from public.dj_set_slots x where x.request_id = s.request_id), '[]'::jsonb)
  );
end $$;

-- Save the artist's part. Track text is trimmed and capped; a track's file_id
-- is kept only if that file was recorded for this slot. p_submit marks the
-- set as handed in (it can still be edited afterwards; the DJ sees the time).
create or replace function public.save_dj_slot(
  p_token text,
  p_artist_name text,
  p_tracks jsonb,
  p_gear jsonb,
  p_announce text,
  p_contact text,
  p_submit boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.dj_set_slots;
  clean jsonb := '[]'::jsonb;
  t jsonb;
  fid text;
  n int := 0;
  allowed_gear text[] := array['cdj','turntables','mixer','usb','laptop','controller','mic','monitors','other'];
  g jsonb := '{}'::jsonb;
  k text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'Link not found'; end if;
  select * into s from public.dj_set_slots where token = p_token for update;
  if s.id is null then raise exception 'Link not found'; end if;

  if jsonb_typeof(coalesce(p_tracks, '[]'::jsonb)) <> 'array' then raise exception 'Bad track list'; end if;
  for t in select * from jsonb_array_elements(coalesce(p_tracks, '[]'::jsonb)) loop
    n := n + 1;
    exit when n > 150;
    if jsonb_typeof(t) <> 'object' then continue; end if;
    fid := nullif(left(coalesce(t->>'file_id', ''), 200), '');
    if fid is not null and not exists (select 1 from public.dj_set_files f where f.slot_id = s.id and f.drive_file_id = fid) then
      fid := null;
    end if;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'title',  left(btrim(coalesce(t->>'title', '')), 160),
      'artist', left(btrim(coalesce(t->>'artist', '')), 160),
      'bpm',    left(btrim(coalesce(t->>'bpm', '')), 10),
      'key',    left(btrim(coalesce(t->>'key', '')), 12),
      'notes',  left(btrim(coalesce(t->>'notes', '')), 400),
      'file_id', fid
    ));
  end loop;

  if jsonb_typeof(coalesce(p_gear, '{}'::jsonb)) = 'object' then
    foreach k in array allowed_gear loop
      if (p_gear ? k) then
        g := g || jsonb_build_object(k, case when k = 'other'
          then to_jsonb(left(coalesce(p_gear->>k, ''), 300))
          else to_jsonb((p_gear->k) = 'true'::jsonb) end);
      end if;
    end loop;
  end if;

  update public.dj_set_slots set
    artist_name  = left(btrim(coalesce(nullif(p_artist_name, ''), artist_name)), 120),
    tracks       = clean,
    gear         = g,
    announce     = nullif(left(btrim(coalesce(p_announce, '')), 1000), ''),
    contact      = nullif(left(btrim(coalesce(p_contact, '')), 200), ''),
    status       = case when p_submit then 'submitted' when status = 'submitted' then 'submitted' else 'started' end,
    submitted_at = case when p_submit then now() else submitted_at end,
    updated_at   = now()
  where id = s.id;

  return public.get_dj_slot(p_token);
end $$;

revoke all on function public.get_dj_slot(text) from public;
revoke all on function public.save_dj_slot(text, text, jsonb, jsonb, text, text, boolean) from public;
grant execute on function public.get_dj_slot(text) to anon, authenticated;
grant execute on function public.save_dj_slot(text, text, jsonb, jsonb, text, text, boolean) to anon, authenticated;
revoke all on function public.dj_slot_owner_matches() from public;
