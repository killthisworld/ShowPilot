-- People and merch per act (job 73, "one act vs many" stage 3, 2026-11-11).
--
-- An account managing more than one act can tie each touring party member
-- and each merch item to one of its acts. Null means "every act" (and is
-- what every existing row and every one-act account keeps). Both tables stay
-- private to their owner; the existing owner-only policies cover the new
-- column. The act is stored by name, as the act switcher and event lineups
-- match acts by name.

alter table public.touring_party add column if not exists act_name text;
alter table public.merch_items add column if not exists act_name text;

alter table public.touring_party drop constraint if exists touring_party_act_name_len;
alter table public.touring_party add constraint touring_party_act_name_len check (act_name is null or length(trim(act_name)) between 1 and 80);
alter table public.merch_items drop constraint if exists merch_items_act_name_len;
alter table public.merch_items add constraint merch_items_act_name_len check (act_name is null or length(trim(act_name)) between 1 and 80);
