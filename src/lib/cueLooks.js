// A cue's words turned into what the 3D stage shows (job 383): "red wash,
// strobes on the drop" -> { color, wash, strobe, ... }. Used to play an act's
// cue sheet on the LD's 3D stage, and by the look keys in Rig the stage.

export const LOOK_KEYS = [
  { id: "wash", label: "Full wash" },
  { id: "spot", label: "Spot on vocals" },
  { id: "back", label: "Back light" },
  { id: "chase", label: "Chase" },
  { id: "fade", label: "Color fade" },
  { id: "strobe", label: "Strobes" },
  { id: "blinder", label: "Blinders" },
  { id: "haze", label: "Haze" },
  { id: "blackout", label: "Blackout" },
];

const has = (t, ...words) => words.some((w) => t.includes(w));
// A color named in the cue ("blue wash") beats the song's color.
const COLOR_WORDS = [["red", "#EF4444"], ["blue", "#3B82F6"], ["green", "#22C55E"], ["amber", "#F59E0B"], ["orange", "#F97316"], ["yellow", "#FACC15"], ["purple", "#A855F7"], ["violet", "#8B5CF6"], ["pink", "#EC4899"], ["magenta", "#D946EF"], ["cyan", "#22D3EE"], ["teal", "#14B8A6"], ["white", "#FFFFFF"], ["warm", "#FBBF77"], ["cold", "#BFDBFE"]];
const colorWord = (t) => COLOR_WORDS.find(([w]) => new RegExp(`\\b${w}\\b`).test(t))?.[1] || "";

// { color, bpm, wash, spot, back, chase, fade, strobe, blinder, haze, blackout }
export function lookFromCue(cue, song = null) {
  const t = String(cue?.look || "").toLowerCase();
  // The LD set this cue's look on the 3D stage (job 387): that wins.
  if (cue?.keys && typeof cue.keys === "object") return lookFromKeys(cue.keys, cue.color || colorWord(t) || song?.color || "", Number(song?.bpm) || 120);
  const look = {
    color: cue?.color || colorWord(t) || song?.color || "",
    bpm: Number(song?.bpm) || 120,
    wash: has(t, "wash", "full", "everything", "all on", "bright"),
    spot: has(t, "spot", "vocal", "singer", "follow"),
    back: has(t, "back light", "backlight", "silhouette", "upstage"),
    chase: has(t, "chase", "beat", "pulse", "bounce"),
    fade: has(t, "fade", "rainbow", "cycle", "slow color"),
    strobe: has(t, "strobe", "flash"),
    blinder: has(t, "blinder", "audience", "crowd"),
    haze: has(t, "haze", "fog", "smoke"),
    blackout: has(t, "blackout", "black out", "dark", "lights out"),
  };
  // Nothing we recognise: just bring the stage up in its color.
  if (!["wash", "spot", "back", "chase", "fade", "strobe", "blinder", "blackout"].some((k) => look[k])) look.wash = true;
  return look;
}

// The keys a cue's words would press, to start the LD off when they set it.
export function keysFromCue(cue, song = null) {
  const l = lookFromCue({ look: cue?.look, color: cue?.color }, song);
  return Object.fromEntries(LOOK_KEYS.filter((k) => l[k.id]).map((k) => [k.id, true]));
}

// The look from the keys pressed in Rig the stage.
export function lookFromKeys(keys = {}, color = "", bpm = 120) {
  const look = { color, bpm, ...Object.fromEntries(LOOK_KEYS.map((k) => [k.id, !!keys[k.id]])) };
  return look;
}

// Every cue of a cue sheet in order, flattened: [{ song, songIndex, cue, look }].
export function cueSteps(sheet) {
  const out = [];
  (sheet?.songs || []).forEach((song, si) => {
    const cues = (song.cues || []).filter((q) => String(q.look || "").trim() || String(q.at || "").trim());
    if (!cues.length) out.push({ song, songIndex: si, cue: { at: "", look: song.feel ? song.feel : "Full wash", color: song.color }, look: lookFromCue({ look: "wash", color: song.color }, song) });
    cues.forEach((cue) => out.push({ song, songIndex: si, cue, look: lookFromCue(cue, song) }));
  });
  return out;
}

// The LD's own cues, saved with the stage (job 387): rig.cues.
export const newStageCue = (n = 0) => ({ id: Math.random().toString(36).slice(2, 10), name: `Cue ${n + 1}`, keys: { wash: true }, color: "", bpm: 120, secs: 8 });

// How long a cue plays when tapped (job 389): its own length, else 16 beats.
export const cueSecs = (secs, bpm = 120) => Math.min(300, Math.max(1, Number(secs) || (60 / (Number(bpm) || 120)) * 16));
export function normalizeStageCues(list) {
  return (Array.isArray(list) ? list : []).filter((c) => c && typeof c === "object").slice(0, 200).map((c, i) => ({
    id: c.id || Math.random().toString(36).slice(2, 10),
    name: String(c.name || `Cue ${i + 1}`).slice(0, 60),
    keys: c.keys && typeof c.keys === "object" ? Object.fromEntries(LOOK_KEYS.map((k) => [k.id, !!c.keys[k.id]]).filter(([, v]) => v)) : {},
    color: String(c.color || ""),
    bpm: Math.min(220, Math.max(40, Number(c.bpm) || 120)),
    secs: Math.min(300, Math.max(1, Number(c.secs) || 8)),
    // Which lights (none picked = all of them) and the fade in, s (job 393).
    lights: Array.isArray(c.lights) ? c.lights.map(String).slice(0, 300) : [],
    fadeIn: Math.min(30, Math.max(0, Number(c.fadeIn) || 0)),
  }));
}
