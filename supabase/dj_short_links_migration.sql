-- Short DJ set links (job 375, Jay 2026-11-19).
--
-- Each act's set link was /dj/set/<32-character token>. Now every slot also
-- gets an 8-letter code, and the link the DJ copies or shares is /s/<code>.
-- The app's /s/<code> page asks dj_slot_by_code for that one slot's token
-- and opens /dj/set/<token>, so the short link gives exactly what the long
-- one did (and the long links already sent keep working).
--
-- Codes use the same letters as the day-of package codes (no 0 / O / 1 / I
-- / l). Safe to run again.

alter table public.dj_set_slots add column if not exists short_code text;
create unique index if not exists dj_set_slots_short_code_idx on public.dj_set_slots (short_code);

create or replace function public.dj_new_short_code()
returns text
language plpgsql
volatile
set search_path to 'public', 'extensions'
as $$
declare
  v text;
begin
  loop
    -- Capitals first, then drop the look-alikes (0 O 1 I L) and base64's + / =.
    v := substr(translate(upper(encode(gen_random_bytes(12), 'base64')), '+/=0O1IL', ''), 1, 8);
    exit when length(v) = 8 and not exists (select 1 from public.dj_set_slots where short_code = v);
  end loop;
  return v;
end;
$$;
revoke all on function public.dj_new_short_code() from public, anon, authenticated;

-- New slots get a code as they're made.
create or replace function public.dj_slot_short_code()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.short_code is null then new.short_code := public.dj_new_short_code(); end if;
  return new;
end;
$$;
revoke all on function public.dj_slot_short_code() from public, anon, authenticated;
drop trigger if exists dj_slot_short_code on public.dj_set_slots;
create trigger dj_slot_short_code before insert on public.dj_set_slots
  for each row execute function public.dj_slot_short_code();

-- Slots made before this get one too.
update public.dj_set_slots set short_code = public.dj_new_short_code() where short_code is null;

-- The short link's page: the slot's token for a code, or null.
create or replace function public.dj_slot_by_code(p_code text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select token from public.dj_set_slots where short_code = upper(trim(p_code)) limit 1;
$$;
revoke all on function public.dj_slot_by_code(text) from public;
grant execute on function public.dj_slot_by_code(text) to anon, authenticated;
