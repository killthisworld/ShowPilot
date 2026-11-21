-- Booking a date carries the act's cue list onto the event (job 445).
--
-- The package's Tech rider > Lighting tab is a song-by-song cue list kept as
-- data.lighting_cues. When the date is booked, _book_booking_package now
-- copies it onto the event's act (show_bands.lighting_cues), where the LD
-- opens it like a cue list sent with their intake form.
--
-- The function isn't retyped here: this reads the live definition and makes
-- two exact edits (the column list and the value), so everything else in it
-- (job 357's riders, promo, crew...) stays as it is. Each edit must match
-- exactly once or nothing changes. Safe to run again (skips once applied).

do $migration$
declare
  d text := pg_get_functiondef('public._book_booking_package(uuid,date,jsonb)'::regprocedure);
  a1 text := E'submitter_card_user_id, photo_url\n  ) values (';
  b1 text := E'submitter_card_user_id, photo_url, lighting_cues\n  ) values (';
  a2 text := E'v_act_user, nullif(v_d->>''photo_url'', '''')\n  );';
  b2 text := E'v_act_user, nullif(v_d->>''photo_url'', ''''),\n    case when jsonb_typeof(v_d->''lighting_cues'') = ''object'' then v_d->''lighting_cues'' end -- job 445: the act''s cue list\n  );';
  n1 int;
  n2 int;
begin
  if position('lighting_cues' in d) > 0 then
    raise notice '_book_booking_package already copies lighting_cues; nothing to do';
    return;
  end if;
  n1 := (length(d) - length(replace(d, a1, ''))) / length(a1);
  n2 := (length(d) - length(replace(d, a2, ''))) / length(a2);
  if n1 <> 1 or n2 <> 1 then
    raise exception '_book_booking_package has changed (matches: % and %); not patched', n1, n2;
  end if;
  execute replace(replace(d, a1, b1), a2, b2);
end
$migration$;
