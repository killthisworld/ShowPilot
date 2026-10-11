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

// ---- Colors -------------------------------------------------------------
// Each event type has its own color so a mixed calendar reads at a glance
// (a stripe + tag on every row). None of the defaults reuse a Home filter
// color (NEW gray, FREQ blue, WORKED green, STAR amber, LINK pink), so a
// concert never looks like a "frequent" show. A custom type gets a stable
// color derived from its name. On top of that, each person can pick their
// own color per type (user_preferences.event_type_colors), which applies
// on their screens only - linked events included.
export const EVENT_TYPE_COLORS = {
  "concert": "#A78BFA",
  "comedy show": "#F87171",
  "festival": "#2DD4BF",
  "theatre play": "#D946EF",
  "corporate event": "#22D3EE",
  "private party": "#FF7A45",
  "open mic": "#E8D5A6",
  "other": "#CBD5E1",
};
const CUSTOM_TYPE_PALETTE = ["#F87171", "#2DD4BF", "#A78BFA", "#22D3EE", "#D946EF", "#FF7A45", "#E8D5A6"];

// What the color picker offers: the defaults plus a few more, still none of
// the filter colors.
export const EVENT_COLOR_CHOICES = [
  "#A78BFA", "#8B5CF6", "#D946EF", "#F87171", "#DC2626", "#FF7A45",
  "#E8D5A6", "#2DD4BF", "#22D3EE", "#CBD5E1", "#F5F5F5", "#A16207",
];

// Fill for a whole event bar: a wash of the type's color fading to the
// normal dark surface, so rows read as color-coded at a glance.
export function typeBarBackground(color, base = "#111111") {
  if (!color) return base;
  return `linear-gradient(90deg, ${color}2e 0%, ${color}12 45%, ${base} 100%), ${base}`;
}

const typeKey = (type) => (type || "").trim().toLowerCase();
const HEX = /^#[0-9a-f]{6}$/i;

// The signed-in person's own picks, keyed by lowercased type. Kept in
// memory for every component and mirrored to this browser so pages that
// don't load preferences themselves (an event board opened from a link)
// still show the same colors.
const CACHE_KEY = "showpilot_event_type_colors";
function cleanColors(map) {
  const out = {};
  if (map && typeof map === "object") {
    for (const [k, v] of Object.entries(map)) {
      const key = typeKey(k);
      if (key && typeof v === "string" && HEX.test(v)) out[key] = v;
    }
  }
  return out;
}
let myColors = (() => {
  try { return cleanColors(JSON.parse(localStorage.getItem(CACHE_KEY) || "{}")); } catch { return {}; }
})();

export const EVENT_COLORS_EVENT = "showpilot:event-type-colors";
export function setMyEventTypeColors(map, { announce = false } = {}) {
  myColors = cleanColors(map);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(myColors)); } catch {}
  // After a save, tell every mounted screen so it repaints with the new
  // colors (the settings drawer and the page behind it don't share state).
  if (announce && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT_COLORS_EVENT, { detail: myColors }));
}
export function getMyEventTypeColors() {
  return myColors;
}

// The built-in or name-derived color, ignoring anyone's own picks - for
// public pages (fan page, event sky) that every visitor sees the same.
export function defaultEventTypeColor(type) {
  const t = typeKey(type);
  if (!t) return null;
  if (EVENT_TYPE_COLORS[t]) return EVENT_TYPE_COLORS[t];
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return CUSTOM_TYPE_PALETTE[h % CUSTOM_TYPE_PALETTE.length];
}

export function eventTypeColor(type) {
  const t = typeKey(type);
  if (!t) return null;
  return myColors[t] || defaultEventTypeColor(t);
}

// Saves one type's color for the signed-in person (null resets it to the
// default). Returns the saved map.
export async function saveMyEventTypeColor(preferences, type, color) {
  const t = typeKey(type);
  if (!t) return getMyEventTypeColors();
  const next = { ...cleanColors(preferences?.event_type_colors) };
  if (color && HEX.test(color)) next[t] = color; else delete next[t];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, event_type_colors: next }, { onConflict: "user_id" });
  if (error) throw error;
  setMyEventTypeColors(next, { announce: true });
  return next;
}
