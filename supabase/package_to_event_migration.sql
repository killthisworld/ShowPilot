-- The booking package carries onto the event (job 357). When a package is
-- booked, the event it makes now also gets, from the act's package:
--   * the tech rider: who does sound and lights (manager_info.crew,
--     'ours' = the act brings, 'venue' = the venue's), and the act's own
--     engineer / lighting tech on the Audio / Lighting page
--     (engineer_info.audio / .lighting: name, phone, email, their card);
--     lighting cues and LD notes in the act's advancing notes;
--   * promo: the sized graphics (manager_info.promo [{ format, url, name }],
--     as the New event web keeps them) and the promo links;
--   * paperwork: the audio / lighting / hospitality riders and cue sheet
--     (kind 'rider') and the deal documents (W9, contract, insurance,
--     one-sheet) as business records on the event, filed by the act. These
--     files are the package's own public links (snapshot.file_url), opened as
--     they are.
-- Everything else is _book_booking_package as it was (job 347 / 348).
-- Safe to run more than once.

create or replace function public._book_booking_package(p_id uuid, p_date date, p_offer jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.booking_packages;
  v_offer jsonb := p_offer;
  v_is_v boolean;
  v_owner uuid;
  v_act_user uuid;
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
  v_h jsonb;
  v_l jsonb;
  v_room jsonb;
  -- job 357
  v_ta jsonb;
  v_tl jsonb;
  v_eng jsonb;
  v_crew jsonb;
  v_promo jsonb;
  v_links jsonb;
  v_venue_final text;
  v_act_name text;
begin
  select * into v_row from public.booking_packages where id = p_id for update;
  if v_row.status = 'booked' and v_row.show_id is not null then
    select share_token into v_share from public.shows where id = v_row.show_id;
    return jsonb_build_object('show_id', v_row.show_id, 'share_token', v_share, 'already', true);
  end if;

  v_is_v := v_row.kind = 'venue';
  v_owner := case when v_is_v then v_row.created_by else v_row.venue_user_id end;
  v_act_user := case when v_is_v then v_row.venue_user_id else v_row.created_by end;
  v_d := case when v_is_v then coalesce(v_row.reply_data, '{}'::jsonb) else v_row.data end;
  select nullif(btrim(display_name), '') into v_venue_name from public.user_preferences where user_id = v_owner;
  select account_type into v_sender_type from public.user_preferences where user_id = v_act_user;
  v_billing := coalesce(nullif(v_offer->>'billing', ''),
    (select nullif(w->>'billing', '') from jsonb_array_elements(case when jsonb_typeof(v_row.wants->'dates') = 'array' then v_row.wants->'dates' else '[]'::jsonb end) w where w->>'date' = p_date::text limit 1),
    'Headliner');

  v_deal := case when v_is_v then coalesce(v_row.data->'deal', '{}'::jsonb) else coalesce(v_d->'deal', '{}'::jsonb) end;
  v_ask := v_deal->>'ask';
  select string_agg(case b when 'own' then 'Bringing everything' when 'drums' then 'Needs drums' when 'bass' then 'Needs a bass amp'
                              when 'guitar' then 'Needs a guitar amp' when 'keys' then 'Needs keys' end, ', ')
    into v_back
    from jsonb_array_elements_text(case when jsonb_typeof(v_d->'deal'->'backline') = 'array' then v_d->'deal'->'backline' else '[]'::jsonb end) b;
  if coalesce((v_d->'deal'->>'share_backline')::boolean, false) then
    v_back := concat_ws(' · ', v_back, 'happy to share');
  end if;

  if v_is_v then
    v_h := coalesce(v_row.data->'hosp', '{}'::jsonb);
    v_l := coalesce(v_row.data->'logi', '{}'::jsonb);
    v_room := coalesce(v_row.data->'room', '{}'::jsonb);
    v_hosp := concat_ws(E'\n',
      nullif(concat_ws(' · ',
        case when coalesce(v_h->>'meals', '') <> '' then 'Meals: ' || (v_h->>'meals') end,
        case when coalesce(v_h->>'drinks', '') <> '' then 'Drinks: ' || (v_h->>'drinks') end,
        case when coalesce(v_h->>'green_room', '') <> '' then 'Green room: ' || (v_h->>'green_room') end,
        case when coalesce(v_h->>'guests', '') <> '' then 'Guest list: ' || (v_h->>'guests') end,
        case when coalesce(v_h->>'lodging', '') <> '' then 'Lodging: ' || (v_h->>'lodging') end), ''),
      nullif(concat_ws(' · ',
        case when coalesce(v_l->>'load_in', '') <> '' then 'Load-in: ' || (v_l->>'load_in') end,
        case when coalesce(v_l->>'soundcheck', '') <> '' then 'Soundcheck: ' || (v_l->>'soundcheck') end,
        case when coalesce(v_l->>'curfew', '') <> '' then 'Curfew: ' || (v_l->>'curfew') end,
        case when coalesce(v_l->>'contact', '') <> '' then 'Day-of contact: ' || (v_l->>'contact') end), ''),
      nullif(concat_ws(' · ',
        case when coalesce(v_room->>'capacity', '') <> '' then 'Capacity: ' || (v_room->>'capacity') end,
        case when coalesce(v_room->>'stage', '') <> '' then 'Stage: ' || (v_room->>'stage') end,
        case when coalesce(v_room->>'pa', '') <> '' then 'PA: ' || (v_room->>'pa') end,
        case when coalesce(v_room->>'backline', '') <> '' then 'Backline: ' || (v_room->>'backline') end), ''),
      case v_deal->>'age' when 'all' then 'Ages: all ages' when '18' then 'Ages: 18+' when '21' then 'Ages: 21+' end,
      case when coalesce(v_row.wants->>'note', '') <> '' then 'Note from the venue: ' || (v_row.wants->>'note') end);
  else
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
  end if;

  -- job 357: the act's tech rider (Audio / Lighting tabs of the package).
  v_ta := case when jsonb_typeof(v_d->'tech'->'audio') = 'object' then v_d->'tech'->'audio' else '{}'::jsonb end;
  v_tl := case when jsonb_typeof(v_d->'tech'->'lighting') = 'object' then v_d->'tech'->'lighting' else '{}'::jsonb end;
  v_crew := jsonb_strip_nulls(jsonb_build_object(
    'sound', case v_ta->>'who' when 'own' then 'ours' when 'venue' then 'venue' end,
    'lights', case v_tl->>'who' when 'own' then 'ours' when 'venue' then 'venue' end));
  v_eng := jsonb_strip_nulls(jsonb_build_object(
    'audio', case when v_ta->>'who' = 'own' and coalesce(btrim(v_ta->>'name'), '') <> '' then jsonb_strip_nulls(jsonb_build_object(
      'contact_name', left(btrim(v_ta->>'name'), 300), 'contact_phone', nullif(left(v_ta->>'phone', 300), ''),
      'contact_email', nullif(left(v_ta->>'email', 300), ''), 'card_share_token', nullif(v_ta->>'card_token', ''))) end,
    'lighting', case when v_tl->>'who' = 'own' and coalesce(btrim(v_tl->>'name'), '') <> '' then jsonb_strip_nulls(jsonb_build_object(
      'contact_name', left(btrim(v_tl->>'name'), 300), 'contact_phone', nullif(left(v_tl->>'phone', 300), ''),
      'contact_email', nullif(left(v_tl->>'email', 300), ''), 'card_share_token', nullif(v_tl->>'card_token', ''))) end));
  v_hosp := concat_ws(E'\n',
    nullif(v_hosp, ''),
    case when coalesce(btrim(v_tl->>'cues'), '') <> '' then 'Lighting cues: ' || btrim(v_tl->>'cues') end,
    case when coalesce(btrim(v_tl->>'notes'), '') <> '' then 'Notes for the LD: ' || btrim(v_tl->>'notes') end);

  -- job 357: promo, the sizes picked (or every size uploaded) in order.
  select coalesce(jsonb_agg(jsonb_build_object('format', f.k, 'url', v_d->'promo_images'->f.k->>'url', 'name', coalesce(v_d->'promo_images'->f.k->>'name', '')) order by f.n), '[]'::jsonb)
    into v_promo
    from (
      select k, n from jsonb_array_elements_text(case when jsonb_typeof(v_d->'promo_picked') = 'array' then v_d->'promo_picked' else '[]'::jsonb end) with ordinality as t(k, n)
      union all
      select k, 1000 + row_number() over () from jsonb_object_keys(case when jsonb_typeof(v_d->'promo_images') = 'object' then v_d->'promo_images' else '{}'::jsonb end) as k
       where jsonb_typeof(v_d->'promo_picked') is distinct from 'array'
    ) f
   where coalesce(v_d->'promo_images'->f.k->>'url', '') <> '';
  select coalesce(jsonb_agg(jsonb_build_object('kind', coalesce(l->>'kind', ''), 'url', l->>'url')), '[]'::jsonb)
    into v_links
    from jsonb_array_elements(case when jsonb_typeof(v_d->'promo_links') = 'array' then v_d->'promo_links' else '[]'::jsonb end) l
   where coalesce(btrim(l->>'url'), '') <> '';

  v_mi := jsonb_strip_nulls(jsonb_build_object(
    'contact_name', nullif(v_d->>'submitter_name', ''),
    'contact_phone', nullif(v_d->>'submitter_phone', ''),
    'contact_email', nullif(v_d->>'submitter_email', ''),
    'merch_table', case v_d->'merch'->>'table' when 'own' then 'Our own table + seller' when 'venue' then 'Venue sells it' when 'none' then 'No merch' end,
    'merch_seller', case v_d->'merch'->>'table' when 'own' then 'Artist sells' when 'venue' then 'Venue seller' end,
    'merch_split', coalesce(nullif(v_d->'merch'->>'split', ''), case when v_is_v then nullif(v_deal->>'merch_split', '') end),
    'advancing_notes', nullif(v_hosp, ''),
    'set_times', case when coalesce(v_offer->>'set_time', '') <> '' then jsonb_build_object(v_row.act_name, v_offer->>'set_time') end,
    -- job 357
    'crew', case when v_crew <> '{}'::jsonb then v_crew end,
    'promo', case when jsonb_array_length(v_promo) > 0 then v_promo end,
    'promo_links', case when jsonb_array_length(v_links) > 0 then v_links end
  ));
  if coalesce(v_offer->>'load_in', '') <> '' then
    v_vi := jsonb_build_object('schedule', jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'time', v_offer->>'load_in', 'label', 'Load-in')));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('artist_name', bm->>'name', 'notes', bm->>'notes')), '[]'::jsonb)
    into v_fx
    from jsonb_array_elements(coalesce(v_d->'band_members', '[]'::jsonb)) bm
   where coalesce(bm->>'notes', '') <> '' and coalesce(bm->>'name', '') <> '';

  v_venue_final := coalesce(v_venue_name, case when not v_is_v then nullif(v_row.to_name, '') end);
  insert into public.shows (
    owner_id, band_name, venue, date, genre_tag, genre_tags, band_members, stage_plot_url, stage_plot_files,
    icon_url, manager_info, venue_info, promoter_info, status, engineer_info
  ) values (
    v_owner, v_row.act_name,
    v_venue_final,
    p_date,
    v_d->'genre_tags'->>0, coalesce(v_d->'genre_tags', '[]'::jsonb), coalesce(v_d->'band_members', '[]'::jsonb),
    nullif(v_d->>'stage_plot_url', ''), coalesce(v_d->'stage_plot_files', '[]'::jsonb),
    nullif(v_d->>'photo_url', ''), coalesce(v_mi, '{}'::jsonb), v_vi,
    case when coalesce(v_deal->>'ticket_price', '') <> '' then jsonb_build_object('ticket_price', v_deal->>'ticket_price') else '{}'::jsonb end,
    'not_started',
    case when v_eng <> '{}'::jsonb then v_eng end
  ) returning id, share_token into v_show_id, v_share;

  if v_ask in ('flat', 'door', 'vs') then
    v_terms := jsonb_strip_nulls(jsonb_build_object(
      'deal_type', v_ask,
      'guarantee', case when v_ask in ('flat', 'vs') then nullif(v_deal->>'guarantee', '') end,
      'door_percent', case when v_ask in ('door', 'vs') then nullif(v_deal->>'door_percent', '') end,
      'merch_split', coalesce(nullif(v_d->'merch'->>'split', ''), nullif(v_deal->>'merch_split', ''))));
    insert into public.event_deals (show_id, terms, status, updated_by)
    values (v_show_id, v_terms, 'draft', v_owner)
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
    v_act_user, nullif(v_d->>'photo_url', '')
  );

  -- job 357: the act's riders and deal documents, as the event's paperwork.
  select nullif(btrim(display_name), '') into v_act_name from public.user_preferences where user_id = v_act_user;
  insert into public.business_records (
    show_id, kind, title, version, snapshot, file_name,
    event_name, event_date, venue_name, filed_by, filed_by_name
  )
  select v_show_id, x.kind, x.title, row_number() over (partition by x.kind order by x.ord)::int,
         jsonb_build_object('file_url', x.url), nullif(x.name, ''),
         v_row.act_name, p_date, v_venue_final, v_act_user, coalesce(v_act_name, nullif(v_d->>'submitter_name', ''))
    from (
      select r.ord, 'rider'::text as kind, r.title, v_d->'riders'->r.k->>'url' as url, coalesce(v_d->'riders'->r.k->>'name', '') as name
        from (values (1, 'tech', 'Audio rider'), (2, 'lighting', 'Lighting rider'), (3, 'cues', 'Cue sheet'), (4, 'hospitality', 'Hospitality rider')) as r(ord, k, title)
       where jsonb_typeof(v_d->'riders') = 'object'
      union all
      select 10 + d.n,
             case d.v->>'kind' when 'contract' then 'agreement' when 'insurance' then 'coi' else 'other' end,
             case d.v->>'kind' when 'contract' then 'Contract' when 'insurance' then 'Certificate of insurance' when 'w9' then 'W9'
                              when 'onesheet' then 'One-sheet / EPK'
                              else coalesce(nullif(regexp_replace(coalesce(d.v->>'name', ''), '\.[A-Za-z0-9]+$', ''), ''), 'Document') end,
             d.v->>'url', coalesce(d.v->>'name', '')
        from jsonb_array_elements(case when jsonb_typeof(v_d->'deal_files') = 'array' then v_d->'deal_files' else '[]'::jsonb end) with ordinality as d(v, n)
    ) x
   where coalesce(x.url, '') ~ '^https?://';

  insert into public.gig_invites (show_id, invited_role, label, created_by, status, accepted_by, accepted_at, opened_at)
  values (v_show_id, case when v_sender_type = 'band' then 'band' else 'manager' end, 'Booking package',
          v_owner, 'accepted', v_act_user, now(), now());
  insert into public.linked_gigs (user_id, show_id, share_token)
  values (v_act_user, v_show_id, v_share)
  on conflict (user_id, show_id) do nothing;

  update public.booking_packages
     set status = 'booked', picked_date = p_date, show_id = v_show_id, confirmed_at = now(), updated_at = now(),
         rounds = rounds || jsonb_build_array(jsonb_build_object('by', 'confirm', 'at', now(), 'kind', 'confirm', 'dates', jsonb_build_array(v_offer), 'message', ''))
   where id = v_row.id;
  return jsonb_build_object('show_id', v_show_id, 'share_token', v_share);
end;
$function$;
