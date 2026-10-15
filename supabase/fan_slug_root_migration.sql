-- Custom fan links now live at the site root: showpilot.space/<name>.
-- Run after fan_custom_link_migration.sql. A name can't be one that Show Pilot
-- itself uses for a page (login, about, ...), or the link would never open the
-- fan page. Keep this list in sync with RESERVED_SLUGS in src/lib/fanUrl.js.
alter table public.shows drop constraint if exists shows_fan_slug_format;
alter table public.shows add constraint shows_fan_slug_format check (
  fan_slug is null or (
    fan_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(fan_slug) between 3 and 40
    and fan_slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and fan_slug <> all (array[
      'login','logout','register','signup','signin','forgot-password','reset-password','email-change',
      'shared','tm-intake','opener-intake','logbook','gig','gigs','linked','about','dj','pilot',
      'band','show','shows','calendar','experience','archived','manager-links','band-profile',
      'my-templates','event','events','eventbrite','api','app','admin','auth','assets','static',
      'home','settings','profile','help','support','privacy','terms','pricing','contact','new',
      'invite','web','fan','fans','sky','www','showpilot'
    ])
  )
);
