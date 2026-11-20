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

// { color, bpm, wash, spot, back, chase, fade, strobe, blinder, haze, blackout }
export function lookFromCue(cue, song = null) {
  const t = String(cue?.look || "").toLowerCase();
  const look = {
    color: cue?.color || song?.color || "",
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
