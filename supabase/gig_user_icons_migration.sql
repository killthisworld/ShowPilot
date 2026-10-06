-- Personal event icons: each person linked to a gig can set their own image
-- for it, visible only to them. Falls back to shows.icon_url (the owner's
-- shared icon), then the automatic event-type icon.
create table if not exists public.gig_user_icons (
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  icon_url text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, show_id)
);

alter table public.gig_user_icons enable row level security;

create policy "Users view their own gig icons" on public.gig_user_icons
  for select using (auth.uid() = user_id);
create policy "Users add their own gig icons" on public.gig_user_icons
  for insert with check (auth.uid() = user_id);
create policy "Users change their own gig icons" on public.gig_user_icons
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users remove their own gig icons" on public.gig_user_icons
  for delete using (auth.uid() = user_id);
