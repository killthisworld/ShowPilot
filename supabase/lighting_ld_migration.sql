-- Job 377 (2026-11-19): the LD (lighting tech) intake.
--
--   show_bands / opener_requests / tour_manager_requests.lighting_cues jsonb
--     The act's lighting cue sheet: { songs: [{ title, bpm, feel, color,
--     cues: [{ at, look, color }] }], notes, files }, filled on an LD's
--     intake link and kept on the act on the event.
--
-- get_tour_manager_request / get_opener_request also return
--   sender_type   the link sender's account type ('lighting' = an LD link)
--   lighting_rig  the LD's rig for this venue: data.lighting_rig of their
--                 venue template with the event's venue name (no match: null)
-- get_shared_gig returns each act's lighting_cues and the event's
--   lighting_rig (the owner's or an accepted lighting tech's venue template).
-- The submit functions keep lighting_cues (at most ~200 KB) on the request and
-- on the act; update_shared_gig keeps it when the lineup is saved.
-- All six functions are patched in place from their live definitions.

alter table public.show_bands add column if not exists lighting_cues jsonb;
alter table public.opener_requests add column if not exists lighting_cues jsonb;
alter table public.tour_manager_requests add column if not exists lighting_cues jsonb;

-- An LD's rig for a venue: their venue template with that name.
create or replace function public.ld_rig_for(p_user uuid, p_venue text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select st.data->'lighting_rig'
  from public.saved_templates st
  join public.user_preferences up on up.user_id = st.owner_id and up.account_type = 'lighting'
  where st.owner_id = p_user and st.category = 'venue'
    and coalesce(btrim(p_venue), '') <> ''
    and lower(btrim(st.name)) = lower(btrim(p_venue))
    and jsonb_typeof(st.data->'lighting_rig') = 'object'
  order by st.updated_at desc nulls last
  limit 1;
$$;
revoke all on function public.ld_rig_for(uuid, text) from public, anon, authenticated;

-- A cue sheet from a form, or null (not an object / too big).
create or replace function public.lighting_cues_from(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case when jsonb_typeof(p) = 'object' and pg_column_size(p) < 200000 then p else null end;
$$;

-- Save one act's cue sheet on a shared event (job 377): the owner, the
-- manager / artist side, or an accepted lighting tech. The act is matched by
-- its place in the lineup and its name.
create or replace function public.set_act_lighting_cues(p_token uuid, p_sort_order int, p_band_name text, p_cues jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_show public.shows;
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in required to edit';
  end if;
  select * into v_show from public.shows where share_token = p_token;
  if not found then
    raise exception 'Invalid share link';
  end if;
  v_ok := auth.uid() = v_show.owner_id or exists (
    select 1 from public.gig_invites gi
    where gi.show_id = v_show.id and gi.status = 'accepted' and gi.accepted_by = auth.uid()
      and (gi.invited_role in ('lighting', 'manager') or 'manager' = any(coalesce(gi.granted_sections, '{}'))));
  if not v_ok then
    raise exception 'You do not have permission to edit the lighting cues';
  end if;
  update public.show_bands set lighting_cues = public.lighting_cues_from(p_cues), updated_at = now()
  where show_id = v_show.id and sort_order = p_sort_order and band_name is not distinct from p_band_name;
  if not found then
    raise exception 'That act is not on this event any more';
  end if;
end;
$$;
revoke all on function public.set_act_lighting_cues(uuid, int, text, jsonb) from public, anon;
grant execute on function public.set_act_lighting_cues(uuid, int, text, jsonb) to authenticated;

do $do$
declare
  d text;
  n text;
begin
  -- get_tour_manager_request
  d := pg_get_functiondef('public.get_tour_manager_request(uuid)'::regprocedure);
  n := replace(d, $a$'card_bg_image_url', e.card_bg_image_url, 'card_text_color', e.card_text_color, 'stage_plot_colors', e.stage_plot_colors)
    into v_eng$a$, $a$'card_bg_image_url', e.card_bg_image_url, 'card_text_color', e.card_text_color, 'stage_plot_colors', e.stage_plot_colors,
           'account_type', e.account_type)
    into v_eng$a$);
  n := replace(n, $a$  v_pic := v_pic || jsonb_build_object('engineer', v_eng);$a$, $a$  v_pic := v_pic || jsonb_build_object('engineer', v_eng);
  -- An LD's link (job 377): who sent it and their rig for this venue.
  v_pic := v_pic || jsonb_build_object(
    'sender_type', v_eng->>'account_type',
    'lighting_rig', case when v_eng->>'account_type' = 'lighting' then public.ld_rig_for(r.engineer_user_id,
      coalesce(nullif(btrim(r.venue), ''), (select s.venue from public.shows s where s.id = coalesce(r.target_show_id, r.created_show_id)))) end);$a$);
  if n = d or position('ld_rig_for' in n) = 0 or position($a$'account_type', e.account_type$a$ in n) = 0 then
    raise exception 'get_tour_manager_request patch did not apply';
  end if;
  execute n;

  -- get_opener_request
  d := pg_get_functiondef('public.get_opener_request(uuid)'::regprocedure);
  n := replace(d, $a$    'include_services', o.include_services,$a$, $a$    'include_services', o.include_services,
    'sender_type', e.account_type,
    'lighting_rig', case when e.account_type = 'lighting' then public.ld_rig_for(t.engineer_user_id, coalesce(nullif(btrim(t.venue), ''), s.venue)) end,$a$);
  n := replace(n, $a$'card_text_color', e.card_text_color, 'stage_plot_colors', e.stage_plot_colors) end$a$,
    $a$'card_text_color', e.card_text_color, 'stage_plot_colors', e.stage_plot_colors, 'account_type', e.account_type) end$a$);
  if n = d or position('ld_rig_for' in n) = 0 or position($a$'account_type', e.account_type) end$a$ in n) = 0 then
    raise exception 'get_opener_request patch did not apply';
  end if;
  execute n;

  -- submit_opener_request: on the request and on the act.
  d := pg_get_functiondef('public.submit_opener_request(uuid,jsonb)'::regprocedure);
  n := replace(d, $a$      multitrack_interest = v_multitrack,
      service_answers = v_services
  where id = v_request.id;$a$, $a$      multitrack_interest = v_multitrack,
      service_answers = v_services,
      lighting_cues = public.lighting_cues_from(p_form->'lighting_cues')
  where id = v_request.id;$a$);
  n := replace(n, $a$  -- Keep the multi-track answer with the event (job 263).$a$, $a$  -- The act's lighting cue sheet (job 377).
  update public.show_bands set lighting_cues = public.lighting_cues_from(p_form->'lighting_cues')
  where show_id = v_show_id and sort_order = v_sort and band_name is not distinct from p_form->>'band_name';

  -- Keep the multi-track answer with the event (job 263).$a$);
  if (length(n) - length(replace(n, 'lighting_cues_from', ''))) / length('lighting_cues_from') <> 2 then
    raise exception 'submit_opener_request patch did not apply';
  end if;
  execute n;

  -- submit_tour_manager_request: on the request, the headliner's act and
  -- each opener that was waiting for it.
  d := pg_get_functiondef('public.submit_tour_manager_request(uuid,jsonb)'::regprocedure);
  n := replace(d, $a$      multitrack_interest = v_multitrack,
      service_answers = v_services
  where id = v_request.id;

  return v_show_id;$a$, $a$      multitrack_interest = v_multitrack,
      service_answers = v_services,
      lighting_cues = public.lighting_cues_from(p_form->'lighting_cues')
  where id = v_request.id;

  -- The act's lighting cue sheet (job 377), on its lineup slot.
  if public.lighting_cues_from(p_form->'lighting_cues') is not null then
    update public.show_bands set lighting_cues = public.lighting_cues_from(p_form->'lighting_cues')
    where id = (select sb.id from public.show_bands sb
                where sb.show_id = v_show_id and sb.band_name is not distinct from p_form->>'band_name'
                order by sb.updated_at desc nulls last, sb.sort_order limit 1);
  end if;

  return v_show_id;$a$);
  n := replace(n, $a$    if v_pending_opener.multitrack_interest is not null or$a$, $a$    if v_pending_opener.lighting_cues is not null then
      update public.show_bands set lighting_cues = v_pending_opener.lighting_cues
      where show_id = v_show_id and sort_order = v_pending_opener.order_index and band_name is not distinct from v_pending_opener.band_name;
    end if;
    if v_pending_opener.multitrack_interest is not null or$a$);
  if (length(n) - length(replace(n, 'lighting_cues_from', ''))) / length('lighting_cues_from') <> 3
     or position('v_pending_opener.lighting_cues' in n) = 0 then
    raise exception 'submit_tour_manager_request patch did not apply';
  end if;
  execute n;

  -- update_shared_gig: keep each act's cue sheet when the lineup is saved.
  d := pg_get_functiondef('public.update_shared_gig(uuid,jsonb)'::regprocedure);
  n := replace(d, $a$          submitter_name, submitter_phone, submitter_email, submitter_card_user_id, requested_order,
          photo_url
        )$a$, $a$          submitter_name, submitter_phone, submitter_email, submitter_card_user_id, requested_order,
          photo_url, lighting_cues
        )$a$);
  n := replace(n, $a$          nullif(v_band->>'photo_url', '')
        );$a$, $a$          nullif(v_band->>'photo_url', ''),
          public.lighting_cues_from(v_band->'lighting_cues')
        );$a$);
  if position('photo_url, lighting_cues' in n) = 0 or position($a$lighting_cues_from(v_band->'lighting_cues')$a$ in n) = 0 then
    raise exception 'update_shared_gig patch did not apply';
  end if;
  execute n;

  -- get_shared_gig: each act's cues and the event's rig.
  d := pg_get_functiondef('public.get_shared_gig(uuid)'::regprocedure);
  n := replace(d, $a$      sb.photo_url,
      up.card_share_token as submitter_card_share_token,$a$, $a$      sb.photo_url, sb.lighting_cues,
      up.card_share_token as submitter_card_share_token,$a$);
  n := replace(n, $a$    'tech_photos', v_tech_photos
  );$a$, $a$    'tech_photos', v_tech_photos,
    -- The LD's rig for this venue (job 377): the owner's, else an accepted
    -- lighting tech's venue template with this venue's name.
    'lighting_rig', (
      select public.ld_rig_for(u.uid, v_show.venue)
      from (select v_show.owner_id as uid, 0 as ord
            union all
            select gi.accepted_by, 1 from public.gig_invites gi
            where gi.show_id = v_show.id and gi.status = 'accepted' and gi.invited_role = 'lighting') u
      where public.ld_rig_for(u.uid, v_show.venue) is not null
      order by u.ord limit 1)
  );$a$);
  if n = d or position('sb.lighting_cues' in n) = 0 or position('ld_rig_for' in n) = 0 then
    raise exception 'get_shared_gig patch did not apply';
  end if;
  execute n;
end
$do$;
