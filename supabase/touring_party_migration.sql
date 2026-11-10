-- The touring party (job 73, "On the road" stage 6, 2026-11-10).
--
-- A band or manager adds their people once: members and crew, with a role,
-- a phone and an email, and how much they should see (everything, no money,
-- or just the day sheet). Used on the phone to send each person the day
-- sheet by text or email, even when they're not on Show Pilot. Private to
-- the account that made it.

create table if not exists public.touring_party (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null check (length(trim(name)) between 1 and 80),
  role text,
  phone text,
  email text,
  sees text not null default 'no_money' check (sees in ('all', 'no_money', 'day_sheet')),
  created_at timestamptz not null default now()
);
create index if not exists touring_party_owner_idx on public.touring_party (owner_id, created_at);

alter table public.touring_party enable row level security;

drop policy if exists "Own party: read" on public.touring_party;
drop policy if exists "Own party: add" on public.touring_party;
drop policy if exists "Own party: change" on public.touring_party;
drop policy if exists "Own party: remove" on public.touring_party;
create policy "Own party: read" on public.touring_party for select to authenticated using (owner_id = auth.uid());
create policy "Own party: add" on public.touring_party for insert to authenticated with check (owner_id = auth.uid());
create policy "Own party: change" on public.touring_party for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Own party: remove" on public.touring_party for delete to authenticated using (owner_id = auth.uid());

grant select, insert, update, delete on public.touring_party to authenticated;
