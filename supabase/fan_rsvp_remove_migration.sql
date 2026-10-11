-- ============================================================
-- Migration: hosts can remove RSVPs (e.g. test RSVPs)
-- ============================================================
--
-- remove_fan_rsvp(p_rsvp_id) deletes one RSVP for an event the signed-in
-- user owns, and also clears that address's "already emailed" record for the
-- event, so if the same person RSVPs again for real they get the
-- confirmation email. Returns false (and deletes nothing) when the RSVP
-- doesn't exist or belongs to someone else's event.
--
-- A function rather than a delete policy, so both rows always go together.

create or replace function public.remove_fan_rsvp(p_rsvp_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if auth.uid() is null then
    return false;
  end if;

  select fr.id, fr.show_id, fr.email into r
  from public.fan_rsvps fr
  join public.shows s on s.id = fr.show_id
  where fr.id = p_rsvp_id and s.owner_id = auth.uid();

  if not found then
    return false;
  end if;

  delete from public.fan_email_signups
  where show_id = r.show_id and lower(email) = lower(r.email);

  delete from public.fan_rsvps where id = r.id;
  return true;
end;
$$;

revoke all on function public.remove_fan_rsvp(uuid) from public, anon;
grant execute on function public.remove_fan_rsvp(uuid) to authenticated;
