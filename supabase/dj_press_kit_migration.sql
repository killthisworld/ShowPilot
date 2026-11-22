-- DJ press kit (job 457, 2026-11-22).
--
-- A DJ's press kit lives in their artist template (saved_templates,
-- category 'artist', data.dj_kit = true), so intake forms keep filling the
-- act's name, photo, genres and contact from it. This adds the public link:
-- one row per DJ with a long random token, and a function anyone with the
-- token can call. It returns only the press-kit fields, never the rest of
-- the template (members, stage plot, notes), plus upcoming dates when the DJ
-- leaves "Show my upcoming dates" on.

create table if not exists public.dj_press_kits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  template_id uuid references public.saved_templates(id) on delete set null,
  show_dates boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dj_press_kits enable row level security;

drop policy if exists "DJs see their own press kit link" on public.dj_press_kits;
create policy "DJs see their own press kit link" on public.dj_press_kits
  for select using ((select auth.uid()) = owner_id);
drop policy if exists "DJs make their own press kit link" on public.dj_press_kits;
create policy "DJs make their own press kit link" on public.dj_press_kits
  for insert with check ((select auth.uid()) = owner_id);
drop policy if exists "DJs change their own press kit link" on public.dj_press_kits;
create policy "DJs change their own press kit link" on public.dj_press_kits
  for update using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "DJs remove their own press kit link" on public.dj_press_kits;
create policy "DJs remove their own press kit link" on public.dj_press_kits
  for delete using ((select auth.uid()) = owner_id);

-- The template a link points at must be the DJ's own.
create or replace function public.dj_press_kit_own_template() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.template_id is not null and not exists (
    select 1 from public.saved_templates t where t.id = new.template_id and t.owner_id = new.owner_id
  ) then
    raise exception 'That template is not yours';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists dj_press_kit_own_template on public.dj_press_kits;
create trigger dj_press_kit_own_template before insert or update on public.dj_press_kits
  for each row execute function public.dj_press_kit_own_template();

-- The public press kit. Null when the token is unknown or the template is gone.
create or replace function public.get_dj_press_kit(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', t.name,
    'photo_url', t.data->>'photo_url',
    'genre_tags', coalesce(t.data->'genre_tags', '[]'::jsonb),
    'city', t.data->>'kit_city',
    'bio', t.data->>'kit_bio',
    'mixes', coalesce(t.data->'kit_mixes', '[]'::jsonb),
    'press_photos', coalesce(t.data->'kit_photos', '[]'::jsonb),
    'logo_url', t.data->>'kit_logo_url',
    'links', coalesce(t.data->'kit_links', '[]'::jsonb),
    'contact_name', t.data->>'contact_name',
    'contact_email', t.data->>'contact_email',
    'contact_phone', t.data->>'contact_phone',
    'dates', case when k.show_dates then coalesce((
      select jsonb_agg(jsonb_build_object('date', d.date, 'name', d.name, 'venue', d.venue) order by d.date)
      from (
        -- The next 12, theirs or linked to them.
        select s.date, coalesce(nullif(s.event_name, ''), nullif(s.band_name, ''), 'Event') as name, coalesce(s.venue, '') as venue
        from public.shows s
        where s.date >= current_date
          and coalesce(s.archived, false) = false
          and (s.owner_id = k.owner_id or exists (
            select 1 from public.linked_gigs l
            where l.show_id = s.id and l.user_id = k.owner_id and coalesce(l.archived, false) = false
          ))
        order by s.date
        limit 12
      ) d
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.dj_press_kits k
  join public.saved_templates t on t.id = k.template_id
  where k.token = p_token and length(coalesce(p_token, '')) >= 24;
$$;

revoke all on function public.get_dj_press_kit(text) from public;
grant execute on function public.get_dj_press_kit(text) to anon, authenticated;
