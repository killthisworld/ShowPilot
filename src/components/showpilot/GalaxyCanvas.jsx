import React, { useEffect, useRef } from "react";
import { hashString, seededRandom } from "@/lib/constellation";

// Night sky behind the event sky page: a deep indigo gradient, a faint
// violet/teal nebula, a soft band of tiny stars (the "milky way") and a
// scatter of background stars that slowly twinkle. Seeded by the event so
// everyone sees the same sky. The static layers are painted once per resize;
// only the twinkle redraws, at ~30fps, and it pauses when the tab is hidden.
// Reduced motion: painted once, no twinkle.
export default function GalaxyCanvas({ seed }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const base = hashString(seed || "sky");
    const rnd = (i) => seededRandom(base + i * 7919);

    let w = 0, h = 0, dpr = 1, backdrop = null, stars = [], raf = 0, last = 0;

    const paintBackdrop = () => {
      backdrop = document.createElement("canvas");
      backdrop.width = w * dpr;
      backdrop.height = h * dpr;
      const b = backdrop.getContext("2d");
      b.scale(dpr, dpr);

      // Looking up: darkest at the top of the sky, a touch of dusk near the horizon.
      const g = b.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#03040c");
      g.addColorStop(0.6, "#070a1c");
      g.addColorStop(1, "#0e1330");
      b.fillStyle = g;
      b.fillRect(0, 0, w, h);

      // Nebula: a few big, very soft clouds.
      const clouds = [
        { x: 0.28, y: 0.32, r: 0.55, c: "59,42,110", a: 0.22 },
        { x: 0.74, y: 0.58, r: 0.5, c: "30,91,122", a: 0.16 },
        { x: 0.55, y: 0.18, r: 0.35, c: "120,60,140", a: 0.1 },
      ];
      clouds.forEach((cl, i) => {
        const x = (cl.x + (rnd(i) - 0.5) * 0.2) * w;
        const y = (cl.y + (rnd(i + 10) - 0.5) * 0.2) * h;
        const r = cl.r * Math.max(w, h);
        const rg = b.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(${cl.c},${cl.a})`);
        rg.addColorStop(1, `rgba(${cl.c},0)`);
        b.fillStyle = rg;
        b.fillRect(0, 0, w, h);
      });

      // Milky way: a diagonal band of tiny, faint stars.
      const angle = -0.5 + (rnd(20) - 0.5) * 0.4;
      const cx = w * 0.5, cy = h * 0.45;
      const len = Math.hypot(w, h);
      const count = Math.round((w * h) / 900);
      for (let i = 0; i < count; i++) {
        const along = (rnd(100 + i) - 0.5) * len;
        // Roughly gaussian spread across the band.
        const across = ((rnd(5000 + i) + rnd(9000 + i) + rnd(13000 + i)) / 3 - 0.5) * Math.min(w, h) * 0.55;
        const x = cx + along * Math.cos(angle) - across * Math.sin(angle);
        const y = cy + along * Math.sin(angle) + across * Math.cos(angle);
        if (x < 0 || y < 0 || x > w || y > h) continue;
        b.fillStyle = `rgba(220,225,255,${0.05 + rnd(17000 + i) * 0.22})`;
        b.fillRect(x, y, 1, 1);
      }

      // Twinkling stars.
      const n = Math.round(Math.min(260, (w * h) / 4500));
      stars = Array.from({ length: n }, (_, i) => ({
        x: rnd(30000 + i) * w,
        y: rnd(40000 + i) * h,
        r: 0.4 + Math.pow(rnd(50000 + i), 3) * 1.4,
        a: 0.25 + rnd(60000 + i) * 0.6,
        speed: 0.4 + rnd(70000 + i) * 1.6,
        phase: rnd(80000 + i) * Math.PI * 2,
        tint: rnd(90000 + i) > 0.85 ? "200,215,255" : "255,250,240",
      }));
    };

    const draw = (t) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(backdrop, 0, 0, w, h);
      for (const s of stars) {
        const tw = reduced ? 1 : 0.65 + 0.35 * Math.sin(s.phase + (t / 1000) * s.speed);
        ctx.fillStyle = `rgba(${s.tint},${(s.a * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      last = t;
      draw(t);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      paintBackdrop();
      draw(performance.now());
    };

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [seed]);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden="true" />;
}
