-- Job 248: booking a date carries the act's deal and draw into the event.
-- Replaces confirm_booking_package only. Safe to run more than once.

create or replace function public.confirm_booking_package(p_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.booking_packages;
  v_offer jsonb;
  v_venue_name text;
  v_sender_type text;
  v_show_id uuid;
  v_share uuid;
  v_d jsonb;
  v_hosp text;
  v_mi jsonb;
  v_vi jsonb := '{}'::jsonb;
  v_fx jsonb;
  v_billing text;
  v_deal jsonb;
  v_ask text;
  v_terms jsonb;
  v_back text;
begin
  select * into v_row from public.booking_packages where id = p_id and created_by = v_uid for update;
  if v_row.id is null then
    raise exception 'package not found';
  end if;
  if v_row.status = 'booked' and v_row.show_id is not null then
    select share_token into v_share from public.shows where id = v_row.show_id;
    return jsonb_build_object('show_id', v_row.show_id, 'share_token', v_share, 'already', true);
  end if;
  if v_row.status <> 'offered' or v_row.venue_user_id is null then
    raise exception 'no dates to confirm yet';
  end if;
  select o into v_offer from jsonb_array_elements(v_row.offers) o where o->>'date' = p_date::text limit 1;
  if v_offer is null then
    raise exception 'that date was not offered';
  end if;

  v_d := v_row.data;
  select nullif(btrim(display_name), '') into v_venue_name from public.user_preferences where user_id = v_row.venue_user_id;
  select account_type into v_sender_type from public.user_preferences where user_id = v_uid;
  v_billing := coalesce(nullif(v_offer->>'billing', ''), 'Headliner');

  -- What the act asked for on the deal and draw (job 248): it goes in the
  -- event's notes, the venue's deal starts as a draft with their ask, and the
  -- suggested ticket price goes on the event.
  v_deal := coalesce(v_d->'deal', '{}'::jsonb);
  v_ask := v_deal->>'ask';
  select string_agg(case b when 'own' then 'Bringing everything' when 'drums' then 'Needs drums' when 'bass' then 'Needs a bass amp'
                              when 'guitar' then 'Needs a guitar amp' when 'keys' then 'Needs keys' end, ', ')
    into v_back
    from jsonb_array_elements_text(case when jsonb_typeof(v_deal->'backline') = 'array' then v_deal->'backline' else '[]'::jsonb end) b;
  if coalesce((v_deal->>'share_backline')::boolean, false) then
    v_back := concat_ws(' · ', v_back, 'happy to share');
  end if;

  v_hosp := concat_ws(' · ',
    case when coalesce(v_d->'hospitality'->>'meals', '') <> '' then 'Meals: ' || (v_d->'hospitality'->>'meals') end,
    nullif(v_d->'hospitality'->>'dietary', ''),
    nullif(v_d->'hospitality'->>'drinks', ''),
    case when coalesce(v_d->'hospitality'->>'guests', '') <> '' then 'Guest list: ' || (v_d->'hospitality'->>'guests') end);
  v_hosp := concat_ws(E'\n',
    nullif(v_hosp, ''),
    case when coalesce(v_deal->>'hometown', '') <> '' then 'Based in: ' || (v_deal->>'hometown') end,
    case when coalesce(v_deal->>'draw', '') <> '' then 'Expected draw: ' || (v_deal->>'draw') end,
    case when coalesce(v_deal->>'recent', '') <> '' then 'Recent shows: ' || (v_deal->>'recent') end,
    case v_deal->>'age' when 'all' then 'Ages: all ages' when '18' then 'Ages: 18+' when '21' then 'Ages: 21+' end,
    case when coalesce(v_back, '') <> '' then 'Backline: ' || v_back end);

  v_mi := jsonb_strip_nulls(jsonb_build_object(
    'contact_name', nullif(v_d->>'submitter_name', ''),
    'contact_phone', nullif(v_d->>'submitter_phone', ''),
    'contact_email', nullif(v_d->>'submitter_email', ''),
    'merch_table', case v_d->'merch'->>'table' when 'own' then 'Our own table + seller' when 'venue' then 'Venue sells it' when 'none' then 'No merch' end,
    'merch_seller', case v_d->'merch'->>'table' when 'own' then 'Artist sells' when 'venue' then 'Venue seller' end,
    'merch_split', nullif(v_d->'merch'->>'split', ''),
    'advancing_notes', nullif(v_hosp, ''),
    'set_times', case when coalesce(v_offer->>'set_time', '') <> '' then jsonb_build_object(v_row.act_name, v_offer->>'set_time') end
  ));
  if coalesce(v_offer->>'load_in', '') <> '' then
    v_vi := jsonb_build_object('schedule', jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'time', v_offer->>'load_in', 'label', 'Load-in')));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('artist_name', bm->>'name', 'notes', bm->>'notes')), '[]'::jsonb)
    into v_fx
    from jsonb_array_elements(coalesce(v_d->'band_members', '[]'::jsonb)) bm
   where coalesce(bm->>'notes', '') <> '' and coalesce(bm->>'name', '') <> '';

  insert into public.shows (
    owner_id, band_name, venue, date, genre_tag, genre_tags, band_members, stage_plot_url, stage_plot_files,
    icon_url, manager_info, venue_info, promoter_info, status
  ) values (
    v_row.venue_user_id, v_row.act_name, coalesce(v_venue_name, nullif(v_row.to_name, '')), p_date,
    v_d->'genre_tags'->>0, coalesce(v_d->'genre_tags', '[]'::jsonb), coalesce(v_d->'band_members', '[]'::jsonb),
    nullif(v_d->>'stage_plot_url', ''), coalesce(v_d->'stage_plot_files', '[]'::jsonb),
    nullif(v_d->>'photo_url', ''), coalesce(v_mi, '{}'::jsonb), v_vi,
    case when coalesce(v_deal->>'ticket_price', '') <> '' then jsonb_build_object('ticket_price', v_deal->>'ticket_price') else '{}'::jsonb end,
    'not_started'
  ) returning id, share_token into v_show_id, v_share;

  -- The venue's deal for this event starts from what the act asked for (a
  -- draft only the venue sees until they send it).
  if v_ask in ('flat', 'door', 'vs') then
    v_terms := jsonb_strip_nulls(jsonb_build_object(
      'deal_type', v_ask,
      'guarantee', case when v_ask in ('flat', 'vs') then nullif(v_deal->>'guarantee', '') end,
      'door_percent', case when v_ask in ('door', 'vs') then nullif(v_deal->>'door_percent', '') end,
      'merch_split', nullif(v_d->'merch'->>'split', '')));
    insert into public.event_deals (show_id, terms, status, updated_by)
    values (v_show_id, v_terms, 'draft', v_row.venue_user_id)
    on conflict (show_id) do nothing;
  end if;

  insert into public.show_bands (
    show_id, role, sort_order, band_name, genre_tags, genre_tag, band_members, set_length_minutes, general_notes,
    stage_plot_url, stage_plot_files, artist_fx_notes, submitter_name, submitter_phone, submitter_email,
    submitter_card_user_id, photo_url
  ) values (
    v_show_id, v_billing, 0, v_row.act_name, coalesce(v_d->'genre_tags', '[]'::jsonb), v_d->'genre_tags'->>0,
    coalesce(v_d->'band_members', '[]'::jsonb), nullif(v_d->>'set_length_minutes', '')::int, nullif(v_d->>'general_notes', ''),
    nullif(v_d->>'stage_plot_url', ''), coalesce(v_d->'stage_plot_files', '[]'::jsonb), v_fx,
    nullif(v_d->>'submitter_name', ''), nullif(v_d->>'submitter_phone', ''), nullif(v_d->>'submitter_email', ''),
    v_uid, nullif(v_d->>'photo_url', '')
  );

  -- The sender is on the event as its manager (or the artist).
  insert into public.gig_invites (show_id, invited_role, label, created_by, status, accepted_by, accepted_at, opened_at)
  values (v_show_id, case when v_sender_type = 'band' then 'band' else 'manager' end, 'Booking package',
          v_row.venue_user_id, 'accepted', v_uid, now(), now());
  insert into public.linked_gigs (user_id, show_id, share_token)
  values (v_uid, v_show_id, v_share)
  on conflict (user_id, show_id) do nothing;

  update public.booking_packages
     set status = 'booked', picked_date = p_date, show_id = v_show_id, confirmed_at = now(), updated_at = now()
   where id = v_row.id;
  return jsonb_build_object('show_id', v_show_id, 'share_token', v_share);
end;
$function$;

revoke all on function public.confirm_booking_package(uuid, date) from public, anon;
grant execute on function public.confirm_booking_package(uuid, date) to authenticated;
