import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { isTruss } from "@/lib/lightingRig";

// The rig in 3D (job 377): the stage deck to scale, trusses at their trim
// height, each light with a soft beam in its color, and the members (when
// there are any) standing where they are on the stage plot. Drag to orbit,
// pinch / scroll to zoom. Loaded only when opened.
//   rig: normalized rig; members: [{ x, y, color, name }]
export default function Rig3D({ rig, members = [], className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const W = rig.width_ft, D = rig.depth_ft;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050505");
    scene.fog = new THREE.Fog("#050505", 80, 220);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    // Stage x: left (-W/2) to right; z: back (-D/2) to front (+D/2).
    const pos = (x, y) => [(x - 0.5) * W, (y - 0.5) * D];
    scene.add(new THREE.AmbientLight("#ffffff", 0.35));
    const sun = new THREE.DirectionalLight("#ffffff", 0.5);
    sun.position.set(10, 40, 30);
    scene.add(sun);

    // Deck and the floor in front of it.
    const deckH = 3;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W, deckH, D), new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.9 }));
    deck.position.y = deckH / 2;
    scene.add(deck);
    const front = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    front.position.set(0, deckH + 0.1, D / 2 - 0.2);
    scene.add(front);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 4, D * 4), new THREE.MeshStandardMaterial({ color: "#0b0b0b" }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = D;
    scene.add(floor);
    const grid = new THREE.GridHelper(Math.max(W, D), Math.round(Math.max(W, D) / 4), "#2a2a2a", "#1c1c1c");
    grid.position.y = deckH + 0.01;
    grid.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D));
    scene.add(grid);

    const trussMat = new THREE.MeshStandardMaterial({ color: "#9aa0a8", metalness: 0.7, roughness: 0.35, wireframe: true });
    const beam = (len) => new THREE.Mesh(new THREE.BoxGeometry(len, 1, 1), trussMat);
    const top = (h) => deckH + h;
    const disposables = [];

    (rig.items || []).forEach((it) => {
      const [x, z] = pos(it.x, it.y);
      const rot = -((it.rot || 0) * Math.PI) / 180;
      const g = new THREE.Group();
      g.position.set(x, top(it.h), z);
      g.rotation.y = rot;
      if (isTruss(it.type)) {
        const L = it.len * W;
        if (it.type === "truss_straight") g.add(beam(L));
        else if (it.type === "truss_box") {
          const Dd = it.len * 0.8 * D; // as drawn: 0.6 x the width share of a 4:3 stage
          const a = beam(L); a.position.z = -Dd / 2; g.add(a);
          const b = beam(L); b.position.z = Dd / 2; g.add(b);
          const c = beam(Dd); c.rotation.y = Math.PI / 2; c.position.x = -L / 2; g.add(c);
          const d = beam(Dd); d.rotation.y = Math.PI / 2; d.position.x = L / 2; g.add(d);
        } else {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(L / 2, 0.5, 6, 48), trussMat);
          ring.rotation.x = Math.PI / 2;
          g.add(ring);
        }
        scene.add(g);
        return;
      }
      const color = new THREE.Color(it.color || "#ffffff");
      const body = new THREE.Mesh(
        it.type === "led_bar" ? new THREE.BoxGeometry(Math.max(1.5, it.len * W), 0.5, 0.5) : new THREE.CylinderGeometry(0.55, 0.7, 1.1, 14),
        new THREE.MeshStandardMaterial({ color: "#1b1b1b", emissive: color, emissiveIntensity: 0.6 })
      );
      g.add(body);
      if (it.type !== "fog" && it.h > 0) {
        // A soft cone down to the deck, wider for washes, tight for beams.
        const len = Math.max(2, it.h);
        const r = it.type === "beam" ? 0.5 : it.type === "spot" ? 2.2 : it.type === "par" ? 2.6 : it.type === "strobe" || it.type === "blinder" ? 3.2 : 4;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, len, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        cone.position.y = -len / 2;
        g.add(cone);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = -it.h + 0.02;
        g.add(pool);
      } else if (it.type === "fog") {
        g.position.y = deckH + 0.6;
      }
      scene.add(g);
    });

    // The members: a simple figure each, in their instrument's color.
    members.forEach((m) => {
      const [x, z] = pos(m.x, m.y);
      const mat = new THREE.MeshStandardMaterial({ color: m.color || "#ffffff", roughness: 0.6 });
      const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 4, 16), mat);
      bodyM.position.set(x, deckH + 2, z);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), mat);
      head.position.set(x, deckH + 4.8, z);
      scene.add(bodyM, head);
    });

    // From the house, a little above: the whole stage and the rig in view.
    const topH = Math.max(12, ...(rig.items || []).map((i) => i.h || 0));
    camera.position.set(0, deckH + topH * 0.9 + Math.max(W, D) * 0.25, D / 2 + Math.max(W, D) * 1.25);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, deckH + topH * 0.45, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 8;
    controls.maxDistance = 220;
    controls.update();

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
    let raf = 0;
    const tick = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick); };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose?.()); });
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [rig, members]);
  return <div ref={ref} className={`relative w-full h-full ${className}`} />;
}
