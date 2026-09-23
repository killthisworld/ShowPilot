-- Real headcount for the gig, alongside the existing deduplicated
-- claimed_roles/invited_roles arrays. Those arrays cap out at one entry
-- per section (5 max) since they're `array_agg(distinct invited_role)`,
-- which is fine for "which sections are covered" but can't show "7
-- claimed, 4 invited" once a gig has more than one person per section -
-- exactly the multi-person-per-role, tens-of-collaborators scale this is
-- for. claimed_count/invited_count instead count actual gig_invites rows:
-- claimed = accepted invites, invited = invites still pending acceptance.
--
-- Additive only - every other field in get_gig_section_permissions is
-- unchanged from the current live definition.
create or replace function public.get_gig_section_permissions(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_show record;
  v_is_owner boolean := false;
  v_my_roles text[] := '{}';
  v_claimed_roles text[] := '{}';
  v_invited_roles text[] := '{}';
  v_granted_sections text[] := '{}';
  v_claimed_count integer := 0;
  v_invited_count integer := 0;
begin
  select * into v_show from public.shows where share_token = p_token;
  if v_show is null then
    return null;
  end if;

  v_is_owner := (auth.uid() is not null and auth.uid() = v_show.owner_id);

  if auth.uid() is not null then
    select coalesce(array_agg(distinct invited_role), '{}')
    into v_my_roles
    from public.gig_invites
    where show_id = v_show.id and status = 'accepted' and accepted_by = auth.uid();

    -- Sections the owner explicitly delegated to this person on top of
    -- their own role, set at invite time (e.g. also let the venue edit
    -- the promoter section). Any of this user's accepted invites for this
    -- show can carry a grant, so union across all of them.
    select coalesce(array_agg(distinct g), '{}')
    into v_granted_sections
    from public.gig_invites gi, unnest(coalesce(gi.granted_sections, '{}')) as g
    where gi.show_id = v_show.id and gi.status = 'accepted' and gi.accepted_by = auth.uid();
  end if;

  select coalesce(array_agg(distinct invited_role), '{}')
  into v_claimed_roles
  from public.gig_invites
  where show_id = v_show.id and status = 'accepted';

  select coalesce(array_agg(distinct invited_role), '{}')
  into v_invited_roles
  from public.gig_invites
  where show_id = v_show.id;

  select count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'pending')
  into v_claimed_count, v_invited_count
  from public.gig_invites
  where show_id = v_show.id;

  return jsonb_build_object(
    'is_owner', v_is_owner,
    'my_roles', to_jsonb(v_my_roles),
    'claimed_roles', to_jsonb(v_claimed_roles),
    'invited_roles', to_jsonb(v_invited_roles),
    'granted_sections', to_jsonb(v_granted_sections),
    'claimed_count', v_claimed_count,
    'invited_count', v_invited_count
  );
end;
$function$;
