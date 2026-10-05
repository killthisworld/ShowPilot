// Event types every account starts with. Custom ones a user adds (see
// ShowDetail's "add new" option, stored in preferences.custom_event_types)
// are merged in below, so the home-screen Event Type filter always lists
// the built-ins, anything the user created, and any type that's actually on
// one of their events (including linked gigs someone else typed in).
export const BUILT_IN_EVENT_TYPES = [
  "Concert",
  "Comedy Show",
  "Theatre Play",
  "Corporate Event",
  "Private Party",
  "Festival",
  "Open Mic",
];

export function buildEventTypeOptions(shows = [], customTypes = []) {
  const seen = new Map();
  const add = (t) => {
    const trimmed = typeof t === "string" ? t.trim() : "";
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  };
  BUILT_IN_EVENT_TYPES.forEach(add);
  (customTypes || []).forEach(add);
  shows.forEach((s) => add(s.event_type));
  return [...seen.values()];
}

export function matchesEventType(show, filter) {
  if (!filter || filter === "all") return true;
  return (show.event_type || "").trim().toLowerCase() === filter.toLowerCase();
}
