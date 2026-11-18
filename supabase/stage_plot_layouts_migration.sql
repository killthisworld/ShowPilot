-- Job 342: a received stage plot is the sender's. The audio engineer lays it
-- out his own way, kept on his own account and shown only to him.

alter table public.user_preferences
  add column if not exists stage_plot_layouts jsonb not null default '{}'::jsonb;

-- Moving people on an act now belongs to the event owner and the Manager /
-- Artist (the sender's side) only. Audio / Lighting no longer write to it.
create or replace function public.set_stage_positions(p_token uuid, p_band jsonb, p_positions jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_show public.shows;
  v_ok boolean;
  v_members jsonb;
  v_band_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;
  select * into v_show from public.shows where share_token = p_token;
  if v_show.id is null then
    raise exception 'Invalid share link';
  end if;

  v_ok := v_show.owner_id = v_uid or exists (
    select 1 from public.gig_invites gi
    where gi.show_id = v_show.id and gi.status = 'accepted' and gi.accepted_by = v_uid
      and (gi.invited_role in ('manager', 'band')
           or coalesce(gi.granted_sections, '{}'::text[]) && array['manager']::text[])
  );
  if not v_ok then
    raise exception 'Only the owner or the Manager / Artist can move people on the stage';
  end if;

  if coalesce(p_band->>'id', '') ~ '^[0-9a-fA-F-]{36}$' then
    select id into v_band_id from public.show_bands where id = (p_band->>'id')::uuid and show_id = v_show.id;
  elsif coalesce(p_band->>'sort_order', '') ~ '^-?[0-9]+$' then
    select id into v_band_id from public.show_bands
     where show_id = v_show.id and sort_order = (p_band->>'sort_order')::int
       and coalesce(band_name, '') = coalesce(p_band->>'band_name', '')
     order by created_at limit 1;
  end if;
  if v_band_id is null then
    raise exception 'That act is not on this event';
  end if;

  select coalesce(jsonb_agg(
           case when pe.e is null then t.m
                when jsonb_typeof(pe.e->'x') = 'number' and jsonb_typeof(pe.e->'y') = 'number'
                  then t.m || jsonb_build_object(
                    'stage_x', least(1, greatest(0, (pe.e->>'x')::numeric)),
                    'stage_y', least(1, greatest(0, (pe.e->>'y')::numeric)))
                else t.m - 'stage_x' - 'stage_y' end
           order by t.ord), '[]'::jsonb)
    into v_members
    from public.show_bands b
    cross join lateral jsonb_array_elements(coalesce(b.band_members, '[]'::jsonb)) with ordinality t(m, ord)
    left join lateral (
      select e from jsonb_array_elements(coalesce(p_positions, '[]'::jsonb)) e
      where (e->>'i') ~ '^[0-9]+$' and (e->>'i')::int = t.ord - 1
      limit 1
    ) pe on true
   where b.id = v_band_id;

  update public.show_bands
     set band_members = v_members, updated_at = now()
   where id = v_band_id;

  return v_members;
end $function$;
