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

// ---- Genres -------------------------------------------------------------
// preferences.genre_tags is [{ name, color }]. The Genre filter lists those
// plus any genre already on an event (owned or linked).
const NEW_GENRE_COLORS = ["#8CFF3D", "#60A5FA", "#F472B6", "#F59E0B", "#A78BFA", "#34D399", "#FB923C", "#22D3EE"];

const genresOf = (s) => [s.genre_tag, ...(Array.isArray(s.genre_tags) ? s.genre_tags : [])]
  .map((g) => (typeof g === "string" ? g : g?.name))
  .filter(Boolean);

export function buildGenreOptions(shows = [], genreTags = []) {
  const seen = new Map();
  const add = (g) => {
    const t = typeof g === "string" ? g.trim() : "";
    if (!t) return;
    const k = t.toLowerCase();
    if (!seen.has(k)) seen.set(k, t);
  };
  (genreTags || []).forEach((g) => add(g?.name));
  shows.forEach((s) => genresOf(s).forEach(add));
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function matchesGenre(show, filter) {
  if (!filter || filter === "all") return true;
  return genresOf(show).some((g) => g.trim().toLowerCase() === filter.toLowerCase());
}

// ---- "Add new" ----------------------------------------------------------
// Both lists live on user_preferences, which ShowDetail, the new-event form
// and the home filters all read - so saving here and reloading preferences
// is what makes a new entry show up everywhere. Returns the saved name, or
// null if nothing was added.
import { supabase } from "@/api/supabaseClient";

export const ADD_NEW_VALUE = "__add_new__";

export async function addCustomEventType(preferences, rawName) {
  const name = (rawName || "").trim();
  if (!name) return null;
  const existing = preferences?.custom_event_types || [];
  const all = buildEventTypeOptions([], existing);
  const dupe = all.find((t) => t.toLowerCase() === name.toLowerCase());
  if (dupe) return dupe;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, custom_event_types: [...existing, name] }, { onConflict: "user_id" });
  if (error) throw error;
  return name;
}

export async function addGenreTag(preferences, rawName) {
  const name = (rawName || "").trim();
  if (!name) return null;
  const existing = preferences?.genre_tags || [];
  const dupe = existing.find((g) => g?.name?.trim().toLowerCase() === name.toLowerCase());
  if (dupe) return dupe.name;
  const color = NEW_GENRE_COLORS[existing.length % NEW_GENRE_COLORS.length];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, genre_tags: [...existing, { name, color }] }, { onConflict: "user_id" });
  if (error) throw error;
  return name;
}
