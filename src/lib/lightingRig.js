// An LD's lighting rig for a venue's stage (job 377): trusses and single
// fixtures laid out on the same 4:3 stage as the stage plot. Kept on the LD's
// venue template (data.lighting_rig) and shown, look-only, under the members
// on the stage plot their intake links send.
//
// { width_ft, depth_ft, items: [{ id, type, x, y, rot, len, h, color, label }] }
//   x, y   centre on the stage, 0..1 (0,0 = back left, 1,1 = front right)
//   rot    degrees, clockwise
//   len    trusses: straight = length as a share of the stage width;
//          box = width share (depth is len * 0.6); circle = diameter share
//   h      trim height in feet (fixtures on the floor: 0)

export const TRUSS_TYPES = [
  { type: "truss_straight", label: "Straight" },
  { type: "truss_box", label: "Box" },
  { type: "truss_circle", label: "Circle" },
];

export const FIXTURE_TYPES = [
  { type: "spot", label: "Spot", color: "#FFFFFF" },
  { type: "wash", label: "Wash", color: "#60A5FA" },
  { type: "beam", label: "Beam", color: "#C084FC" },
  { type: "par", label: "Par", color: "#F59E0B" },
  { type: "strobe", label: "Strobe", color: "#FFFFFF" },
  { type: "blinder", label: "Blinder", color: "#FBBF24" },
  { type: "led_bar", label: "LED bar", color: "#22D3EE" },
  { type: "fog", label: "Fog / haze", color: "#9CA3AF" },
];

export const RIG_COLORS = ["#FFFFFF", "#FBBF24", "#F59E0B", "#EF4444", "#EC4899", "#C084FC", "#60A5FA", "#22D3EE", "#8CFF3D"];

export const isTruss = (t) => String(t || "").startsWith("truss_");
export const fixtureInfo = (t) => FIXTURE_TYPES.find((f) => f.type === t) || null;
export const rigTypeLabel = (t) => (TRUSS_TYPES.find((x) => x.type === t) || FIXTURE_TYPES.find((x) => x.type === t) || { label: "Item" }).label;

const newId = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const emptyRig = () => ({ width_ft: 32, depth_ft: 24, items: [] });

export function normalizeRig(r) {
  if (!r || typeof r !== "object") return emptyRig();
  return {
    width_ft: clamp(Number(r.width_ft) || 32, 8, 200),
    depth_ft: clamp(Number(r.depth_ft) || 24, 6, 150),
    items: (Array.isArray(r.items) ? r.items : []).filter((i) => i && i.type).slice(0, 300).map((i) => ({
      id: i.id || newId(),
      type: String(i.type),
      x: clamp(Number(i.x) || 0.5, 0, 1),
      y: clamp(Number(i.y) || 0.5, 0, 1),
      rot: Number(i.rot) || 0,
      len: clamp(Number(i.len) || (i.type === "truss_straight" ? 0.6 : 0.3), 0.04, 1.2),
      h: clamp(Number(i.h ?? (isTruss(i.type) ? 18 : 0)) || 0, 0, 80),
      color: i.color || fixtureInfo(i.type)?.color || "#FFFFFF",
      label: String(i.label || "").slice(0, 40),
    })),
  };
}

export const rigHasItems = (r) => !!(r && Array.isArray(r.items) && r.items.length);

// A new item, near the middle (a little lower each time so they don't stack).
export function newRigItem(type, rig) {
  const n = (rig?.items || []).length;
  const truss = isTruss(type);
  return {
    id: newId(),
    type,
    // Trusses across the middle, lights spread left to right along the
    // front-most truss line, so new ones don't land on top of each other.
    x: truss ? 0.5 : [0.2, 0.8, 0.35, 0.65, 0.5, 0.1, 0.9][n % 7],
    y: truss ? clamp(0.22 + (n % 4) * 0.16, 0.1, 0.9) : clamp(0.22 + Math.floor(n / 7) * 0.16, 0.1, 0.9),
    rot: 0,
    len: type === "truss_straight" ? 0.7 : type === "truss_box" ? 0.5 : type === "truss_circle" ? 0.35 : 0.1,
    h: truss ? 18 : type === "fog" ? 0 : 18,
    color: fixtureInfo(type)?.color || "#FFFFFF",
    label: "",
  };
}

// A short summary for template rows: "2 trusses · 14 lights".
export function rigSummary(r) {
  const items = r?.items || [];
  const t = items.filter((i) => isTruss(i.type)).length;
  const f = items.length - t;
  return [t ? `${t} truss${t === 1 ? "" : "es"}` : "", f ? `${f} light${f === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
}
