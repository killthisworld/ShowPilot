-- ============================================================
-- Migration: short Performer Intake links (showpilot.space/intake/7KQ2XM)
-- ============================================================
--
-- Every tour_manager_requests row gets a 6-character short_code (letters and
-- digits that can't be mixed up: no 0/O, 1/I/L). The app links to
-- /intake/<code>; get_intake_link() turns the code into what the form needs
-- (the request's invite token, the engineer's id and name). The old long
-- /tm-intake?token=... links keep working.

create or replace function public.gen_intake_code()
returns text
language plpgsql
volatile
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1);
  end loop;
  return v_code;
end;
$function$;

alter table public.tour_manager_requests add column if not exists short_code text;
update public.tour_manager_requests set short_code = public.gen_intake_code() where short_code is null;
alter table public.tour_manager_requests alter column short_code set default public.gen_intake_code();
create unique index if not exists tour_manager_requests_short_code_key on public.tour_manager_requests (short_code);

-- Code -> what the intake form needs. Anyone with the link may read this,
-- same as the long link (which carries all three in the URL).
create or replace function public.get_intake_link(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r record;
begin
  select invite_token, engineer_user_id, engineer_name into r
  from public.tour_manager_requests
  where short_code = upper(btrim(coalesce(p_code, '')));
  if not found then
    return null;
  end if;
  return jsonb_build_object('token', r.invite_token, 'engineer', r.engineer_user_id, 'name', r.engineer_name);
end;
$function$;

revoke all on function public.get_intake_link(text) from public;
grant execute on function public.get_intake_link(text) to anon, authenticated;
