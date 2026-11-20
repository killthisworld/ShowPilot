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

function micStand(z = 1.0) {
  const g = new THREE.Group();
  const m = std(DARK, { metalness: 0.6 });
  g.add(at(cyl(0.45, 0.45, 0.06, m), 0, 0.03, z));
  g.add(at(cyl(0.035, 0.035, 4.3, m), 0, 2.15, z));
  const mic = at(cyl(0.09, 0.06, 0.45, std("#9aa0a8", { metalness: 0.7 })), 0, 4.35, z - 0.15);
  mic.rotation.x = Math.PI / 3;
  g.add(mic);
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
  // A throne: the drummer's behind the kit.
  g.add(at(cyl(0.45, 0.45, 0.2, std(DARK)), 0, 1.6, -0.1));
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

function stringed(c, { neck = 2.0, body = 0.55, amp = [1.6, 1.3, 0.8] } = {}) {
  const g = new THREE.Group();
  const held = new THREE.Group();
  const b = cyl(body, body, 0.25, std(c, { roughness: 0.3 }), 24); b.rotation.x = Math.PI / 2; b.scale.set(0.85, 1, 1.2);
  held.add(b);
  held.add(at(box(neck, 0.16, 0.08, std("#3b2a1a")), body + neck / 2 - 0.1, 0, 0.05));
  held.add(at(box(0.35, 0.22, 0.08, std(DARK)), body + neck + 0.05, 0, 0.05));
  held.position.set(-0.15, 2.0, 0.75);
  held.rotation.z = 0.45;
  g.add(held);
  // The amp behind them.
  const [w, h, d] = amp;
  g.add(at(box(w, h, d, std(DARK)), 0.9, h / 2, -1.4));
  g.add(at(box(w * 0.85, h * 0.7, 0.02, std("#2b2b2b", { emissive: new THREE.Color(c), emissiveIntensity: 0.15 })), 0.9, h * 0.45, -1.4 + d / 2 + 0.01));
  return g;
}

function keys(c) {
  const g = new THREE.Group();
  const legs = std(DARK, { metalness: 0.5 });
  [-1.1, 1.1].forEach((x) => [1, -1].forEach((s) => {
    const leg = at(box(0.08, 3.2, 0.08, legs), x, 1.35, 1.0);
    leg.rotation.x = s * 0.45;
    g.add(leg);
  }));
  g.add(at(box(3.8, 0.28, 1.05, std(DARK)), 0, 2.85, 1.0));
  g.add(at(box(3.5, 0.03, 0.42, std("#f4f4f4")), 0, 3.0, 1.22));
  g.add(at(box(3.8, 0.06, 0.06, std(c, { emissive: new THREE.Color(c), emissiveIntensity: 0.3 })), 0, 3.0, 0.5));
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

export function personFigure(color, { emissive = 0.12 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: new THREE.Color(color), emissiveIntensity: emissive });
  g.add(at(cyl(0.55, 0.7, 3.0, mat, 16), 0, 1.5, 0));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), mat), 0, 3.55, 0));
  return g;
}
export const PERSON_TOP = 4.1; // ft, the top of their head

export function instrumentProp(part, color, sings = false) {
  const c = color || "#cccccc";
  const g = new THREE.Group();
  const p = String(part || "").toLowerCase();
  if (p === "drums") g.add(drums(c));
  else if (p === "percussion") g.add(percussion(c));
  else if (p === "guitar") g.add(stringed(c));
  else if (p === "bass") g.add(stringed(c, { neck: 2.6, body: 0.62, amp: [1.9, 2.6, 1.2] }));
  else if (p === "keys") g.add(keys(c));
  else if (p === "horns") g.add(horns(c));
  else if (p === "strings") g.add(cello(c));
  else if (p === "dj") g.add(dj(c));
  // A mic for singers; a drummer's sits off to the side of the kit.
  if (p === "vocals" || sings) g.add(p === "drums" ? at(micStand(0), -1.9, 0, 0.3) : p === "keys" || p === "dj" ? at(micStand(0), 0, 0, 0.35) : micStand());
  return g;
}

// Where the person stands with their instrument: behind the kit / keys / decks.
export const personOffset = (part) => ({ drums: -0.3, keys: -0.3, dj: -0.2 }[String(part || "").toLowerCase()] || 0);
