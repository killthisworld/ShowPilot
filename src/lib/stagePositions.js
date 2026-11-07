// Stage plot positions (job 249): what each member plays, grouped, each with a
// color. The audio engineer can set their own color per position in Settings
// (user_preferences.stage_plot_colors, { [key]: "#hex" }); stage plots made
// from their intake links use those colors.
export const STAGE_POSITIONS = [
  { key: "drums", label: "Drums", color: "#F87171", re: /drum|kit\b|kick|snare|hi.?hat|cymbal/i },
  { key: "percussion", label: "Percussion", color: "#FB923C", re: /perc|conga|bongo|cajon|shaker|tamb|timbal/i },
  { key: "bass", label: "Bass", color: "#A78BFA", re: /bass/i },
  { key: "guitar", label: "Guitar", color: "#FBBF24", re: /guitar|gtr|banjo|mandolin|ukulele|uke\b/i },
  { key: "keys", label: "Keys", color: "#22D3EE", re: /key|piano|synth|organ|rhodes|wurli|moog/i },
  { key: "vocals", label: "Vocals", color: "#8CFF3D", re: /vox|vocal|voice|sing|\bmc\b|rap|lead vox|bv/i },
  { key: "horns", label: "Horns", color: "#F472B6", re: /sax|trumpet|trombone|horn|brass|flute|clarinet|tuba/i },
  { key: "strings", label: "Strings", color: "#2DD4BF", re: /violin|viola|cello|fiddle|string|harp/i },
  { key: "dj", label: "DJ / Tracks", color: "#E8D5A6", re: /\bdj\b|track|laptop|playback|turntable|sampler|mpc|backing/i },
  { key: "other", label: "Other", color: "#CBD5E1", re: null },
];

const HEX = /^#[0-9a-f]{6}$/i;

export const positionOfInstrument = (name) => {
  const n = String(name || "");
  // Drums before bass so "bass drum" is drums.
  return STAGE_POSITIONS.find((p) => p.re && p.re.test(n))?.key || "other";
};

// A member's position: their first instrument that isn't vocals, else vocals.
export const positionOfMember = (member, getInstruments) => {
  const keys = (getInstruments(member) || []).map((x) => x.name).filter(Boolean).map(positionOfInstrument);
  return keys.find((k) => k !== "vocals") || keys[0] || "other";
};

export const positionLabel = (key) => STAGE_POSITIONS.find((p) => p.key === key)?.label || "Other";

export const positionColor = (key, custom) => {
  const c = custom?.[key];
  if (c && HEX.test(c)) return c;
  return STAGE_POSITIONS.find((p) => p.key === key)?.color || "#CBD5E1";
};

// Dark or light text on top of a color.
export const inkOn = (hex) => {
  const n = parseInt(String(hex || "#ffffff").slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 140 ? "#0d0d0d" : "#ffffff";
};
