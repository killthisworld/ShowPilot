-- Event progress + "Not needed" profiles (job 172, 2026-10-26).
--
-- 1. shows.not_needed_roles: the profiles the owner marked "Not needed" on
--    this event (venue / manager / band / engineer / lighting), e.g. no
--    lighting tech is being hired. They drop out of the To do invites and
--    out of ROLES CONFIRMED / GIG READY. The owner writes it (shows RLS:
--    owners can update their own shows).
-- 2. get_gig_section_permissions also returns owner_account_type (so the
--    owner's own profile counts as confirmed) and not_needed_roles. The
--    live function is patched in place: only its final jsonb_build_object
--    gains the two keys; everything else stays as it is.
-- Safe to run more than once.

alter table public.shows add column if not exists not_needed_roles text[] not null default '{}';

do $$
declare
  v_def text;
  v_new text;
  v_marker text := E'''invited_count'', v_invited_count\n  );';
begin
  select pg_get_functiondef('public.get_gig_section_permissions(uuid)'::regprocedure) into v_def;
  if position('owner_account_type' in v_def) > 0 then
    raise notice 'get_gig_section_permissions already patched';
    return;
  end if;
  if position(v_marker in v_def) = 0 then
    raise exception 'get_gig_section_permissions changed since this migration was written; not patching';
  end if;
  v_new := replace(v_def, v_marker,
    E'''invited_count'', v_invited_count,\n'
    || E'    ''owner_account_type'', (select up.account_type from public.user_preferences up where up.user_id = v_show.owner_id),\n'
    || E'    ''not_needed_roles'', to_jsonb(coalesce(v_show.not_needed_roles, ''{}''::text[]))\n  );');
  execute v_new;
end $$;
