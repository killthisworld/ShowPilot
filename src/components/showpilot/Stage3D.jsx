import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { isTruss } from "@/lib/lightingRig";

// The LD's 3D stage (job 383): the deck to scale, trusses at their trim,
// every light with its beam, and the members standing where they are.
// One scene for everything the LD does with it:
//   mode "view"   orbit and zoom
//   mode "build"  tap a truss / light to pick it, drag it across the stage
//                 (onSelect(id | null), onMoveItem(id, x, y))
//   mode "place"  drag members, tap the deck to put the picked member there
//                 (onTapDeck(x, y), onMoveMember(i, x, y))
// `look` plays a lighting look (lib/cueLooks): color, wash, spots on the
// singers, chase / strobe to the BPM, fades, blinders, haze, blackout.
// Positions are the stage plot's: x 0..1 left to right, y 0..1 back to front.
//   members: [{ x, y, color, name, sub, sings }]

const DECK = 3; // deck height, ft
const TRUSS_COLOR = "#9aa0a8";

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
  return s;
}

export default function Stage3D({
  rig, members = [], look = null, mode = "view", selected = null,
  onSelect, onMoveItem, onTapDeck, onMoveMember, pickedMember = null, className = "", labels = true,
}) {
  const host = useRef(null);
  const S = useRef(null); // the scene's state between renders
  const cb = useRef({});
  cb.current = { onSelect, onMoveItem, onTapDeck, onMoveMember, mode };

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
    S.current = { scene, camera, renderer, controls, world, fixtures: [], items: {}, memberObjs: [], deckTop: null, W: 32, D: 24, framed: false };

    const size = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    // --- Picking and dragging. ---
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DECK);
    const hit = new THREE.Vector3();
    const toNdc = (e) => {
      const b = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    const deckXY = () => {
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const { W, D } = S.current;
      return [Math.min(1, Math.max(0, hit.x / W + 0.5)), Math.min(1, Math.max(0, hit.z / D + 0.5))];
    };
    let drag = null; // { kind: "item" | "member", id | i, obj, moved, sx, sy }
    let down = null;
    const onDown = (e) => {
      const m = cb.current.mode;
      down = { x: e.clientX, y: e.clientY };
      if (m === "view") return;
      toNdc(e);
      const st = S.current;
      if (m === "build") {
        const objs = Object.values(st.items);
        const h = ray.intersectObjects(objs, true)[0];
        if (h) {
          let o = h.object; while (o && !o.userData.itemId) o = o.parent;
          if (o) { drag = { kind: "item", id: o.userData.itemId, obj: o, moved: false }; controls.enabled = false; cb.current.onSelect?.(o.userData.itemId); }
        }
      } else if (m === "place") {
        const h = ray.intersectObjects(st.memberObjs, true)[0];
        if (h) {
          let o = h.object; while (o && o.userData.memberIndex === undefined) o = o.parent;
          if (o) { drag = { kind: "member", i: o.userData.memberIndex, obj: o, moved: false }; controls.enabled = false; }
        }
      }
      if (drag) { try { renderer.domElement.setPointerCapture(e.pointerId); } catch {} }
    };
    const onMove = (e) => {
      if (!drag) return;
      toNdc(e);
      const p = deckXY();
      if (!p) return;
      drag.moved = true;
      const { W, D } = S.current;
      drag.obj.position.x = (p[0] - 0.5) * W;
      drag.obj.position.z = (p[1] - 0.5) * D;
      drag.at = p;
    };
    const onUp = (e) => {
      const was = drag;
      drag = null;
      controls.enabled = true;
      if (was?.moved && was.at) {
        if (was.kind === "item") cb.current.onMoveItem?.(was.id, was.at[0], was.at[1]);
        else cb.current.onMoveMember?.(was.i, was.at[0], was.at[1]);
        return;
      }
      // A tap (not an orbit): on empty deck.
      if (!was && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
        const m = cb.current.mode;
        toNdc(e);
        if (m === "place") { const p = deckXY(); if (p) cb.current.onTapDeck?.(p[0], p[1]); }
        if (m === "build") cb.current.onSelect?.(null);
      }
      down = null;
    };
    const cv = renderer.domElement;
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", () => { drag = null; controls.enabled = true; });

    // --- Every frame: the look. ---
    let raf = 0;
    const clock = new THREE.Clock();
    const tmp = new THREE.Color();
    const tick = () => {
      const t = clock.getElapsedTime();
      const st = S.current;
      const L = st.look;
      const beat = 60 / Math.max(40, Math.min(220, L?.bpm || 120));
      const n = st.fixtures.length || 1;
      st.fixtures.forEach((f, k) => {
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
        f.mat.color.set(col);
        f.mat.opacity = (L?.haze ? 0.22 : 0.12) * on;
        f.pool.material.color.set(col);
        f.pool.material.opacity = 0.22 * on;
        f.body.material.emissive.set(col);
        f.body.material.emissiveIntensity = 0.15 + 0.85 * on;
        // Spots / beams find the singers when "Spot on vocals" is up.
        if (L?.spot && (f.type === "spot" || f.type === "beam") && st.singers.length && !f.up) {
          const s = st.singers[k % st.singers.length];
          f.head.lookAt(s.x, DECK + 3, s.z);
        } else {
          f.head.getWorldPosition(f.wp);
          f.head.lookAt(f.wp.x, f.up ? f.wp.y + 20 : 0, f.wp.z + 0.0001);
        }
      });
      if (st.hazeMesh) st.hazeMesh.material.opacity = L?.haze ? 0.08 + 0.02 * Math.sin(t) : 0;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      cv.removeEventListener("pointerdown", onDown);
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

    const trussMat = new THREE.MeshStandardMaterial({ color: TRUSS_COLOR, metalness: 0.7, roughness: 0.35, wireframe: true });
    const beam = (len) => new THREE.Mesh(new THREE.BoxGeometry(len, 1, 1), trussMat);
    st.items = {};
    st.fixtures = [];
    (rig.items || []).forEach((it) => {
      const [x, z] = pos(it.x, it.y);
      const g = new THREE.Group();
      g.userData.itemId = it.id;
      g.position.set(x, DECK + (it.h || 0), z);
      g.rotation.y = -((it.rot || 0) * Math.PI) / 180;
      if (isTruss(it.type)) {
        const L = it.len * W;
        if (it.type === "truss_straight") g.add(beam(L));
        else if (it.type === "truss_box") {
          const Dd = it.len * 0.8 * D;
          const a = beam(L); a.position.z = -Dd / 2; g.add(a);
          const b = beam(L); b.position.z = Dd / 2; g.add(b);
          const c = beam(Dd); c.rotation.y = Math.PI / 2; c.position.x = -L / 2; g.add(c);
          const d = beam(Dd); d.rotation.y = Math.PI / 2; d.position.x = L / 2; g.add(d);
        } else {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(L / 2, 0.5, 6, 48), trussMat);
          ring.rotation.x = Math.PI / 2;
          g.add(ring);
        }
        if (selected === it.id) g.add(new THREE.BoxHelper(g, "#8CFF3D"));
      } else {
        const color = it.color || "#ffffff";
        const head = new THREE.Group(); // turns to aim
        const body = new THREE.Mesh(
          it.type === "led_bar" ? new THREE.BoxGeometry(Math.max(1.5, it.len * W), 0.5, 0.5) : new THREE.CylinderGeometry(0.55, 0.7, 1.1, 14),
          new THREE.MeshStandardMaterial({ color: "#1b1b1b", emissive: new THREE.Color(color), emissiveIntensity: 0.6 })
        );
        head.add(body);
        const len = Math.max(2, (it.h || 0) + 0.5);
        const r = it.type === "beam" ? 0.5 : it.type === "spot" ? 2.2 : it.type === "par" ? 2.6 : it.type === "strobe" || it.type === "blinder" ? 3.2 : 4;
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        // The cone points down its -Z, so lookAt aims it.
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 24, 1, true), mat);
        cone.rotation.x = -Math.PI / 2;
        cone.position.z = len / 2;
        const aim = new THREE.Group();
        aim.add(cone);
        head.add(aim);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = -(it.h || 0) + 0.04;
        g.add(head);
        if ((it.h || 0) > 0 && it.type !== "fog") g.add(pool);
        if (it.type === "fog") { cone.visible = false; pool.visible = false; }
        const up = (it.h || 0) === 0 && it.type !== "fog"; // floor lights point up
        if (up) pool.visible = false;
        if (selected === it.id) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 6, 24), new THREE.MeshBasicMaterial({ color: "#8CFF3D" }));
          ring.rotation.x = Math.PI / 2;
          g.add(ring);
        }
        // Aim: straight down (floor lights: up) unless a look turns it (tick).
        st.fixtures.push({ type: it.type, base: color, y: it.y, mat, pool, body, head: aim, up, wp: new THREE.Vector3() });
      }
      world.add(g);
      st.items[it.id] = g;
    });
    st.hasStrobe = (rig.items || []).some((i) => i.type === "strobe");

    // Members: a figure in their color with their name.
    st.memberObjs = [];
    st.singers = [];
    members.forEach((m, i) => {
      if (m.x === undefined || m.x === null) return;
      const [x, z] = pos(m.x, m.y);
      const grp = new THREE.Group();
      grp.userData.memberIndex = i;
      grp.position.set(x, DECK, z);
      const mat = new THREE.MeshStandardMaterial({ color: m.color || "#ffffff", roughness: 0.6, emissive: new THREE.Color(m.color || "#ffffff"), emissiveIntensity: pickedMember === i ? 0.6 : 0.12 });
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 4, 16), mat); b.position.y = 2;
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), mat); h.position.y = 4.8;
      grp.add(b, h);
      if (pickedMember === i) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.12, 6, 32), new THREE.MeshBasicMaterial({ color: "#8CFF3D" }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; grp.add(ring);
      }
      if (labels && m.name) { const sp = labelSprite(m.name, m.sub, m.color); sp.position.y = 7.4; grp.add(sp); }
      world.add(grp);
      st.memberObjs.push(grp);
      if (m.sings) st.singers.push({ x, z });
    });
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
  }, [rig, members, selected, pickedMember, labels]);

  useEffect(() => { if (S.current) S.current.look = look; }, [look]);

  return <div ref={host} className={`relative w-full h-full ${className}`} />;
}
