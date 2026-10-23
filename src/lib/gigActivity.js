// Who changed what on an event (job 143). Rows come from get_gig_activity /
// get_needs_me 'section_updated': { section, fields[], user_name, at }.

const SECTION_LABELS = {
  venue: "Venue",
  manager: "Manager / Artist",
  engineer: "Audio / Lighting",
  event: "Event",
};

// Friendly names for the field keys the database logs. Anything not listed
// is shown humanized ("load_in_time" -> "Load in time").
const FIELD_LABELS = {
  venue: "Venue name",
  address: "Address",
  wifi_power: "Wi-Fi & power",
  house_gear: "House gear",
  checklist: "Checklist",
  documents: "Documents",
  capacity: "Capacity",
  age_policy: "Age policy",
  schedule: "Schedule & curfew",
  hospitality: "Hospitality",
  parking: "Parking",
  lineup: "Lineup & set times",
  contact_name: "Contact",
  contact_email: "Contact",
  contact_phone: "Contact",
  contact_title: "Contact",
  audio: "Audio",
  lighting: "Lighting",
  engineer: "Audio",
  name: "Event name",
  date: "Date",
  event_type: "Event type",
  image: "Event image",
  photo_url: "Picture",
  artist_photo_url: "Artist picture",
};

const humanize = (k) => {
  const s = String(k || "").replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
};

export const sectionLabel = (s) => SECTION_LABELS[s] || humanize(s);

export function fieldsLabel(fields = [], max = 3) {
  const names = [...new Set((fields || []).map((f) => FIELD_LABELS[f] || humanize(f)).filter(Boolean))];
  if (!names.length) return "details";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}

export const firstName = (n) => (n || "Someone").trim().split(/\s+/)[0] || "Someone";

export function agoLabel(iso, now = Date.now()) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Latest change per section: { venue: row, manager: row, ... }.
export function latestBySection(activity = []) {
  const out = {};
  for (const a of activity || []) {
    if (!out[a.section] || new Date(a.at) > new Date(out[a.section].at)) out[a.section] = a;
  }
  return out;
}
