import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// Webs within webs (design: claude/design-principle-feature-dcas-and-cluster-nav.md).
// The event web has the event in the middle and its profiles around it.
// Opening a profile spins that web closed and this one open: the profile in
// the middle, its tabs around it, and its features (DCAs, like a console's
// DCA faders) in the four corners. Tapping the middle spins back out.

export const SPIN_MS = 360;
const EASE = "cubic-bezier(.6,0,.3,1)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Plays a web's "spin open" once each time `trigger` changes (0 = never).
// The collapsed state is set before the browser paints, then released two
// frames later so the CSS transition has a starting point.
export function useEntrance(trigger) {
  const [entered, setEntered] = useState(true);
  useLayoutEffect(() => {
    if (!trigger) return undefined;
    setEntered(false);
    let r2;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setEntered(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [trigger]);
  return entered;
}

// Shared motion for both webs. `entering` = not yet spun open, `leaving` =
// spinning closed. Nodes fly to the middle and fade while the ring turns.
export function spinMotion({ entering, leaving, ms = SPIN_MS }) {
  const hidden = entering || leaving;
  const tr = entering ? "none" : `all ${ms}ms ${EASE}`;
  return {
    hidden,
    wrap: { transform: `rotate(${entering ? -200 : leaving ? 200 : 0}deg)`, transition: entering ? "none" : `transform ${ms}ms ${EASE}` },
    node: { transition: tr, opacity: hidden ? 0 : 1 },
    scale: hidden ? 0.25 : 1,
    center: { transition: tr, opacity: hidden ? 0.2 : 1, scale: hidden ? 0.7 : 1 },
  };
}

// Short labels so tab names fit inside a node.
const SHORT = {
  tasks: "Tasks", requests: "Requests", documents: "Docs", address: "Address", load_in: "Load-in", schedule: "Schedule",
  wifi_power: "Wi-Fi", house_gear: "Gear", hospitality: "Hospo", contact: "Contact", doors: "Doors", tickets: "Tickets",
  marketing: "Marketing", guests: "Guests", settlement: "Settle", deal: "Deal", holds: "Holds", contract: "Contract",
  deposit: "Payments", lineup: "Lineup", advance: "Advance", travel: "Travel", merch: "Merch",
};
export const shortTabLabel = (t) => SHORT[t.key] || String(t.label || "").split(/[\s&]/)[0];

// A role color mixed into the dark background, for filled centers.
function tintOnDark(hex, a) {
  const v = parseInt(String(hex).replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(v)) return "#161616";
  const mix = (c) => Math.round(13 + (c - 13) * a).toString(16).padStart(2, "0");
  return `#${mix((v >> 16) & 255)}${mix((v >> 8) & 255)}${mix(v & 255)}`;
}

const DOT = { done: "#8CFF3D", partial: "#FF6A00", empty: "#4a4a4a" };
const STATE_WORD = { done: "filled in", partial: "partly filled in", empty: "not started" };

function useBoxSize(initial) {
  const ref = useRef(null);
  const [size, setSize] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setSize(Math.round(e.contentRect.width) || initial));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, size];
}

const CORNERS = [[9, 9], [91, 9], [9, 91], [91, 91]];

export default function ProfileWeb({
  color, title, sub, tabs = [], activeKey, onPick, dcas = [], onBack, leaving = false,
}) {
  const reduced = prefersReducedMotion();
  const entered = useEntrance(reduced ? 0 : 1);
  const ms = reduced ? 0 : SPIN_MS;
  const m = spinMotion({ entering: !entered, leaving: leaving && !reduced, ms });
  const [boxRef, size] = useBoxSize(300);
  const k = Math.max(1, Math.min(1.75, size / 300));
  const R = 36; // ring radius, % of the box
  const n = tabs.length || 1;
  const nodeSize = Math.round(52 * k);
  const dcaSize = Math.round(50 * k);

  const ring = tabs.map((t, i) => {
    const a = -90 + (i * 360) / n;
    const rad = (a * Math.PI) / 180;
    return { t, a, x: 50 + R * Math.cos(rad), y: 50 + R * Math.sin(rad) };
  });

  return (
    <div ref={boxRef} className="relative w-full aspect-square select-none" style={{ fontFamily: SCENE_FONT }}>
      <span aria-hidden="true" className="absolute rounded-full border border-[#1c1c1c]" style={{ left: `${50 - R}%`, top: `${50 - R}%`, width: `${R * 2}%`, height: `${R * 2}%` }} />

      <div className="absolute inset-0" style={m.wrap}>
        {ring.map(({ t, a }) => (
          <span
            key={`s-${t.key}`}
            aria-hidden="true"
            className="absolute"
            style={{ left: "50%", top: "50%", width: `${R - 6}%`, height: 1.5, transformOrigin: "0 50%", transform: `rotate(${a}deg)`, background: color, opacity: m.hidden ? 0 : t.key === activeKey ? 0.75 : 0.28, transition: m.node.transition }}
          />
        ))}

        {ring.map(({ t, x, y }) => {
          const on = t.key === activeKey;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onPick?.(t.key)}
              aria-pressed={on}
              aria-label={`${t.label}, ${STATE_WORD[t.state] || ""}`}
              className="absolute rounded-full flex flex-col items-center justify-center gap-[3px] p-0"
              style={{
                left: m.hidden ? "50%" : `${x}%`, top: m.hidden ? "50%" : `${y}%`,
                width: nodeSize, height: nodeSize, transform: `translate(-50%, -50%) scale(${m.scale})`, ...m.node,
                background: on ? color : "#151515", color: on ? "#0d0d0d" : "#f2f2f2",
                border: `1.5px solid ${on ? color : `${color}66`}`,
                boxShadow: on ? `0 0 16px ${color}66` : "none",
              }}
            >
              <span className="rounded-full" style={{ width: 7, height: 7, background: on ? "#0d0d0d" : DOT[t.state] || DOT.empty }} />
              <span className="font-bold leading-none tracking-[0.02em] px-0.5 text-center whitespace-nowrap" style={{ fontSize: Math.round((shortTabLabel(t).length > 7 ? 10 : 11.5) * k) }}>{shortTabLabel(t)}</span>
            </button>
          );
        })}

        {CORNERS.map(([cx, cy], i) => {
          const d = dcas[i];
          const base = {
            left: m.hidden ? "50%" : `${cx}%`, top: m.hidden ? "50%" : `${cy}%`,
            transform: `translate(-50%, -50%) scale(${m.scale})`, ...m.node,
          };
          if (!d) {
            return (
              <span
                key={`dca-${i}`}
                aria-hidden="true"
                title="Feature slot"
                className="absolute rounded-[12px] flex flex-col items-center justify-center gap-0.5 text-white/30"
                style={{ ...base, width: dcaSize, height: dcaSize, border: "1.5px dashed #333" }}
              >
                <span className="text-[16px] leading-none">+</span>
                <span className="tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, fontSize: Math.round(8 * k) }}>FEATURE</span>
              </span>
            );
          }
          return (
            <button
              key={d.key}
              type="button"
              onClick={d.onClick}
              aria-label={`${d.label} feature`}
              className="absolute rounded-[12px] flex flex-col items-center justify-center gap-1 p-0"
              style={{ ...base, width: dcaSize + 8, height: dcaSize + 8, background: "#161616", border: `1.5px solid ${d.color}`, boxShadow: `0 0 12px ${d.color}40`, color: "#f2f2f2" }}
            >
              <span className="tracking-[0.1em] text-white/45" style={{ fontFamily: SCENE_MONO, fontSize: Math.round(8 * k) }}>DCA</span>
              <span className="rounded-full" style={{ width: Math.round(34 * k), height: 3, background: d.color, boxShadow: `0 0 8px ${d.color}` }} />
              <span className="font-bold leading-none text-center" style={{ fontSize: Math.round(11.5 * k) }}>{d.label}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onBack}
        aria-label={`${title}. Back to the event web`}
        className="absolute rounded-full flex flex-col items-center justify-center gap-1 px-2"
        style={{
          left: "50%", top: "50%", width: Math.round(98 * k), height: Math.round(98 * k),
          transform: `translate(-50%, -50%) scale(${m.center.scale})`, transition: m.center.transition, opacity: m.center.opacity,
          background: tintOnDark(color, 0.16), border: `2px solid ${color}`, boxShadow: `0 0 26px ${color}55`,
        }}
      >
        <span className="font-bold leading-[0.95] tracking-[0.03em] text-center uppercase" style={{ color, fontSize: Math.round((String(title).length > 10 ? 13.5 : 17) * k) }}>{title}</span>
        {sub && <span className="tracking-[0.08em] text-white/70 text-center" style={{ fontFamily: SCENE_MONO, fontSize: Math.round(8.5 * k) }}>{sub}</span>}
      </button>
    </div>
  );
}
