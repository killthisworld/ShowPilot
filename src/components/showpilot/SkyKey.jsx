import React, { useEffect, useMemo, useRef } from "react";
import { hashString, seededRandom } from "@/lib/constellation";

// The fan's "digital key": three concentric rings of arcs, like an App Clip
// code. The arcs come from the fan's own sky key, so every fan's ring is a
// little different. Driven by `phase`:
//   verifying  rings spin (opposite directions) while the key is checked
//   unlocking  rings slow and settle, the event color sweeps around them,
//              the lock opens, then the whole key opens outward; onDone()
//   failed     rings slow to a stop and dim red
// With reduced motion there's no spinning; unlocking just calls onDone.

const SIZE = 280;
const C = SIZE / 2;
const RINGS = [
  { r: 74, slots: 22, speed: 46 },
  { r: 98, slots: 30, speed: -31 },
  { r: 122, slots: 38, speed: 21 },
];
const UNLOCK_MS = 2100;

const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const polar = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const arcPath = (r, a0, a1) => {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

// Turn the key into arcs: each ring has `slots`; a slot is on or off by the
// key's hash, and runs of "on" slots merge into one longer arc.
function useArcs(seedText) {
  return useMemo(() => {
    const base = hashString(seedText || "showpilot");
    return RINGS.map((ring, ri) => {
      const step = 360 / ring.slots;
      const on = Array.from({ length: ring.slots }, (_, i) => seededRandom(base + ri * 997 + i * 31) > 0.38);
      on[0] = true; // never an empty ring
      const arcs = [];
      let i = 0;
      while (i < ring.slots) {
        if (!on[i]) { i++; continue; }
        let j = i;
        while (j + 1 < ring.slots && on[j + 1] && j - i < 5) j++;
        const a0 = i * step + step * 0.16;
        const a1 = (j + 1) * step - step * 0.16;
        arcs.push({ d: arcPath(ring.r, a0, a1), mid: (a0 + a1) / 2 });
        i = j + 1;
      }
      return arcs;
    });
  }, [seedText]);
}

export default function SkyKey({ seed, color = "#8CFF3D", phase, onDone }) {
  const arcs = useArcs(seed);
  const ringRefs = useRef([]);
  const arcRefs = useRef([]);
  const shackleRef = useRef(null);
  const lockRef = useRef(null);
  const wrapRef = useRef(null);
  const state = useRef({ angles: [0, 0, 0], unlockStart: null, settleFrom: null, failStart: null, failFrom: null });
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) {
      if (phase === "unlocking") {
        const t = setTimeout(() => doneRef.current?.(), 250);
        return () => clearTimeout(t);
      }
      return undefined;
    }
    let raf;
    let last = performance.now();
    const st = state.current;

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (phase === "verifying") {
        st.angles = st.angles.map((a, i) => a + RINGS[i].speed * dt);
      } else if (phase === "unlocking") {
        if (st.unlockStart == null) {
          st.unlockStart = now;
          // Carry on in the same direction, then settle on the nearest whole turn of a slot.
          st.settleFrom = st.angles.slice();
          st.settleTo = st.angles.map((a, i) => {
            const slot = 360 / RINGS[i].slots;
            return Math.round((a + RINGS[i].speed * 0.55) / slot) * slot;
          });
        }
        const t = (now - st.unlockStart) / UNLOCK_MS;
        const settle = ease(t / 0.42);
        st.angles = st.settleFrom.map((a, i) => a + (st.settleTo[i] - a) * settle);

        // Color sweeps around once the rings have settled.
        const sweep = Math.max(0, (t - 0.3) / 0.25) * 360;
        arcRefs.current.forEach((ringArcs, ri) => ringArcs?.forEach((el, ai) => {
          if (!el) return;
          const lit = arcs[ri][ai].mid <= sweep - ri * 30;
          el.setAttribute("stroke", lit ? color : "rgba(255,255,255,0.32)");
          el.style.filter = lit ? `drop-shadow(0 0 6px ${color})` : "none";
        }));

        // Lock opens, then the key opens outward.
        const lift = ease((t - 0.58) / 0.12);
        shackleRef.current?.setAttribute("transform", `translate(0 ${-9 * lift}) rotate(${-22 * lift} ${C + 10} ${C - 6})`);
        if (lockRef.current) lockRef.current.style.opacity = String(1 - ease((t - 0.7) / 0.1));
        const open = ease((t - 0.72) / 0.28);
        if (wrapRef.current) {
          wrapRef.current.style.transform = `scale(${1 + open * 2.4})`;
          wrapRef.current.style.opacity = String(1 - open);
        }
        if (t >= 1) {
          doneRef.current?.();
          return;
        }
      } else if (phase === "failed") {
        if (st.failStart == null) { st.failStart = now; st.failFrom = st.angles.slice(); }
        const t = ease((now - st.failStart) / 900);
        st.angles = st.failFrom.map((a, i) => a + RINGS[i].speed * 0.4 * t);
      }

      ringRefs.current.forEach((g, i) => g?.setAttribute("transform", `rotate(${st.angles[i].toFixed(2)} ${C} ${C})`));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase, reduced, arcs, color]);

  const failed = phase === "failed";
  const baseStroke = failed ? "rgba(248,113,113,0.45)" : "rgba(255,255,255,0.32)";

  return (
    <div ref={wrapRef} style={{ width: SIZE, height: SIZE, transition: reduced ? "opacity 250ms" : undefined, opacity: reduced && phase === "unlocking" ? 0 : 1 }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={failed ? "Key did not open" : phase === "unlocking" ? "Key opening" : "Checking your key"}>
        <circle cx={C} cy={C} r={136} fill="none" stroke={failed ? "rgba(248,113,113,0.18)" : "rgba(255,255,255,0.08)"} strokeWidth="1" />
        {arcs.map((ringArcs, ri) => (
          <g key={ri} ref={(el) => { ringRefs.current[ri] = el; }}>
            {ringArcs.map((a, ai) => (
              <path
                key={ai}
                ref={(el) => { (arcRefs.current[ri] ||= [])[ai] = el; }}
                d={a.d}
                fill="none"
                stroke={baseStroke}
                strokeWidth={ri === 0 ? 9 : 8}
                strokeLinecap="round"
              />
            ))}
          </g>
        ))}
        {/* The lock */}
        <g ref={lockRef}>
        <circle cx={C} cy={C} r={46} fill="#0b0e24" stroke={failed ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.14)"} />
        <path
          ref={shackleRef}
          d={`M ${C - 10} ${C - 2} V ${C - 12} a 10 10 0 0 1 20 0 V ${C - 2}`}
          fill="none"
          stroke={failed ? "#F87171" : "#fff"}
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <rect x={C - 16} y={C - 3} width={32} height={24} rx={6} fill={failed ? "#F87171" : "#fff"} />
        <circle cx={C} cy={C + 8} r={3.2} fill="#0b0e24" />
        </g>
      </svg>
    </div>
  );
}
