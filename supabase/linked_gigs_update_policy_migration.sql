-- Linked events: let people update their own rows (job 4 follow-up, 2026-10-21).
--
-- linked_gigs had select / insert / delete policies but no UPDATE policy, so
-- with RLS on every update matched 0 rows: archiving or unarchiving an event
-- someone shared with you (Home, Linked, Archived) looked like it worked but
-- nothing was saved, and re-saving a shared event (an upsert that hits the
-- existing row) errored. Same owner check as the other policies.

drop policy if exists "Users can update their own linked gigs" on public.linked_gigs;
create policy "Users can update their own linked gigs" on public.linked_gigs
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
