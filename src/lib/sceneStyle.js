// Look shared by the routing / scene-select home that the audio and
// lighting profiles use (Home.jsx): console-style status banks, a scene
// list, and cue pads.
export const SCENE_FONT = "'Barlow Condensed', 'Inter', sans-serif";
export const SCENE_MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const SCENE_COLORS = {
  not_started: "#9A9A9A",
  in_progress: "#60A5FA",
  complete: "#8CFF3D",
  starred: "#F59E0B",
  linked: "#F472B6",
};

// Same order and wording as the old status tabs, just styled like console
// banks. `id` matches the activeTab values Home.jsx already uses.
export const SCENE_BANKS = [
  { id: "not_started", label: "NEW", color: SCENE_COLORS.not_started },
  { id: "in_progress", label: "FREQ", color: SCENE_COLORS.in_progress },
  { id: "complete", label: "WORKED", color: SCENE_COLORS.complete },
  { id: "starred", label: "STAR", color: SCENE_COLORS.starred },
  { id: "linked", label: "LINK", color: SCENE_COLORS.linked },
];

export function sceneAccent(show) {
  if (show.is_owned === false) return SCENE_COLORS.linked;
  if (show.starred) return SCENE_COLORS.starred;
  return SCENE_COLORS[show.status] || SCENE_COLORS.not_started;
}

export function sceneBankOf(show) {
  if (show.is_owned === false) return "linked";
  if (show.starred) return "starred";
  return show.status || "not_started";
}

export function scenePlace(show) {
  const city = [show.city, show.state].filter(Boolean).join(", ") || show.location || "";
  return [show.venue, city].filter(Boolean).join(", ");
}

export function sceneDate(show) {
  if (!show.date) return "";
  return new Date(show.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

export function sceneTitle(show) {
  return show.event_name || show.band_name || "Untitled Gig";
}
