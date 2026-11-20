import * as THREE from "three";

// Someone on the 3D stage with what they play (job 390): a figure about
// life size and their instrument, so the LD's stage is a real mock-up.
// Feet; the person stands at the origin facing the audience (+z).
//   part: a stage plot position key (drums, percussion, bass, guitar, keys,
//         vocals, horns, strings, dj, other) or "" for no instrument.
//   sings: a mic stand too.

const DARK = "#1c1c1c";
const METAL = "#8b8f96";
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.1, ...o });
const cyl = (rt, rb, h, m, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

// A rod from a to b (vectors), radius r.
function rod(a, b, r, m, seg = 10) {
  const v = new THREE.Vector3().subVectors(b, a);
  const o = cyl(r, r, v.length(), m, seg);
  o.position.copy(a).addScaledVector(v, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  return o;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const MOUTH_Y = 3.56; // ft, the person's mouth (job 391)
// Drummers and keys players sit on a stool (job 392).
export const SEAT_Y = 1.75; // ft, the top of the stool
export const MOUTH_SEATED = 3.36;
export const isSeated = (part) => part === "drums" || part === "keys";

// A mic on a stand, up at the mouth (job 391): tripod legs, the pole, a boom
// when the stand is off to the side, the clip and a mic with its grille
// just in front of their lips. Stand at (sx, sz); mouth at (0, MOUTH_Y, mz).
function micStand({ sx = 0, sz = 0.85, mz = 0.28, my = MOUTH_Y } = {}) {
  const g = new THREE.Group();
  const black = std("#151515", { metalness: 0.5, roughness: 0.4 });
  const chrome = std("#b8bcc2", { metalness: 0.9, roughness: 0.25 });
  // Tripod.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    g.add(rod(V(sx, 0.55, sz), V(sx + Math.cos(a) * 0.55, 0.02, sz + Math.sin(a) * 0.55), 0.022, black));
  }
  const grille = V(0, my - 0.02, mz + 0.2);
  const side = Math.abs(sx) > 0.3;
  const top = V(sx, side ? my - 0.6 : my - 0.42, sz);
  g.add(rod(V(sx, 0.5, sz), top, 0.03, black));
  g.add(at(cyl(0.045, 0.045, 0.1, black, 10), top.x, top.y - 0.12, top.z)); // the clutch
  // The mic's tail sits a little back from the grille, angled up to the mouth.
  const tail = side ? V(grille.x + (sx > 0 ? 0.35 : -0.35), grille.y - 0.12, grille.z + 0.3) : V(0, grille.y - 0.3, grille.z + 0.32);
  if (side) g.add(rod(top, tail, 0.022, black)); // boom arm
  else g.add(rod(top, tail, 0.025, black));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), black), tail.x, tail.y, tail.z)); // clip
  g.add(rod(tail, grille, 0.045, black, 14)); // handle
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), chrome);
  head.position.copy(grille);
  g.add(head);
  return g;
}

function drums(c) {
  const g = new THREE.Group();
  const shell = std(c, { roughness: 0.35 });
  const head = std("#e9e5dc");
  const metal = std(METAL, { metalness: 0.8, roughness: 0.3 });
  const brass = std("#c9a227", { metalness: 0.8, roughness: 0.3 });
  const kick = cyl(0.9, 0.9, 1.2, shell); kick.rotation.x = Math.PI / 2; g.add(at(kick, 0, 0.9, 1.5));
  const kickHead = cyl(0.86, 0.86, 0.02, head); kickHead.rotation.x = Math.PI / 2; g.add(at(kickHead, 0, 0.9, 2.12));
  const drum = (r, h, x, y, z) => { g.add(at(cyl(r, r, h, shell), x, y, z)); g.add(at(cyl(r * 0.97, r * 0.97, 0.02, head), x, y + h / 2 + 0.01, z)); };
  drum(0.5, 0.4, -0.95, 2.1, 1.0); // snare
  drum(0.42, 0.45, -0.38, 2.75, 1.45); // rack toms
  drum(0.46, 0.5, 0.42, 2.75, 1.45);
  drum(0.62, 1.0, 1.2, 1.2, 0.95); // floor tom
  [[-1.65, 3.6, 1.6], [1.55, 3.8, 1.9], [-1.2, 3.0, 0.5]].forEach(([x, y, z]) => {
    g.add(at(cyl(0.03, 0.03, y, metal, 8), x, y / 2, z));
    g.add(at(cyl(0.75, 0.75, 0.03, brass, 28), x, y, z));
  });
  return g;
}

function percussion(c) {
  const g = new THREE.Group();
  const shell = std(c, { roughness: 0.4 });
  const head = std("#e9e5dc");
  [[-0.6, 2.7], [0.6, 2.5]].forEach(([x, h]) => {
    g.add(at(cyl(0.48, 0.38, h, shell), x, h / 2, 1.0));
    g.add(at(cyl(0.47, 0.47, 0.02, head), x, h + 0.01, 1.0));
  });
  return g;
}

// A guitar or bass held across the body (job 392): a shaped, carved body
// with a pickguard, pickups and bridge, a maple neck with a dark fretboard,
// headstock and tuners, strings, and a strap. No amps behind them.
function guitarBody(scale) {
  const pts = [[-0.75, 0], [-0.62, 0.42], [-0.3, 0.5], [-0.05, 0.38], [0.15, 0.36], [0.38, 0.47], [0.62, 0.42], [0.5, 0.14],
    [0.5, -0.14], [0.58, -0.3], [0.35, -0.42], [0.12, -0.34], [-0.08, -0.4], [-0.35, -0.5], [-0.65, -0.4], [-0.75, 0]]
    .map(([x, y]) => new THREE.Vector2(x * scale, y * scale));
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, pts[0].y);
  shape.splineThru(pts.slice(1));
  return shape;
}
function stringed(c, { bass = false, alone = false } = {}) {
  const g = new THREE.Group();
  const held = new THREE.Group();
  const sc = bass ? 1.0 : 0.88;
  const thick = 0.14;
  const bodyMat = std(c, { roughness: 0.25, metalness: 0.15 });
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(guitarBody(sc), { depth: thick, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 24 }), bodyMat);
  held.add(body);
  const face = thick + 0.03; // the front of the body
  // Pickguard.
  const guard = new THREE.Shape();
  guard.moveTo(-0.45 * sc, -0.32 * sc);
  guard.splineThru([[-0.2, -0.38], [0.1, -0.25], [0.35, -0.08], [0.32, 0.18], [0.05, 0.22], [-0.3, 0.1], [-0.45, -0.32]].map(([x, y]) => new THREE.Vector2(x * sc, y * sc)));
  const pg = new THREE.Mesh(new THREE.ShapeGeometry(guard, 16), std("#f2efe8", { roughness: 0.4 }));
  pg.position.z = face + 0.002;
  held.add(pg);
  const black = std("#0c0c0c", { roughness: 0.4 });
  const chrome = std("#c8ccd2", { metalness: 0.9, roughness: 0.25 });
  // Pickups and bridge.
  (bass ? [-0.05] : [-0.2, 0.02, 0.22]).forEach((x) => held.add(at(box(0.09, bass ? 0.3 : 0.24, 0.04, black), x * sc, 0, face + 0.02)));
  held.add(at(box(0.12, bass ? 0.32 : 0.28, 0.04, chrome), -0.48 * sc, 0, face + 0.02));
  // Neck: maple, a dark fretboard on top, then the headstock and tuners.
  const neckLen = bass ? 2.55 : 1.85;
  const x0 = 0.42 * sc;
  held.add(at(box(neckLen, bass ? 0.15 : 0.14, 0.09, std("#d8b47c", { roughness: 0.5 })), x0 + neckLen / 2, 0, thick / 2 + 0.03));
  held.add(at(box(neckLen, bass ? 0.15 : 0.14, 0.02, std("#2a1a10", { roughness: 0.6 })), x0 + neckLen / 2, 0, thick / 2 + 0.085));
  for (let k = 1; k < 20; k++) held.add(at(box(0.008, 0.14, 0.012, chrome), x0 + neckLen * (1 - Math.pow(0.944, k)), 0, thick / 2 + 0.1));
  const headLen = bass ? 0.62 : 0.48;
  const head = at(box(headLen, bass ? 0.24 : 0.22, 0.06, std(bass ? "#d8b47c" : DARK, { roughness: 0.4 })), x0 + neckLen + headLen / 2, 0.03, thick / 2 + 0.03);
  held.add(head);
  const nTun = bass ? 4 : 6;
  for (let k = 0; k < nTun; k++) held.add(at(cyl(0.025, 0.025, 0.06, chrome, 8), x0 + neckLen + 0.06 + (k * (headLen - 0.1)) / (nTun - 1), 0.16, thick / 2 + 0.03));
  // Strings: bridge to nut.
  const pts = [];
  for (let k = 0; k < nTun; k++) {
    const y = (k - (nTun - 1) / 2) * (bass ? 0.035 : 0.022);
    pts.push(new THREE.Vector3(-0.48 * sc, y, face + 0.05), new THREE.Vector3(x0 + neckLen, y, thick / 2 + 0.115));
  }
  held.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#e8e8e8" })));
  if (alone) {
    // On a guitar stand: upright, leaning back a little, on an A-frame.
    held.position.set(0, 0.95 * sc, 0.6);
    held.rotation.set(-0.18, 0, Math.PI / 2);
    g.add(held);
    g.add(rod(V(-0.35, 0.02, 0.85), V(0, 0.75, 0.6), 0.03, black));
    g.add(rod(V(0.35, 0.02, 0.85), V(0, 0.75, 0.6), 0.03, black));
    g.add(rod(V(0, 0.02, 0.2), V(0, 1.9, 0.42), 0.03, black));
    return g;
  }
  // Slung across the body: low at the right hip, the neck up to their left.
  held.position.set(-0.1, 2.05, 0.28);
  held.rotation.z = 0.42;
  g.add(held);
  // The strap, over the left shoulder.
  g.add(rod(V(-0.78, 1.76, 0.3), V(0.3, 3.15, 0.05), 0.03, black));
  return g;
}

function keys(c) {
  const g = new THREE.Group();
  const legs = std(DARK, { metalness: 0.5 });
  [-1.1, 1.1].forEach((x) => [1, -1].forEach((s) => {
    const leg = at(box(0.08, 2.6, 0.08, legs), x, 1.1, 1.0);
    leg.rotation.x = s * 0.45;
    g.add(leg);
  }));
  // At sitting height (job 392).
  g.add(at(box(3.8, 0.28, 1.05, std(DARK)), 0, 2.35, 1.0));
  g.add(at(box(3.5, 0.03, 0.42, std("#f4f4f4")), 0, 2.5, 0.75));
  g.add(at(box(3.8, 0.06, 0.06, std(c, { emissive: new THREE.Color(c), emissiveIntensity: 0.3 })), 0, 2.5, 1.5));
  return g;
}

function horns(c) {
  const g = new THREE.Group();
  const brass = std(c === "#F472B6" ? "#d4a017" : c, { metalness: 0.8, roughness: 0.3 });
  const tube = at(cyl(0.11, 0.14, 1.7, brass, 12), 0.25, 2.2, 0.75);
  tube.rotation.z = 0.25;
  g.add(tube);
  const bell = at(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 16, 1, true), brass), 0.5, 1.4, 0.85);
  bell.rotation.z = Math.PI;
  g.add(bell);
  return g;
}

function cello(c) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), std(c === "#2DD4BF" ? "#7a3e1d" : c, { roughness: 0.35 }));
  body.scale.set(1, 1.6, 0.45);
  g.add(at(body, 0, 1.3, 0.9));
  g.add(at(box(0.14, 1.9, 0.1, std("#24170d")), 0, 3.1, 0.9));
  return g;
}

function dj(c) {
  const g = new THREE.Group();
  g.add(at(box(4.2, 2.9, 1.8, std(DARK)), 0, 1.45, 1.3));
  g.add(at(box(4.2, 0.05, 1.8, std("#2a2a2a")), 0, 2.93, 1.3));
  [-1.2, 1.2].forEach((x) => g.add(at(cyl(0.6, 0.6, 0.08, std("#111", { metalness: 0.4 }), 28), x, 3.0, 1.3)));
  g.add(at(box(0.9, 0.06, 0.9, std(c, { emissive: new THREE.Color(c), emissiveIntensity: 0.4 })), 0, 3.0, 1.3));
  return g;
}

// A black stool (job 392): round seat, column and three feet.
function stool(z) {
  const g = new THREE.Group();
  const black = std("#0d0d0d", { roughness: 0.5, metalness: 0.3 });
  g.add(at(cyl(0.5, 0.48, 0.18, black, 24), 0, SEAT_Y - 0.09, z));
  g.add(at(cyl(0.05, 0.05, SEAT_Y - 0.5, black, 10), 0, (SEAT_Y - 0.5) / 2 + 0.3, z));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.3;
    g.add(rod(V(0, 0.42, z), V(Math.cos(a) * 0.6, 0.02, z + Math.sin(a) * 0.6), 0.03, black));
  }
  return g;
}

// A slim figure (job 391): legs, torso, arms, neck and head. Seated (job
// 392): on the stool, thighs forward, shins down, hands out to the kit / keys.
export function personFigure(color, { emissive = 0.12, seated = false } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: new THREE.Color(color), emissiveIntensity: emissive });
  if (seated) {
    const hip = SEAT_Y + 0.1;
    [-0.15, 0.15].forEach((x) => {
      g.add(rod(V(x, hip, 0), V(x, hip, 1.05), 0.11, mat));
      g.add(rod(V(x, hip, 1.05), V(x, 0.05, 1.12), 0.095, mat));
    });
    g.add(at(cyl(0.3, 0.23, 1.25, mat, 14), 0, hip + 0.62, 0));
    [-1, 1].forEach((s2) => g.add(rod(V(s2 * 0.36, hip + 1.12, 0), V(s2 * 0.5, hip + 0.62, 0.9), 0.07, mat)));
    g.add(at(cyl(0.09, 0.1, 0.22, mat, 8), 0, hip + 1.33, 0));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 12), mat), 0, MOUTH_SEATED + 0.1, 0));
    return g;
  }
  [-0.14, 0.14].forEach((x) => g.add(at(cyl(0.11, 0.09, 1.9, mat, 10), x, 0.95, 0)));
  g.add(at(cyl(0.3, 0.23, 1.35, mat, 14), 0, 2.55, 0));
  [-1, 1].forEach((s2) => { const arm = at(cyl(0.075, 0.065, 1.25, mat, 8), s2 * 0.38, 2.55, 0.02); arm.rotation.z = s2 * 0.12; g.add(arm); });
  g.add(at(cyl(0.09, 0.1, 0.22, mat, 8), 0, 3.3, 0));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 12), mat), 0, MOUTH_Y + 0.1, 0));
  return g;
}
export const PERSON_TOP = 4.0; // ft, the top of their head

// alone (job 394): no one at it - a guitar / bass / horn stands on a stand.
export function instrumentProp(part, color, sings = false, { alone = false } = {}) {
  const c = color || "#cccccc";
  const g = new THREE.Group();
  const p = String(part || "").toLowerCase();
  if (p === "drums") g.add(drums(c));
  else if (p === "percussion") g.add(percussion(c));
  else if (p === "guitar") g.add(stringed(c, { alone }));
  else if (p === "bass") g.add(stringed(c, { bass: true, alone }));
  else if (p === "keys") g.add(keys(c));
  else if (p === "horns") {
    const h = horns(c);
    if (alone) {
      // Set down on a horn stand.
      h.position.y = -1.0;
      const black = std("#151515", { metalness: 0.5 });
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; g.add(rod(V(0.4, 0.45, 0.8), V(0.4 + Math.cos(a) * 0.35, 0.02, 0.8 + Math.sin(a) * 0.35), 0.025, black)); }
    }
    g.add(h);
  }
  else if (p === "strings") g.add(cello(c));
  else if (p === "dj") g.add(dj(c));
  if (isSeated(p)) g.add(stool(personOffset(p)));
  // A mic for singers; a drummer's sits off to the side of the kit.
  // The mic comes to the mouth: from in front, or on a boom past the kit / keys / decks.
  if (p === "vocals" || sings) {
    const mz = personOffset(p) + 0.28;
    const my = isSeated(p) ? MOUTH_SEATED : MOUTH_Y;
    g.add(p === "drums" ? micStand({ sx: -1.55, sz: mz + 0.2, mz, my }) : p === "keys" || p === "dj" ? micStand({ sx: 1.0, sz: mz + 0.35, mz, my }) : micStand({ sz: mz + 0.62, mz, my }));
  }
  return g;
}

// Where the person stands with their instrument: behind the kit / keys / decks.
export const personOffset = (part) => ({ drums: -0.3, keys: -0.3, dj: -0.2 }[String(part || "").toLowerCase()] || 0);
