-- ============================================================
-- Migration: short opener links too (showpilot.space/intake/7KQ2XM)
-- ============================================================
--
-- Follow-up to intake_short_link_migration.sql. Opener links ("Generate
-- Additional Link" on Manage Links) get a short_code as well, from the same
-- code pool: gen_intake_code() now makes sure a new code isn't already used
-- by a performer link or an opener link. get_intake_link() resolves either
-- and says which form to open ('kind'). Old long /opener-intake?token=...
-- links keep working.

create or replace function public.gen_intake_code()
returns text
language plpgsql
volatile
set search_path to 'public'
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.tour_manager_requests where short_code = v_code)
          and not exists (select 1 from public.opener_requests where short_code = v_code);
  end loop;
  return v_code;
end;
$function$;

alter table public.opener_requests add column if not exists short_code text;
update public.opener_requests set short_code = public.gen_intake_code() where short_code is null;
alter table public.opener_requests alter column short_code set default public.gen_intake_code();
create unique index if not exists opener_requests_short_code_key on public.opener_requests (short_code);

-- Code -> which form to open and what it needs.
--   performer: { kind, token, engineer, name }   opener: { kind, token }
create or replace function public.get_intake_link(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  r record;
begin
  select invite_token, engineer_user_id, engineer_name into r
  from public.tour_manager_requests where short_code = v_code;
  if found then
    return jsonb_build_object('kind', 'performer', 'token', r.invite_token, 'engineer', r.engineer_user_id, 'name', r.engineer_name);
  end if;

  select invite_token into r from public.opener_requests where short_code = v_code;
  if found then
    return jsonb_build_object('kind', 'opener', 'token', r.invite_token);
  end if;
  return null;
end;
$function$;

revoke all on function public.get_intake_link(text) from public;
grant execute on function public.get_intake_link(text) to anon, authenticated;
