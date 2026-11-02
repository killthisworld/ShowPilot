// Shared by api/preview.js (page tags) and api/card.js (the picture): the
// lookup for a link, the profile colors and the invitation-type wording.
// Colors match ACCOUNT_TYPE_STYLES in src/lib/accountTypeStyle.js.
const COLORS = { venue: "#60A5FA", manager: "#EF4444", band: "#EF4444", engineer: "#8CFF3D", lighting: "#8CFF3D" };
export const DEFAULT_COLOR = "#8CFF3D";
const ROLE_NAME = { venue: "Venue", manager: "Manager", band: "Artist", engineer: "Audio engineer", lighting: "Lighting tech" };

export const colorFor = (role) => COLORS[role] || DEFAULT_COLOR;

// What kind of link this is, in words: "Audio engineer invite", "Venue event link"...
export function typeLabel(kind, info) {
  if (kind === "v") return "Venue event link";
  if (kind === "intake") return info?.form === "opener" ? "Opener set info form" : "Performer info form";
  if (kind === "invite") return `${ROLE_NAME[info?.role] || "Event"} invite`;
  return "Event web";
}

export function prettyDate(d, long = false) {
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.toLocaleDateString("en-US", { weekday: long ? "long" : "short", month: "short", day: "numeric", year: long ? undefined : "numeric", timeZone: "UTC" });
}

export async function lookup(kind, key) {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !kind || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_link_preview`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_kind: kind, p_key: String(key).slice(0, 80) }),
    });
    if (!res.ok) return null;
    const info = await res.json();
    if (info && !info.title && info.from) info.title = `Event info for ${info.from}`;
    return info && info.title ? info : null;
  } catch {
    return null;
  }
}
