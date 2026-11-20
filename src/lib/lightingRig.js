import { STAGE_POSITIONS } from "@/lib/stagePositions";
import { normalizeStageCues } from "@/lib/cueLooks";
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
//   on     lights hung on a truss: the truss's id - they go where it goes (job 388)
//   tilt   lights: degrees off straight down (floor lights: off straight up),
//          toward the front of the stage at 0 turn; -90..90 (job 387)
// rig.cues: the LD's own cues for the stage (lib/cueLooks newStageCue).

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
// People on the stage (job 389): { type: "person", label: name, part, color }.
export const isPerson = (t) => t === "person";
// Risers (job 392): { type: "riser", rw, rd, rh } - width, depth, height in feet.
export const isRiser = (t) => t === "riser";
export const isLight = (t) => !isTruss(t) && !isPerson(t) && !isRiser(t);
export const fixtureInfo = (t) => FIXTURE_TYPES.find((f) => f.type === t) || null;
export const rigTypeLabel = (t) => (t === "person" ? "Person" : t === "riser" ? "Riser" : null) || (TRUSS_TYPES.find((x) => x.type === t) || FIXTURE_TYPES.find((x) => x.type === t) || { label: "Item" }).label;

const newId = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const emptyRig = () => ({ width_ft: 32, depth_ft: 24, items: [], cues: [] });

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
      tilt: clamp(Number(i.tilt) || 0, -90, 90),
      ...(i.off ? { off: true } : {}),
      ...(i.type === "riser" ? { rw: clamp(Number(i.rw) || 8, 1, 60), rd: clamp(Number(i.rd) || 8, 1, 60), rh: clamp(Number(i.rh) || 1, 0.25, 10) } : {}),
      ...(i.on ? { on: String(i.on) } : {}),
      // part: a stage plot position key (older ones were saved by label).
      ...(i.type === "person" ? { part: (STAGE_POSITIONS.find((p) => p.key === i.part || p.label === i.part) || {}).key || "" } : {}),
    })),
    cues: normalizeStageCues(r.cues),
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
    h: truss ? 18 : type === "fog" || type === "person" || type === "riser" ? 0 : 18,
    ...(type === "riser" ? { rw: 8, rd: 8, rh: 1 } : {}),
    color: fixtureInfo(type)?.color || "#FFFFFF",
    label: "",
    tilt: 0,
  };
}

export const newRigId = newId;

// Lights hung on a truss (job 387): `count` of `type`, spread evenly along a
// straight truss, along the front of a box, around a circle - just under it.
export function lightsOnTruss(truss, type, count, rig) {
  const W = rig?.width_ft || 32, D = rig?.depth_ft || 24;
  const n = clamp(Math.round(count) || 1, 1, 24);
  const rot = ((truss.rot || 0) * Math.PI) / 180;
  const L = (truss.len || 0.5) * W; // ft
  // Local (lx along the truss, lz toward the front) -> stage fraction.
  const at = (lx, lz) => [
    clamp(truss.x + (lx * Math.cos(rot) - lz * Math.sin(rot)) / W, 0, 1),
    clamp(truss.y + (lx * Math.sin(rot) + lz * Math.cos(rot)) / D, 0, 1),
  ];
  const spots = [];
  for (let k = 0; k < n; k++) {
    if (truss.type === "truss_circle") {
      const a = (k / n) * Math.PI * 2;
      spots.push(at(Math.cos(a) * L / 2, Math.sin(a) * L / 2));
    } else {
      const lx = -L / 2 + (L * (k + 0.5)) / n;
      spots.push(at(lx, truss.type === "truss_box" ? (truss.len * 0.8 * D) / 2 : 0));
    }
  }
  return spots.map(([x, y]) => ({
    ...newRigItem(type, rig), id: newId(), x, y, rot: truss.rot || 0, h: Math.max(0, (truss.h || 0) - 1), on: truss.id,
  }));
}

// The lights on the stage by kind, for the Rig tab: [{ type, label, color, ids }].
export function rigGroups(rig) {
  const out = [];
  (rig?.items || []).forEach((i) => {
    const key = isTruss(i.type) ? "truss" : i.type;
    let g = out.find((x) => x.type === key);
    if (!g) { g = { type: key, label: key === "truss" ? "Truss" : key === "person" ? "People" : rigTypeLabel(i.type), color: key === "truss" ? "#8CFF3D" : key === "person" ? "#E5E7EB" : key === "riser" ? "#6b7280" : fixtureInfo(i.type)?.color || "#fff", ids: [] }; out.push(g); }
    g.ids.push(i.id);
  });
  return out.sort((a, b) => (a.type === "truss" ? -1 : b.type === "truss" ? 1 : 0));
}

// A short summary for template rows: "2 trusses · 14 lights".
export function rigSummary(r) {
  const items = r?.items || [];
  const t = items.filter((i) => isTruss(i.type)).length;
  const p = items.filter((i) => isPerson(i.type)).length;
  const f = items.filter((i) => isLight(i.type)).length;
  return [t ? `${t} truss${t === 1 ? "" : "es"}` : "", f ? `${f} light${f === 1 ? "" : "s"}` : "", p ? `${p} ${p === 1 ? "person" : "people"}` : ""].filter(Boolean).join(" · ");
}
