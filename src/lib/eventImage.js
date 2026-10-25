// An event's picture for lists, tickets and banners (job 163): its own event
// image, else the venue's photo (shows.venue_info.photo_url, job 145).
export function eventImage(show) {
  if (!show) return "";
  return show.icon_url || show.venue_info?.photo_url || "";
}

// The same event with icon_url filled from the venue photo when it has none,
// for display-only lists (never save this object back as the event image).
export function withEventImage(show) {
  const url = eventImage(show);
  return url && url !== show.icon_url ? { ...show, icon_url: url } : show;
}
