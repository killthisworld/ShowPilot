-- Gig Wrap: the post-show "the web comes together into a star" moment.
-- Scope for this pass (per Jay - animation first, real push notifications
-- as a later follow-up): no push infrastructure here. A show becomes
-- eligible for its wrap-up once its calendar date is in the past (there's
-- no structured show end-time yet, only a free-text Door Time field, so
-- "date < today" is the honest MVP definition - it always waits at least
-- until the day after, which in practice means well past a same-night
-- show's actual end). Each participant sees their own celebration the
-- next time they open the app after that, once, ever - gig_wrap_views is
-- the per (show, viewer) memory of that.
--
-- Same access model as gig_tasks/show_requirements: RLS enabled with zero
-- policies, every read/write through SECURITY DEFINER RPCs.

create table if not exists public.gig_wrap_views (
  show_id uuid not null references public.shows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamp with time zone not null default now(),
  primary key (show_id, user_id)
);

alter table public.gig_wrap_views enable row level security;

create index if not exists gig_wrap_views_user_id_idx on public.gig_wrap_views (user_id);

-- Every show this signed-in caller is connected to (owns, or holds an
-- accepted invite on) whose date has passed and that they haven't been
-- shown the wrap-up celebration for yet. Ordered most-recently-ended
-- first, so if more than one is waiting, the freshest one plays first
-- and the rest stay queued for next time.
create or replace function public.get_unseen_gig_wraps()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_to_json(w) order by w.date desc), '[]'::jsonb)
  into v_result
  from (
    select
      s.id, s.share_token, s.event_name, s.band_name, s.venue, s.date, s.included_sections,
      coalesce((
        select array_agg(distinct gi.invited_role)
        from public.gig_invites gi
        where gi.show_id = s.id and gi.status = 'accepted'
      ), '{}') as claimed_roles,
      coalesce((
        select array_agg(distinct gi.invited_role)
        from public.gig_invites gi
        where gi.show_id = s.id
      ), '{}') as invited_roles
    from public.shows s
    where (
      s.owner_id = auth.uid()
      or exists (
        select 1 from public.gig_invites gi
        where gi.show_id = s.id and gi.status = 'accepted' and gi.accepted_by = auth.uid()
      )
    )
    and s.date is not null
    and s.date < current_date
    and not exists (
      select 1 from public.gig_wrap_views v
      where v.show_id = s.id and v.user_id = auth.uid()
    )
  ) w;

  return v_result;
end;
$function$;

-- Every (show_id, share_token) pair this caller has already had their
-- wrap-up celebration for - fetched once alongside their gig list so a
-- show's star can stay visibly "closed out" on every future visit, not
-- just the one where the animation played.
create or replace function public.get_my_gig_wrap_views()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  into v_result
  from (
    select s.id as show_id, s.share_token
    from public.gig_wrap_views v
    join public.shows s on s.id = v.show_id
    where v.user_id = auth.uid()
  ) r;

  return v_result;
end;
$function$;

-- Marks this caller's own wrap-up celebration for a show as seen. No
-- permission check beyond being signed in - it only ever writes a row
-- scoped to auth.uid(), and get_unseen_gig_wraps already gates who a
-- show is even offered to, so there's nothing to protect here.
create or replace function public.mark_gig_wrap_seen(p_show_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  insert into public.gig_wrap_views (show_id, user_id)
  values (p_show_id, auth.uid())
  on conflict (show_id, user_id) do nothing;
end;
$function$;
