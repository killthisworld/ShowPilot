// An act's lighting cue sheet (job 377): their set song by song, each with
// the looks they want and when. Filled on an LD's intake (or uploaded as a
// file), kept on the act (lighting_cues), and opened by the LD on the event.
//
// { songs: [{ id, title, bpm, feel, color, cues: [{ id, at, look, color }] }],
//   notes, files: [{ url, name, type }] }

export const CUE_MOMENTS = ["Intro", "Verse", "Pre-chorus", "Chorus", "Bridge", "Drop", "Breakdown", "Solo", "Outro", "Ending", "Between songs"];
export const CUE_FEELS = ["Chill", "Building", "High energy", "Ballad", "Heavy", "Dancey"];
export const CUE_LOOKS = ["Full wash", "Spot on vocals", "Blackout", "Strobes", "Slow color fade", "Back light / silhouette", "Audience blinders", "Haze", "Chase with the beat", "Hold one color"];
export const CUE_COLORS = ["#FFFFFF", "#FBBF24", "#F97316", "#EF4444", "#EC4899", "#A855F7", "#3B82F6", "#22D3EE", "#22C55E"];

const newId = () => Math.random().toString(36).slice(2, 10);
export const newCue = (at = "") => ({ id: newId(), at, look: "", color: "" });
export const newSong = () => ({ id: newId(), title: "", bpm: "", feel: "", color: "", cues: [] });
export const emptyCueSheet = () => ({ songs: [], notes: "", files: [] });

export function normalizeCueSheet(c) {
  if (!c || typeof c !== "object") return emptyCueSheet();
  return {
    notes: String(c.notes || ""),
    files: Array.isArray(c.files) ? c.files.filter((f) => f && f.url) : [],
    songs: (Array.isArray(c.songs) ? c.songs : []).map((s) => ({
      id: s.id || newId(),
      title: String(s.title || ""),
      bpm: s.bpm === null || s.bpm === undefined ? "" : String(s.bpm),
      feel: String(s.feel || ""),
      color: String(s.color || ""),
      cues: (Array.isArray(s.cues) ? s.cues : []).map((q) => ({ id: q.id || newId(), at: String(q.at || ""), look: String(q.look || ""), color: String(q.color || ""), ...(q.keys && typeof q.keys === "object" ? { keys: q.keys } : {}) })),
    })),
  };
}

const has = (v) => String(v || "").trim() !== "";
// Something filled in: a song with a title or a cue, notes, or a file.
export const cueSheetHasAny = (c) => !!c && ((c.songs || []).some((s) => has(s.title) || (s.cues || []).some((q) => has(q.look))) || has(c.notes) || (c.files || []).length > 0);
// "6 songs · 14 cues"
export function cueSheetSummary(c) {
  const songs = (c?.songs || []).filter((s) => has(s.title) || (s.cues || []).length);
  const cues = songs.reduce((n, s) => n + (s.cues || []).filter((q) => has(q.look) || has(q.at)).length, 0);
  const files = (c?.files || []).length;
  return [songs.length ? `${songs.length} song${songs.length === 1 ? "" : "s"}` : "", cues ? `${cues} cue${cues === 1 ? "" : "s"}` : "", files ? `${files} file${files === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
}
