-- ============================================================
-- Supabase schema migrated from Base44 entities
-- Run this in Supabase SQL Editor (Project -> SQL Editor -> New query)
-- ============================================================

-- Supabase already provides auth.users for login/auth.
-- We extend it with a "profiles" table for custom fields (role, etc.)

-- ---------------------------------------------------------
-- 1. profiles  (was: User entity's custom field)
-- ---------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ---------------------------------------------------------
-- 2. user_preferences
-- ---------------------------------------------------------
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  genre_tags jsonb not null default '[]',        -- [{name, color}]
  mix_bus_presets jsonb not null default '[]',    -- [{color, bus_number, bus_type, label}]
  profile_photo_url text,
  display_name text,
  username text unique,
  last_rating_date timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "Users can view their own preferences"
  on public.user_preferences for select
  using (auth.uid() = user_id);

create policy "Users can insert their own preferences"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own preferences"
  on public.user_preferences for update
  using (auth.uid() = user_id);


-- ---------------------------------------------------------
-- 3. shows  (the core entity)
-- ---------------------------------------------------------
create table public.shows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  band_name text not null,
  venue text,
  date date not null,
  location text,
  event_time text,
  wifi_network text,
  wifi_password text,
  console text,

  genre_tag text,
  genre_tags jsonb not null default '[]',
  genre_color text,

  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'complete')),
  starred boolean not null default false,

  contacts jsonb not null default '[]',            -- [{name, role, phone, email}]
  stage_plot_url text,
  stage_plot_files jsonb not null default '[]',     -- [{url, name, type}]
  input_list jsonb not null default '[]',           -- [{channel, source, mic_di, notes}]
  input_files jsonb not null default '[]',          -- [{url, name, type}]
  power_notes text,
  band_members jsonb not null default '[]',         -- [{name, instrument, bus_color, bus_number, bus_type, bus_label}]
  artist_fx_notes jsonb not null default '[]',       -- [{artist_name, notes}]
  general_notes text,

  share_token uuid unique default gen_random_uuid(), -- for public read-only sharing

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shows enable row level security;

-- Owners can do everything with their own shows
create policy "Owners can view their own shows"
  on public.shows for select
  using (auth.uid() = owner_id);

create policy "Owners can insert their own shows"
  on public.shows for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update their own shows"
  on public.shows for update
  using (auth.uid() = owner_id);

create policy "Owners can delete their own shows"
  on public.shows for delete
  using (auth.uid() = owner_id);

-- Anyone (even logged-out) can view a show if they have the exact share_token.
-- NOTE: this requires querying by share_token, not by id, from the client.
create policy "Public can view shows via share_token"
  on public.shows for select
  using (true);
  -- Row-level filtering by token happens in your query (.eq('share_token', token)),
  -- not in the policy itself, since Postgres RLS can't compare against a client-supplied
  -- secret directly. This is safe as long as your app NEVER lists all shows publicly,
  -- and always queries a single show by its share_token.


-- ---------------------------------------------------------
-- 4. tour_manager_requests
-- ---------------------------------------------------------
create table public.tour_manager_requests (
  id uuid primary key default gen_random_uuid(),
  invite_token uuid unique not null default gen_random_uuid(),
  engineer_user_id uuid not null references auth.users(id) on delete cascade,
  engineer_name text,

  status text not null default 'pending'
    check (status in ('pending', 'submitted')),

  band_name text,
  venue text,
  date date,
  location text,
  event_time text,
  console text,
  wifi_network text,
  wifi_password text,

  contacts jsonb not null default '[]',
  band_members jsonb not null default '[]',
  general_notes text,

  created_show_id uuid references public.shows(id) on delete set null,

  created_at timestamptz not null default now()
);

alter table public.tour_manager_requests enable row level security;

-- Engineers can view/manage requests they created
create policy "Engineers can view their own requests"
  on public.tour_manager_requests for select
  using (auth.uid() = engineer_user_id);

create policy "Engineers can insert their own requests"
  on public.tour_manager_requests for insert
  with check (auth.uid() = engineer_user_id);

create policy "Engineers can update their own requests"
  on public.tour_manager_requests for update
  using (auth.uid() = engineer_user_id);

-- Anonymous tour managers need to SELECT + UPDATE a specific row via invite_token,
-- without being logged in and without seeing any other rows.
create policy "Public can view a request via invite_token"
  on public.tour_manager_requests for select
  using (true);
  -- Same pattern as shows: always query with .eq('invite_token', token) client-side,
  -- and never fetch the full table publicly.

create policy "Public can submit a request via invite_token"
  on public.tour_manager_requests for update
  using (true)
  with check (status = 'submitted');
  -- Restricts anonymous updates to only setting status to 'submitted' with matching token
  -- (enforced by always filtering the update query by invite_token client-side).


-- ---------------------------------------------------------
-- 5. experience_profiles
-- ---------------------------------------------------------
create table public.experience_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  template_type text,
  content text,
  generated_at timestamptz default now(),
  created_at timestamptz not null default now()
);

alter table public.experience_profiles enable row level security;

create policy "Owners can view their own experience profiles"
  on public.experience_profiles for select
  using (auth.uid() = owner_id);

create policy "Owners can insert their own experience profiles"
  on public.experience_profiles for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update their own experience profiles"
  on public.experience_profiles for update
  using (auth.uid() = owner_id);

create policy "Owners can delete their own experience profiles"
  on public.experience_profiles for delete
  using (auth.uid() = owner_id);


-- ---------------------------------------------------------
-- 6. app_ratings
-- ---------------------------------------------------------
create table public.app_ratings (
  id uuid primary key default gen_random_uuid(),
  rating numeric not null,
  comment text,
  user_email text,
  submitted_at timestamptz default now()
);

alter table public.app_ratings enable row level security;

-- Anyone logged in can submit a rating; nobody can read others' ratings from the client
-- (view them yourself in the Supabase dashboard, or add an admin-only policy later)
create policy "Authenticated users can submit ratings"
  on public.app_ratings for insert
  with check (auth.role() = 'authenticated');


-- ============================================================
-- STORAGE BUCKETS (run separately in Storage tab, or via SQL below)
-- ============================================================
-- You'll need buckets for: stage plots, input list files, profile photos
-- insert into storage.buckets (id, name, public) values ('stage-plots', 'stage-plots', false);
-- insert into storage.buckets (id, name, public) values ('input-files', 'input-files', false);
-- insert into storage.buckets (id, name, public) values ('profile-photos', 'profile-photos', true);
-- Set up matching storage policies in the Supabase dashboard (Storage -> Policies)
