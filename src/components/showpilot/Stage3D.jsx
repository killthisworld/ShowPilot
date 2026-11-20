import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { isTruss, spinsFully, snapPlace } from "@/lib/lightingRig";
import { personFigure, instrumentProp, personOffset, isSeated, PERSON_TOP } from "@/lib/stageProps3D";

// The LD's 3D stage (job 383): the deck to scale, trusses at their trim,
// every light with its beam, and the members standing where they are.
// One scene for everything the LD does with it:
//   mode "view"   orbit and zoom
//   mode "build"  tap a truss / light (onTapItem(id)), tap the stage
//                 (onTapDeck(x, y)), drag items across the stage - a picked
//                 group moves together (onDragStart(id), onMoveItems([{id,x,y}]))
//                 selected: ids picked; moving: ids in hand (grey until placed,
//                 placed ones are green - job 387)
//   mode "place"  drag members, tap the deck to put the picked member there
//                 (onTapDeck(x, y), onMoveMember(i, x, y))
// `look` plays a lighting look (lib/cueLooks): color, wash, spots on the
// singers, chase / strobe to the BPM, fades, blinders, haze, blackout.
// Positions are the stage plot's: x 0..1 left to right, y 0..1 back to front.
//   members: [{ x, y, color, name, sub, sings }]

const DECK = 3; // deck height, ft
const GREY = "#8a8f96";   // in hand, not placed yet
const PLACED = "#57B82B"; // placed
const PICKED = "#A6FF5C"; // placed and picked

function labelSprite(name, sub, color) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 160;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0.65)";
  g.font = "bold 62px Inter, system-ui, sans-serif";
  const w = Math.min(500, Math.max(g.measureText(String(name || "")).width, String(sub || "").length * 26) + 60);
  g.beginPath(); if (g.roundRect) g.roundRect((512 - w) / 2, 8, w, 144, 28); else g.rect((512 - w) / 2, 8, w, 144); g.fill();
  g.textAlign = "center";
  g.fillStyle = "#ffffff"; g.font = "bold 62px Inter, system-ui, sans-serif";
  g.fillText(String(name || "").slice(0, 16), 256, 76);
  if (sub) { g.fillStyle = color || "#cccccc"; g.font = "48px Inter, system-ui, sans-serif"; g.fillText(String(sub).slice(0, 20), 256, 132); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(9, 2.8, 1);
  s.renderOrder = 10;
  s.raycast = () => {}; // a name tag never takes the tap
  return s;
}


// A hung light's pipe: from its mount to the nearest point on the truss's
// beams (job 403). Hidden when the mount already sits on the truss.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function updatePipes(pipes, world) {
  world.updateMatrixWorld(true);
  pipes.forEach(({ pipe, lg, tg, type, L, Dd }) => {
    _a.set(0, 0.45, 0); lg.localToWorld(_a);
    const p = tg.worldToLocal(_a.clone());
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    let q;
    if (type === "truss_circle") {
      const r = Math.hypot(p.x, p.z) || 1;
      q = new THREE.Vector3((p.x / r) * L / 2, 0, (p.z / r) * L / 2);
    } else if (type === "truss_box") {
      const c = [
        new THREE.Vector3(cl(p.x, L / 2), 0, Dd / 2), new THREE.Vector3(cl(p.x, L / 2), 0, -Dd / 2),
        new THREE.Vector3(L / 2, 0, cl(p.z, Dd / 2)), new THREE.Vector3(-L / 2, 0, cl(p.z, Dd / 2)),
      ];
      q = c.reduce((m, v) => (v.distanceTo(p) < m.distanceTo(p) ? v : m));
    } else q = new THREE.Vector3(cl(p.x, L / 2), 0, 0);
    tg.localToWorld(q);
    world.worldToLocal(_b.copy(_a));
    world.worldToLocal(q);
    const len = _b.distanceTo(q);
    pipe.visible = len > 0.7 && len < 4; // a light moved off its truss gets no pipe
    if (!pipe.visible) return;
    pipe.position.copy(_b).add(q).multiplyScalar(0.5);
    pipe.scale.set(1, len, 1);
    pipe.quaternion.setFromUnitVectors(_up, q.clone().sub(_b).normalize());
  });
}

export default function Stage3D({
  rig, members = [], look = null, dark = false, mode = "view", selected = null, moving = null,
  onTapItem, onDragStart, onMoveItems, onTapDeck, onMoveMember, pickedMember = null, className = "", labels = true,
  onSnapshot = null, // job 396: a picture of the stage, once it's drawn (thumbnails)
  lift = 0, // job 405: px to move the picture up (an edit box covers the bottom)
}) {
  const selIds = [].concat(selected || []);
  const movingIds = [].concat(moving || []);
  const selKey = selIds.join(",");
  const movKey = movingIds.join(",");
  const host = useRef(null);
  const S = useRef(null); // the scene's state between renders
  const cb = useRef({});
  cb.current = { onTapItem, onDragStart, onMoveItems, onTapDeck, onMoveMember, mode, selIds, rig, onSnapshot };

  // --- The renderer, camera and controls: once. ---
  useEffect(() => {
    const el = host.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#040404");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 800);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.display = "block";
    scene.add(new THREE.AmbientLight("#ffffff", 0.32));
    const sun = new THREE.DirectionalLight("#ffffff", 0.45);
    sun.position.set(10, 50, 40);
    scene.add(sun);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 8;
    controls.maxDistance = 300;
    const world = new THREE.Group(); // deck + rig + members, rebuilt on change
    scene.add(world);
    // Guide lines while a truss snaps into line (job 399).
    const guideMat = new THREE.LineDashedMaterial({ color: "#FFB400", dashSize: 0.6, gapSize: 0.4, depthTest: false });
    const unitLine = (axis) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(axis === "x" ? [new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0.5, 0, 0)] : [new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0, 0, 0.5)]), guideMat); l.computeLineDistances(); l.visible = false; l.renderOrder = 20; scene.add(l); return l; };
    const guideAcross = unitLine("x"); // a line across the stage (snapped y)
    const guideDown = unitLine("z");   // a line front to back (snapped x)
    S.current = { scene, camera, renderer, controls, world, fixtures: [], items: {}, memberObjs: [], deckTop: null, W: 32, D: 24, framed: false };

    // Tests (dev only): where an item is on screen.
    if (import.meta.env.DEV) window.__stage3dAt = (id) => {
      const o = S.current?.items[id]; if (!o) return null;
      const v = new THREE.Vector3(); o.getWorldPosition(v); v.project(camera);
      const r = renderer.domElement.getBoundingClientRect();
      return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
    };
    // Tests (dev only): each light's level and color right now, and the look.
    if (import.meta.env.DEV) window.__stage3dLevels = () => ({
      look: S.current?.look ? { ...S.current.look } : null,
      t: S.current?.clock?.elapsedTime, n: (S.current?.fixtures || []).length,
      lights: (S.current?.fixtures || []).map((f) => ({ id: f.id, on: +((f.body.material.emissiveIntensity - 0.15) / 0.85).toFixed(2), col: "#" + f.mat.color.getHexString() })),
    });
    const size = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      if (S.current?.lift) camera.setViewOffset(w, h, 0, S.current.lift, w, h);
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    // --- Picking and dragging. ---
    // A press on an item grabs it (the view stops turning); once the pointer
    // moves it drags, on the plane at the item's own height so it stays under
    // the finger, and a picked group moves with it. Nothing is rebuilt while
    // dragging; the move is handed back on release.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DECK);
    const hit = new THREE.Vector3();
    const toNdc = (e) => {
      const b = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    // Where the pointer meets the level at height y, as stage fractions (unclamped).
    const levelXY = (y) => {
      plane.constant = -y;
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const { W, D } = S.current;
      return [hit.x / W + 0.5, hit.z / D + 0.5];
    };
    const deckXY = () => { const p = levelXY(DECK); return p && [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))]; };
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    let press = null; // { kind, id | i, x, y, h, grab, started, ids, start }
    let down = null;
    const onDown = (e) => {
      const m = cb.current.mode;
      down = { x: e.clientX, y: e.clientY };
      if (m === "view") return;
      toNdc(e);
      const st = S.current;
      if (m === "build") {
        const h = ray.intersectObjects(Object.values(st.items), true)[0];
        let o = h?.object; while (o && !o.userData.itemId) o = o.parent;
        if (o) {
          const id = o.userData.itemId;
          const it = (cb.current.rig?.items || []).find((x) => x.id === id);
          const lvl = DECK + (it?.h || 0);
          // Dragging by how far the pointer moves on screen, scaled to how
          // far away the item is (job 398): a high truss seen nearly edge-on
          // used to jump about on a plane at its height. Left / right moves
          // it across, up / down moves it upstage / downstage.
          const P = new THREE.Vector3(); o.getWorldPosition(P);
          const toP = P.clone().sub(camera.position);
          const dist = toP.length();
          const elev = Math.max(0.3, -toP.normalize().y); // looking down at it: 1; edge-on: 0.3
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
          const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.setY(0).normalize();
          const unit = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / (renderer.domElement.clientHeight || 400);
          press = { kind: "item", id, sx: e.clientX, sy: e.clientY, unit, elev, right, fwd, grab: [0, 0], started: false };
        }
      } else if (m === "pick") {
        // Picking lights for a cue (job 393): taps only, nothing moves.
        const h = ray.intersectObjects(Object.values(st.items), true)[0];
        let o = h?.object; while (o && !o.userData.itemId) o = o.parent;
        if (o) press = { kind: "pick", id: o.userData.itemId };
      } else if (m === "place") {
        const h = ray.intersectObjects(st.memberObjs, true)[0];
        let o = h?.object; while (o && o.userData.memberIndex === undefined) o = o.parent;
        if (o) press = { kind: "member", i: o.userData.memberIndex, h: DECK, grab: levelXY(DECK), started: false, obj: o };
      }
      if (press) {
        controls.enabled = false;
        e.stopImmediatePropagation(); // the view doesn't turn under a grab
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch {}
      }
    };
    const onMove = (e) => {
      if (!press || !press.grab || press.kind === "pick") return;
      if (!press.started) {
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) return;
        press.started = true;
        if (press.kind === "item") {
          const sel = cb.current.selIds;
          const base = sel.includes(press.id) ? sel : [press.id];
          // Lights hung on a truss go with it (job 388).
          const all = cb.current.rig?.items || [];
          // Lights hung on a truss go with it (job 388); people standing on a
          // riser ride along with it (job 393).
          const { W, D, riserUnder } = S.current;
          const riders = all.filter((it) => (it.type === "person" || it.type === "instrument") && !base.includes(it.id) && base.includes(riserUnder?.((it.x - 0.5) * W, (it.y - 0.5) * D)));
          press.ids = [...base, ...all.filter((it) => it.on && base.includes(it.on) && !base.includes(it.id)).map((it) => it.id), ...riders.map((it) => it.id)];
          press.lift = !all.some((it) => it.type === "riser" && press.ids.includes(it.id)); // people step up onto risers as they go
          press.start = {};
          (cb.current.rig?.items || []).forEach((it) => { if (press.ids.includes(it.id)) press.start[it.id] = [it.x, it.y]; });
          cb.current.onDragStart?.(press.id);
        }
      }
      const { W, D, items } = S.current;
      if (press.kind === "item") {
        const mx = e.clientX - press.sx, my = e.clientY - press.sy;
        const wx = press.right.x * mx * press.unit - press.fwd.x * my * press.unit / press.elev;
        const wz = press.right.z * mx * press.unit - press.fwd.z * my * press.unit / press.elev;
        let dx = wx / W, dy = wz / D;
        // Line a truss / screen up as it goes (job 399).
        const lead = (cb.current.rig?.items || []).find((it) => it.id === press.id);
        if (lead && spinsFully(lead.type) && press.start?.[lead.id]) {
          const [sx0, sy0] = press.start[lead.id];
          const sn = snapPlace(clamp01(sx0 + dx), clamp01(sy0 + dy), cb.current.rig, press.ids);
          dx = sn.x - sx0; dy = sn.y - sy0;
          const lvl = DECK + 0.08;
          guideDown.visible = sn.gx !== null; guideAcross.visible = sn.gy !== null;
          if (sn.gx !== null) { guideDown.position.set((sn.gx - 0.5) * W, lvl, 0); guideDown.scale.set(1, 1, D * 1.1); }
          if (sn.gy !== null) { guideAcross.position.set(0, lvl, (sn.gy - 0.5) * D); guideAcross.scale.set(W * 1.1, 1, 1); }
        }
        // All of them move by the same amount, stopped at the stage's edge by
        // the ones standing on it; lights hung on a truss go with it, even a
        // little past the edge (job 405).
        const onIt = new Set((cb.current.rig?.items || []).filter((it) => it.on).map((it) => it.id));
        press.ids.forEach((id) => {
          const s = press.start[id];
          if (!s || onIt.has(id)) return;
          dx = Math.min(1 - s[0], Math.max(-s[0], dx)); dy = Math.min(1 - s[1], Math.max(-s[1], dy));
        });
        press.at = press.ids.map((id) => {
          const [sx, sy] = press.start[id] || [0.5, 0.5];
          const x = onIt.has(id) ? Math.min(1.5, Math.max(-0.5, sx + dx)) : clamp01(sx + dx), y = onIt.has(id) ? Math.min(1.5, Math.max(-0.5, sy + dy)) : clamp01(sy + dy);
          const o = items[id]; // looked up each time: the scene may have been rebuilt
          if (o) {
            o.position.x = (x - 0.5) * W; o.position.z = (y - 0.5) * D;
            if (press.lift && o.userData.person) o.position.y = DECK + (S.current.riserTop?.(o.position.x, o.position.z) || 0);
          }
          return { id, x, y };
        });
        // Kept for a rebuild mid-drag (picking it re-draws the scene).
        S.current.dragAt = Object.fromEntries(press.at.map((a) => [a.id, [a.x, a.y]]));
        S.current.dragLift = press.lift;
      } else {
        toNdc(e);
        const p = levelXY(DECK);
        if (!p) return;
        const x = clamp01(p[0]), y = clamp01(p[1]);
        const o = S.current.memberObjs.find((g) => g.userData.memberIndex === press.i) || press.obj;
        o.position.x = (x - 0.5) * W; o.position.z = (y - 0.5) * D;
        o.position.y = DECK + (S.current.riserTop?.(o.position.x, o.position.z) || 0);
        press.at = [x, y];
      }
    };
    const onUp = (e) => {
      const was = press;
      press = null;
      S.current.dragAt = null;
      guideDown.visible = false; guideAcross.visible = false;
      controls.enabled = true;
      const tap = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6;
      down = null;
      if (was?.started && was.at) {
        if (was.kind === "item") cb.current.onMoveItems?.(was.at);
        else cb.current.onMoveMember?.(was.i, was.at[0], was.at[1]);
        return;
      }
      if (was?.kind === "item" || (was?.kind === "pick" && tap)) {
        // With where on the stage it was tapped, so tapping a riser can put
        // someone there (job 393).
        toNdc(e);
        const p = deckXY();
        cb.current.onTapItem?.(was.id, p?.[0], p?.[1]);
        return;
      }
      if (was) return;
      // A tap (not an orbit) on the stage.
      if (tap && cb.current.mode !== "view") {
        toNdc(e);
        const p = deckXY();
        if (p) cb.current.onTapDeck?.(p[0], p[1]);
        else if (cb.current.mode === "build") cb.current.onTapDeck?.(null, null);
      }
    };
    const cv = renderer.domElement;
    cv.addEventListener("pointerdown", onDown, true);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", () => { press = null; S.current.dragAt = null; controls.enabled = true; });

    // --- Every frame: the look. ---
    let raf = 0;
    let frames = 0;
    let snapped = false;
    const clock = new THREE.Clock();
    S.current.clock = clock;
    const tmp = new THREE.Color();
    const tick = () => {
      const t0 = clock.getElapsedTime();
      const st = S.current;
      if (st.pipes?.length) updatePipes(st.pipes, world);
      // Ease the picture up / down to the lift (job 405).
      const want = st.liftTo || 0;
      if (Math.abs((st.lift || 0) - want) > 0.5 || (st.lift && !want)) {
        st.lift = Math.abs((st.lift || 0) - want) > 0.5 ? (st.lift || 0) + (want - (st.lift || 0)) * 0.2 : want;
        const w = el.clientWidth || 300, h = el.clientHeight || 300;
        if (st.lift) camera.setViewOffset(w, h, 0, st.lift, w, h); else camera.clearViewOffset();
      }
      const L = st.look;
      // Speed (job 399): the cue's chase, strobe, color fade and motion all
      // run faster or slower.
      const t = t0 * (L?.speed || 1);
      const beat = 60 / Math.max(40, Math.min(220, L?.bpm || 120));
      // A cue on some of the lights (job 393): the rest stay dark, and the
      // chase / color fade run across just those. It fades in over fadeIn s.
      const only = L?.only && L.only.length ? L.only : null;
      const act = only ? st.fixtures.filter((f) => only.includes(f.id)) : st.fixtures;
      const n = act.length || 1;
      const rise = L?.fadeIn ? Math.min(1, Math.max(0, (t0 - (st.lookStart || 0)) / L.fadeIn)) : 1;
      st.fixtures.forEach((f, k0) => {
        const k = only ? act.indexOf(f) : k0;
        let on = 0.85; // level 0..1
        let col = f.base;
        if (L) {
          if (L.color) col = L.color;
          if (L.fade) { tmp.setHSL(((t / 8) + k / n) % 1, 0.9, 0.55); col = "#" + tmp.getHexString(); }
          const wash = L.wash || (!L.spot && !L.back && !L.chase && !L.strobe && !L.blinder);
          on = wash ? 0.9 : 0.12;
          if (L.back) on = f.y < 0.45 ? 1 : 0.06;
          if (L.spot && (f.type === "spot" || f.type === "beam")) on = 1;
          if (L.chase) { const step = Math.floor(t / beat) % n; on = k === step || k === (step + Math.floor(n / 2)) % n ? 1 : 0.1; }
          if (L.strobe && (f.type === "strobe" || L.strobe === "all" || !st.hasStrobe)) on = (Math.floor(t * 12) % 2) ? 1 : 0;
          if (f.type === "blinder") on = L.blinder ? (Math.floor(t / beat) % 2 ? 1 : 0.15) : 0;
          if (L.blackout) on = 0;
        }
        if (f.type === "strobe" && !(L?.strobe)) { on = 0; }
        if (L) { if (only && k < 0) on = 0; on *= rise; }
        if (f.off || (!L && st.dark)) on = 0; // switched off (job 392)
        f.mat.color.set(col);
        f.mat.opacity = (L?.haze ? 0.22 : 0.12) * on;
        f.pool.material.color.set(col);
        f.pool.material.opacity = 0.22 * on;
        f.body.material.emissive.set(col);
        f.body.material.emissiveIntensity = 0.15 + 0.85 * on;
        // Spots / beams find the singers when "Spot on vocals" is up.
        if (L?.spot && (f.type === "spot" || f.type === "beam") && st.singers.length && !f.up) {
          const s = st.singers[Math.max(0, k) % st.singers.length];
          f.head.lookAt(s.x, DECK + 3, s.z);
        } else if (L?.motion && L.motion !== "" && (f.type === "spot" || f.type === "beam" || f.type === "wash") && !(only && k < 0)) {
          // Motion (job 399): pan / tilt off where it's aimed.
          const w = Math.PI * 0.5 * t; // a cycle every 4 s at x1
          const kk = Math.max(0, k);
          let pan = 0, tl = 0;
          if (L.motion === "sweep") pan = 0.6 * Math.sin(w + kk * 0.4);
          else if (L.motion === "nod") tl = 0.5 * Math.sin(w + kk * 0.4);
          else if (L.motion === "circle") { pan = 0.35 * Math.cos(w + kk * 0.6); tl = 0.35 * Math.sin(w + kk * 0.6); }
          else if (L.motion === "figure8") { pan = 0.45 * Math.sin(w); tl = 0.28 * Math.sin(2 * w); }
          else if (L.motion === "fan") pan = ((kk - (n - 1) / 2) / Math.max(1, n)) * 1.4 * (0.5 + 0.5 * Math.sin(w));
          else if (L.motion === "ballyhoo") { pan = 0.6 * Math.sin(w * 1.3 + kk * 1.7); tl = 0.4 * Math.sin(w * 0.9 + kk * 2.3); }
          // Swing it side to side (about the light's front-back line) and
          // front to back (about its side-to-side line).
          f.mv.copy(f.dir).applyAxisAngle(f.fwdAxis, pan).applyAxisAngle(f.rightAxis, tl);
          f.head.getWorldPosition(f.wp);
          f.head.lookAt(f.wp.x + f.mv.x * 20, f.wp.y + f.mv.y * 20, f.wp.z + f.mv.z * 20 + 0.0001);
          f.pool.material.opacity = 0; // the pool stays under it; hide it while it moves
        } else {
          // Where it's tilted to (straight down / up at 0).
          f.head.getWorldPosition(f.wp);
          f.head.lookAt(f.wp.x + f.dir.x * 20, f.wp.y + f.dir.y * 20, f.wp.z + f.dir.z * 20 + 0.0001);
        }
      });
      // LED screens: the look's color while a cue plays, else the rig blue.
      (st.screens || []).forEach((sc, k) => {
        const L2 = st.look;
        let col = "#1d4ed8", lvl = 0.9;
        if (L2) {
          col = L2.color || col;
          if (L2.fade) { tmp.setHSL(((t / 8) + k * 0.2) % 1, 0.9, 0.5); col = "#" + tmp.getHexString(); }
          if (L2.chase) lvl = 0.4 + 0.6 * (Math.floor(t / (60 / Math.max(40, L2.bpm || 120))) % 2);
          if (L2.strobe) lvl = Math.floor(t * 12) % 2 ? 1 : 0.1;
          if (L2.blackout) lvl = 0;
        } else if (st.dark) lvl = 0.05;
        sc.mat.emissive.set(col);
        sc.mat.emissiveIntensity = sc.off ? 0.02 : lvl;
      });
      if (st.hazeMesh) st.hazeMesh.material.opacity = L?.haze ? 0.08 + 0.02 * Math.sin(t) : 0;
      controls.update();
      renderer.render(scene, camera);
      // A thumbnail: read straight after drawing a settled frame.
      if (cb.current.onSnapshot && !snapped && ++frames > 6) {
        snapped = true;
        try { cb.current.onSnapshot(renderer.domElement.toDataURL("image/jpeg", 0.8)); } catch { cb.current.onSnapshot(null); }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      cv.removeEventListener("pointerdown", onDown, true);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
      renderer.dispose();
      cv.remove();
    };
  }, []);

  // --- The deck, rig and members: rebuilt when they change. ---
  useEffect(() => {
    const st = S.current;
    if (!st || !rig) return;
    const { world } = st;
    world.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
    world.clear();
    const W = rig.width_ft || 32, D = rig.depth_ft || 24;
    st.W = W; st.D = D;
    const pos = (x, y) => [(x - 0.5) * W, (y - 0.5) * D];

    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, DECK, D), new THREE.MeshStandardMaterial({ color: "#141414", roughness: 0.95 }));
    deck.position.y = DECK / 2;
    world.add(deck);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, 0.5), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    edge.position.set(0, DECK + 0.08, D / 2 - 0.25);
    world.add(edge);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 5, D * 6), new THREE.MeshStandardMaterial({ color: "#090909" }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = D * 1.2;
    world.add(floor);
    const grid = new THREE.GridHelper(1, 1, "#262626", "#1a1a1a");
    grid.scale.set(W, 1, D);
    grid.position.y = DECK + 0.02;
    world.add(grid);
    const g2 = new THREE.GridHelper(Math.max(W, D), Math.round(Math.max(W, D) / 4), "#202020", "#181818");
    g2.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D));
    g2.position.y = DECK + 0.015;
    world.add(g2);
    // Haze: a faint box over the stage, shown by the look.
    const haze = new THREE.Mesh(new THREE.BoxGeometry(W, 26, D), new THREE.MeshBasicMaterial({ color: "#9ca3af", transparent: true, opacity: 0, depthWrite: false }));
    haze.position.y = DECK + 13;
    world.add(haze);
    st.hazeMesh = haze;

    const mats = {};
    const trussMat = (c) => (mats[c] ||= new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.4, wireframe: true }));
    const stateColor = (id) => (movingIds.includes(id) ? GREY : selIds.includes(id) ? PICKED : PLACED);
    st.items = {};
    st.fixtures = [];
    st.screens = [];
    const rigSingers = [];
    // Risers (job 392): people standing on one stand on top of it.
    const risers = (rig.items || []).filter((i) => i.type === "riser").map((r) => {
      const [rx, rz] = pos(r.x, r.y);
      return { id: r.id, rx, rz, a: -((r.rot || 0) * Math.PI) / 180, w: r.rw || 8, d: r.rd || 8, h: r.rh || 1 };
    });
    const onRiser = (r, wx, wz) => {
      const dx = wx - r.rx, dz = wz - r.rz;
      const lx = Math.cos(r.a) * dx - Math.sin(r.a) * dz, lz = Math.sin(r.a) * dx + Math.cos(r.a) * dz;
      return Math.abs(lx) <= r.w / 2 && Math.abs(lz) <= r.d / 2;
    };
    const riserTop = (wx, wz) => risers.reduce((top, r) => (onRiser(r, wx, wz) ? Math.max(top, r.h) : top), 0);
    st.riserTop = riserTop;
    st.riserUnder = (wx, wz) => risers.filter((r) => onRiser(r, wx, wz)).sort((a, b) => b.h - a.h)[0]?.id || null;
    (rig.items || []).forEach((it) => {
      const [x, z] = pos(it.x, it.y);
      const g = new THREE.Group();
      g.userData.itemId = it.id;
      g.position.set(x, DECK + (it.h || 0), z);
      g.rotation.y = -((it.rot || 0) * Math.PI) / 180;
      if (it.type === "screen") {
        // An LED screen (job 398): a frame and a face that glows - the rig's
        // blue, or the look's color when a cue plays. Turns, tilts and rolls
        // all the way round.
        g.rotation.order = "YXZ";
        g.rotation.x = ((it.tilt || 0) * Math.PI) / 180;
        g.rotation.z = ((it.roll || 0) * Math.PI) / 180;
        const w = it.sw || 16, hh = it.sh || 9;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, hh + 0.4, 0.4), new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.7 }));
        const faceMat = new THREE.MeshStandardMaterial({ color: "#050505", emissive: new THREE.Color("#1d4ed8"), emissiveIntensity: 0.9 });
        const face = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), faceMat);
        face.position.z = 0.21;
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(frame.geometry), new THREE.LineBasicMaterial({ color: stateColor(it.id) }));
        g.add(frame, face, edge);
        st.screens.push({ mat: faceMat, off: !!it.off });
        world.add(g);
        st.items[it.id] = g;
        return;
      }
      if (it.type === "riser") {
        const w = it.rw || 8, d = it.rd || 8, h = it.rh || 1;
        const top = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: "#1f1f1f", roughness: 0.9 }));
        top.position.y = h / 2;
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(top.geometry), new THREE.LineBasicMaterial({ color: stateColor(it.id) }));
        edge.position.y = h / 2;
        g.add(top, edge);
        world.add(g);
        st.items[it.id] = g;
        return;
      }
      if (it.type === "instrument") {
        // An instrument with no one at it (job 394): on the deck or a riser.
        g.position.y += riserTop(x, z);
        g.userData.person = true; // steps up onto risers like people do
        const c = it.color || "#cccccc";
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, selIds.includes(it.id) ? 0.12 : 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: movingIds.includes(it.id) ? "#FFB400" : stateColor(it.id) }));
        ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.06, 0.6);
        g.add(instrumentProp(it.part, c, false, { alone: true }), ring);
        world.add(g);
        st.items[it.id] = g;
        return;
      }
      if (it.type === "person") {
        g.position.y += riserTop(x, z);
        g.userData.person = true;
        // Someone the LD put on the stage (job 389): a figure in their
        // instrument's color, the ring under them green once placed.
        // Job 390: life size, with what they play; their name over their
        // head only while they're picked.
        const c = it.color || "#E5E7EB";
        const fig = personFigure(c, { seated: isSeated(it.part) });
        fig.position.z = personOffset(it.part);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, selIds.includes(it.id) ? 0.12 : 0.07, 6, 32), new THREE.MeshBasicMaterial({ color: movingIds.includes(it.id) ? "#FFB400" : stateColor(it.id) }));
        ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.06, fig.position.z);
        g.add(fig, instrumentProp(it.part, c), ring);
        if (labels && it.label && selIds.includes(it.id)) { const sp = labelSprite(it.label, "", c); sp.scale.set(6, 1.9, 1); sp.position.set(0, PERSON_TOP + 1.6, fig.position.z); g.add(sp); }
        if (/vocal/i.test(it.part || "")) rigSingers.push({ x, z });
        world.add(g);
        st.items[it.id] = g;
        return;
      }
      if (isTruss(it.type)) {
        // Any angle (job 392): turn (y), tilt forward / back (x), roll side
        // to side (z), each all the way round.
        g.rotation.order = "YXZ";
        g.rotation.x = ((it.tilt || 0) * Math.PI) / 180;
        g.rotation.z = ((it.roll || 0) * Math.PI) / 180;
        const tm = trussMat(stateColor(it.id));
        const beam = (len) => new THREE.Mesh(new THREE.BoxGeometry(len, 1, 1), tm);
        const L = it.len * W;
        if (it.type === "truss_straight") g.add(beam(L));
        else if (it.type === "truss_box") {
          const Dd = it.len * 0.8 * D;
          const a = beam(L); a.position.z = -Dd / 2; g.add(a);
          const b = beam(L); b.position.z = Dd / 2; g.add(b);
          const c = beam(Dd); c.rotation.y = Math.PI / 2; c.position.x = -L / 2; g.add(c);
          const d = beam(Dd); d.rotation.y = Math.PI / 2; d.position.x = L / 2; g.add(d);
        } else {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(L / 2, 0.5, 6, 48), tm);
          ring.rotation.x = Math.PI / 2;
          g.add(ring);
        }
        if (selIds.includes(it.id)) {
          // The outline is measured with the truss at the origin: measured in
          // place it got the truss's position twice and floated as a second
          // copy above it (job 390).
          const p0 = g.position.clone(), r0 = g.rotation.clone();
          g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.updateMatrixWorld(true);
          const outline = new THREE.BoxHelper(g, movingIds.includes(it.id) ? "#FFB400" : PICKED);
          g.position.copy(p0); g.rotation.copy(r0);
          g.add(outline);
        }
      } else {
        const color = it.color || "#ffffff";
        const head = new THREE.Group(); // turns to aim
        const body = new THREE.Mesh(
          it.type === "led_bar" ? new THREE.BoxGeometry(Math.max(1.5, it.len * W), 0.3, 0.3) : new THREE.CylinderGeometry(0.3, 0.38, 0.62, 14), // about half the old size (job 401)
          new THREE.MeshStandardMaterial({ color: "#1b1b1b", emissive: new THREE.Color(color), emissiveIntensity: 0.6 })
        );
        // The light itself tips with its tilt and aim, not just its beam
        // (job 397): it sits in the aim group, lens toward the beam.
        body.rotation.x = -Math.PI / 2;
        // Tilt (job 387): the beam leans toward the front (local +z) and
        // lands further out, so it's longer.
        const tilt = ((it.tilt || 0) * Math.PI) / 180;
        const reach = Math.cos(Math.min(1.3, Math.abs(tilt)));
        const len = Math.max(2, ((it.h || 0) + 0.5) / reach);
        const r = it.type === "beam" ? 0.5 : it.type === "spot" ? 2.2 : it.type === "par" ? 2.6 : it.type === "strobe" || it.type === "blinder" ? 3.2 : 4;
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        // The cone points down its -Z, so lookAt aims it.
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 24, 1, true), mat);
        cone.rotation.x = -Math.PI / 2;
        cone.position.z = len / 2 + 0.3;
        // Beams and their pools can't be clicked: a tap goes through the
        // light to the riser / person / truss under it (job 400).
        cone.raycast = () => {};
        const aim = new THREE.Group();
        aim.add(body, cone);
        head.add(aim);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
        pool.rotation.x = -Math.PI / 2;
        pool.raycast = () => {};
        pool.position.y = -(it.h || 0) + 0.04;
        pool.position.z = (it.h || 0) * Math.tan(Math.max(-1.3, Math.min(1.3, tilt)));
        if (Math.abs(it.tilt || 0) > 70) pool.visible = false;
        // The mount: green once placed, grey while in hand.
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), new THREE.MeshBasicMaterial({ color: stateColor(it.id) }));
        mount.position.y = (it.h || 0) > 0 ? 0.45 : -0.38;
        g.add(mount);
        g.add(head);
        if ((it.h || 0) > 0 && it.type !== "fog") g.add(pool);
        if (it.type === "fog") { cone.visible = false; pool.visible = false; }
        const up = (it.h || 0) === 0 && it.type !== "fog"; // floor lights point up
        if (up) pool.visible = false;
        if (selIds.includes(it.id)) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 6, 24), new THREE.MeshBasicMaterial({ color: movingIds.includes(it.id) ? "#FFB400" : PICKED }));
          ring.rotation.x = Math.PI / 2;
          g.add(ring);
        }
        // Aim: straight down (floor lights: up) unless a look turns it (tick).
        const dir = new THREE.Vector3(0, up ? Math.cos(tilt) : -Math.cos(tilt), Math.sin(tilt)).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y);
        st.fixtures.push({ mv: new THREE.Vector3(), rightAxis: new THREE.Vector3(Math.cos(g.rotation.y), 0, -Math.sin(g.rotation.y)), fwdAxis: new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y)), id: it.id, type: it.type, base: color, y: it.y, mat, pool, body, head: aim, up, dir, off: !!it.off, wp: new THREE.Vector3() });
      }
      world.add(g);
      st.items[it.id] = g;
    });
    st.hasStrobe = (rig.items || []).some((i) => i.type === "strobe");
    // Pipes (job 403): each hung light gets a clamp pipe up to the nearest
    // point on its truss, so it reads as attached at any truss angle. Kept up
    // to date every frame (tick), so they follow a drag.
    st.pipes = [];
    (rig.items || []).forEach((it) => {
      const lg = st.items[it.id], tr = it.on && (rig.items || []).find((t) => t.id === it.on);
      if (!lg || !tr || !st.items[tr.id] || (it.h || 0) <= 0) return;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 8), new THREE.MeshBasicMaterial({ color: "#9a9a9a" }));
      pipe.raycast = () => {};
      pipe.visible = false;
      world.add(pipe);
      st.pipes.push({ pipe, lg, tg: st.items[tr.id], type: tr.type, L: tr.len * W, Dd: tr.len * 0.8 * D });
    });
    // Rebuilt in the middle of a drag (the pick re-draws it): put what's being
    // dragged back where the finger has it, so nothing flicks back (job 398).
    if (st.dragAt) Object.entries(st.dragAt).forEach(([id, [x, y]]) => {
      const o = st.items[id];
      if (!o) return;
      o.position.x = (x - 0.5) * W; o.position.z = (y - 0.5) * D;
      if (st.dragLift && o.userData.person) o.position.y = DECK + riserTop(o.position.x, o.position.z);
    });

    // Members: a figure in their color with their name.
    st.memberObjs = [];
    st.singers = [];
    members.forEach((m, i) => {
      if (m.x === undefined || m.x === null) return;
      const [x, z] = pos(m.x, m.y);
      const grp = new THREE.Group();
      grp.userData.memberIndex = i;
      grp.position.set(x, DECK + riserTop(x, z), z);
      // The act's members: life size with their instruments too (job 390).
      const fig = personFigure(m.color || "#ffffff", { emissive: pickedMember === i ? 0.6 : 0.12, seated: isSeated(m.part) });
      fig.position.z = personOffset(m.part);
      grp.add(fig, instrumentProp(m.part, m.color, m.sings && m.part !== "vocals"));
      if (pickedMember === i) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.1, 6, 32), new THREE.MeshBasicMaterial({ color: "#8CFF3D" }));
        ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.06, fig.position.z); grp.add(ring);
      }
      if (labels && m.name) { const sp = labelSprite(m.name, m.sub, m.color); sp.scale.set(7, 2.2, 1); sp.position.set(0, PERSON_TOP + 2, fig.position.z); grp.add(sp); }
      world.add(grp);
      st.memberObjs.push(grp);
      if (m.sings) st.singers.push({ x, z });
    });
    st.singers.push(...rigSingers);
    if (!st.singers.length) st.singers = st.memberObjs.slice(0, 2).map((o) => ({ x: o.position.x, z: o.position.z }));

    // Frame it once, from the house.
    if (!st.framed) {
      const topH = Math.max(12, ...(rig.items || []).map((i) => i.h || 0));
      // Closer on a wide view, further on a tall phone one.
      const far = st.camera.aspect < 1 ? 1.35 : 1.0;
      st.camera.position.set(0, DECK + topH * 0.9 + Math.max(W, D) * 0.25, D / 2 + Math.max(W, D) * far);
      st.controls.target.set(0, DECK + topH * 0.4, 0);
      st.controls.update();
      st.framed = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, members, selKey, movKey, pickedMember, labels]);

  useEffect(() => { if (S.current) { S.current.look = look; S.current.lookStart = S.current.clock?.getElapsedTime() || 0; } }, [look]);
  useEffect(() => { if (S.current) S.current.dark = dark; }, [dark]);
  useEffect(() => { if (S.current) S.current.liftTo = lift; }, [lift]);

  return <div ref={host} className={`relative w-full h-full ${className}`} />;
}
