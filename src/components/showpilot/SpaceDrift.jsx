import React, { useEffect, useRef } from "react";

// A transparent canvas that sits over a still sky (GalaxyCanvas) and makes it
// feel like looking out into space: three depths of stars drifting past, the
// near ones bigger and faster (parallax), plus a shooting star every few
// seconds somewhere new, with a glowing head and a fading tail.
// ~30fps, pauses when the tab is hidden. Reduced motion: renders nothing.
export default function SpaceDrift() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const ctx = canvas.getContext("2d");

    // Drift direction: slowly up and to the left, like the sky wheeling overhead.
    const DIR = { x: -0.92, y: -0.38 };
    const LAYERS = [
      { count: 140, speed: 4, r: [0.3, 0.7], a: [0.25, 0.5] }, // far
      { count: 70, speed: 10, r: [0.6, 1.1], a: [0.4, 0.7] }, // mid
      { count: 24, speed: 22, r: [1.0, 1.7], a: [0.6, 0.95] }, // near
    ];
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);

    let w = 0, h = 0, dpr = 1, stars = [], meteors = [], raf = 0, last = 0, nextMeteor = 0;

    const seed = () => {
      stars = LAYERS.flatMap((L) =>
        Array.from({ length: Math.round(L.count * Math.max(0.5, (w * h) / (1440 * 900))) }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          r: rand(...L.r),
          a: rand(...L.a),
          speed: L.speed * rand(0.85, 1.15),
          tw: rand(0.6, 2.2),
          ph: Math.random() * Math.PI * 2,
        }))
      );
    };

    const spawnMeteor = (t) => {
      // Start somewhere in the upper two-thirds, streak down and to the left.
      const angle = rand(2.35, 2.75); // radians, pointing down-left
      const speed = rand(700, 1100); // px per second
      meteors.push({
        x: rand(w * 0.25, w * 1.05),
        y: rand(-h * 0.05, h * 0.55),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: rand(120, 260),
        born: t,
        life: rand(650, 1100),
      });
      nextMeteor = t + rand(4000, 9000);
    };

    const frame = (t, dt) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        s.x += DIR.x * s.speed * dt;
        s.y += DIR.y * s.speed * dt;
        if (s.x < -4) s.x += w + 8;
        if (s.y < -4) s.y += h + 8;
        const a = s.a * (0.7 + 0.3 * Math.sin(s.ph + (t / 1000) * s.tw));
        ctx.fillStyle = `rgba(255,252,245,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (t >= nextMeteor) spawnMeteor(t);
      meteors = meteors.filter((m) => t - m.born < m.life);
      for (const m of meteors) {
        const age = (t - m.born) / m.life; // 0..1
        const fade = age < 0.15 ? age / 0.15 : 1 - (age - 0.15) / 0.85;
        const hx = m.x + m.vx * ((t - m.born) / 1000);
        const hy = m.y + m.vy * ((t - m.born) / 1000);
        const sp = Math.hypot(m.vx, m.vy);
        const tx = hx - (m.vx / sp) * m.len;
        const ty = hy - (m.vy / sp) * m.len;
        const g = ctx.createLinearGradient(hx, hy, tx, ty);
        g.addColorStop(0, `rgba(255,255,255,${(0.95 * fade).toFixed(3)})`);
        g.addColorStop(0.3, `rgba(210,225,255,${(0.45 * fade).toFixed(3)})`);
        g.addColorStop(1, "rgba(210,225,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // Glowing head.
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6);
        hg.addColorStop(0, `rgba(255,255,255,${fade.toFixed(3)})`);
        hg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(hx, hy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      frame(t, dt);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      seed();
    };

    const onVis = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };

    resize();
    nextMeteor = performance.now() + 1500; // first one soon, so it's noticed
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden="true" />;
}
