-- Merch counts (job 73, "On the road" stage 8, 2026-11-11).
--
-- An artist / manager keeps their merch once (name, price, sizes), then
-- counts each night: what went out before doors and what came back after the
-- show; sold = in - out. Both tables are private to the account that owns
-- them. Counts are tied to an event so each night stands on its own.

create table if not exists public.merch_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null check (length(trim(name)) between 1 and 60),
  price numeric check (price is null or price >= 0),
  sizes text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists merch_items_owner_idx on public.merch_items (owner_id, created_at);

create table if not exists public.merch_counts (
  owner_id uuid not null default auth.uid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  item_id uuid not null references public.merch_items(id) on delete cascade,
  size text not null default '',
  count_in integer not null default 0 check (count_in >= 0),
  count_out integer not null default 0 check (count_out >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, show_id, item_id, size)
);

alter table public.merch_items enable row level security;
alter table public.merch_counts enable row level security;

drop policy if exists "Own merch items" on public.merch_items;
drop policy if exists "Own merch counts" on public.merch_counts;
create policy "Own merch items" on public.merch_items for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Own merch counts" on public.merch_counts for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
    and exists (select 1 from public.merch_items i where i.id = item_id and i.owner_id = auth.uid()));

grant select, insert, update, delete on public.merch_items to authenticated;
grant select, insert, update, delete on public.merch_counts to authenticated;
