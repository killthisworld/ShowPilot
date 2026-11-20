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
];
// Fog / haze is gone from the palette (job 398); older stages may still have one.
const OLD_FIXTURES = [{ type: "fog", label: "Fog / haze", color: "#9CA3AF" }];

export const RIG_COLORS = ["#FFFFFF", "#FDE047", "#F59E0B", "#EF4444", "#EC4899", "#C084FC", "#60A5FA", "#22D3EE", "#8CFF3D"];

export const isTruss = (t) => String(t || "").startsWith("truss_");
// People on the stage (job 389): { type: "person", label: name, part, color }.
export const isPerson = (t) => t === "person";
// Risers (job 392): { type: "riser", rw, rd, rh } - width, depth, height in feet.
export const isRiser = (t) => t === "riser";
// An instrument on its own, no one at it (job 394): { type: "instrument", part }.
export const isInstrument = (t) => t === "instrument";
// An LED screen (job 398): { type: "screen", sw, sh } - width and height in
// feet; h is its centre's height; it turns, tilts and rolls all the way round.
export const isScreen = (t) => t === "screen";
// Turns, tilts and rolls all the way round, not just aims.
export const spinsFully = (t) => isTruss(t) || isScreen(t);
export const isLight = (t) => !isTruss(t) && !isPerson(t) && !isRiser(t) && !isInstrument(t) && !isScreen(t);
export const fixtureInfo = (t) => FIXTURE_TYPES.find((f) => f.type === t) || OLD_FIXTURES.find((f) => f.type === t) || null;
export const rigTypeLabel = (t) => (t === "person" ? "Person" : t === "riser" ? "Riser" : t === "instrument" ? "Instrument" : t === "screen" ? "LED screen" : null) || (TRUSS_TYPES.find((x) => x.type === t) || FIXTURE_TYPES.find((x) => x.type === t) || { label: "Item" }).label;

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
      // Trusses tilt and roll all the way round (job 392); lights tilt to 90.
      tilt: spinsFully(i.type) ? ((((Number(i.tilt) || 0) + 180) % 360 + 360) % 360) - 180 : clamp(Number(i.tilt) || 0, -90, 90),
      ...(spinsFully(i.type) && Number(i.roll) ? { roll: ((((Number(i.roll) || 0) + 180) % 360 + 360) % 360) - 180 } : {}),
      ...(i.off ? { off: true } : {}),
      ...(i.type === "screen" ? { sw: clamp(Number(i.sw) || 16, 1, 120), sh: clamp(Number(i.sh) || 9, 1, 60) } : {}),
      ...(i.type === "riser" ? { rw: clamp(Number(i.rw) || 8, 1, 60), rd: clamp(Number(i.rd) || 8, 1, 60), rh: clamp(Number(i.rh) || 1, 0.25, 10) } : {}),
      ...(i.on ? { on: String(i.on) } : {}),
      // part: a stage plot position key (older ones were saved by label).
      ...(i.type === "person" || i.type === "instrument" ? { part: (STAGE_POSITIONS.find((p) => p.key === i.part || p.label === i.part) || {}).key || "" } : {}),
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
    h: truss ? 18 : type === "fog" || type === "person" || type === "riser" || type === "instrument" ? 0 : 18,
    ...(type === "riser" ? { rw: 8, rd: 8, rh: 1 } : {}),
    ...(type === "screen" ? { sw: 16, sh: 9, h: 9, x: 0.5, y: 0.06 } : {}),
    color: fixtureInfo(type)?.color || "#FFFFFF",
    label: "",
    tilt: 0,
  };
}

export const newRigId = newId;

// Lights hung on a truss (job 387): `count` of `type`, spread evenly along a
// straight truss, along the front of a box, around a circle - just under it.
// A truss's own frame, as the 3D stage draws it (turn, then tilt, then roll):
// a point along / under the truss <-> feet from its centre on the stage.
// [x across, y up, z toward the front], feet. (job 398)
const R = (d) => (d * Math.PI) / 180;
const rx = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const ry = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rz = ([x, y, z], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
export const trussToStage = (t, v) => ry(rx(rz(v, R(t.roll || 0)), R(t.tilt || 0)), -R(t.rot || 0));
export const stageToTruss = (t, v) => rz(rx(ry(v, R(t.rot || 0)), -R(t.tilt || 0)), -R(t.roll || 0));

// Lights hung on a truss (jobs 387, 398): `count` of `type`, spread evenly
// along a straight truss, along the front of a box, around a circle - just
// under it, however the truss is turned, tilted and rolled.
export function lightsOnTruss(truss, type, count, rig) {
  const W = rig?.width_ft || 32, D = rig?.depth_ft || 24;
  const n = clamp(Math.round(count) || 1, 1, 24);
  const L = (truss.len || 0.5) * W; // ft
  const local = [];
  for (let k = 0; k < n; k++) {
    if (truss.type === "truss_circle") {
      const a = (k / n) * Math.PI * 2;
      local.push([Math.cos(a) * L / 2, -1, Math.sin(a) * L / 2]);
    } else {
      local.push([-L / 2 + (L * (k + 0.5)) / n, -1, truss.type === "truss_box" ? (truss.len * 0.8 * D) / 2 : 0]);
    }
  }
  return local.map((v) => {
    const [dx, dy, dz] = trussToStage(truss, v);
    return {
      ...newRigItem(type, rig), id: newId(),
      x: clamp(truss.x + dx / W, 0, 1), y: clamp(truss.y + dz / D, 0, 1), h: clamp((truss.h || 0) + dy, 0, 80),
      rot: truss.rot || 0, on: truss.id,
    };
  });
}

// The lights on the stage by kind, for the Rig tab: [{ type, label, color, ids }].
export function rigGroups(rig) {
  const out = [];
  (rig?.items || []).forEach((i) => {
    const key = isTruss(i.type) ? "truss" : i.type;
    let g = out.find((x) => x.type === key);
    if (!g) { g = { type: key, label: key === "truss" ? "Truss" : key === "person" ? "People" : rigTypeLabel(i.type), color: key === "truss" ? "#8CFF3D" : key === "person" ? "#E5E7EB" : key === "riser" ? "#6b7280" : key === "screen" ? "#38BDF8" : fixtureInfo(i.type)?.color || "#fff", ids: [] }; out.push(g); }
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

// Click to place, lined up (job 399): a truss or screen being placed at x, y
// snaps (within 1.5 ft) to the middle of the stage, its quarter lines, and
// the trusses / screens already there - in line with them, level with them,
// or mirrored across the middle from them. -> { x, y, gx, gy } (gx / gy: the
// line it snapped to, for a guide; null when it didn't).
export function snapPlace(x, y, rig, skip = []) {
  const W = rig?.width_ft || 32, D = rig?.depth_ft || 24;
  const others = (rig?.items || []).filter((i) => spinsFully(i.type) && !skip.includes(i.id));
  const xs = [0.5, 0.25, 0.75, ...others.map((o) => o.x), ...others.map((o) => 1 - o.x)];
  const ys = [0.5, ...others.map((o) => o.y)];
  const near = (v, list, tol) => list.reduce((best, c) => (Math.abs(v - c) <= tol && (best === null || Math.abs(v - c) < Math.abs(v - best)) ? c : best), null);
  const gx = near(x, xs, 1.5 / W);
  const gy = near(y, ys, 1.5 / D);
  return { x: gx ?? x, y: gy ?? y, gx, gy };
}
