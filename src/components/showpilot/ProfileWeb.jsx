import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { EventTypeGlyph } from "@/components/showpilot/EventTypeIcon";
import { eventTypeColor } from "@/lib/eventTypes";

// Webs within webs (design: claude/design-principle-feature-dcas-and-cluster-nav.md).
// The event web has the event in the middle and its profiles around it.
// Opening a profile spins that web closed and this one open: the profile in
// the middle, its tabs around it, and its features (DCAs, like a console's
// DCA faders) in the four corners. Tapping the middle spins back out.

export const SPIN_MS = 420;
// Closing accelerates into the middle; opening glides out and settles.
const EASE_IN = "cubic-bezier(.55,0,.8,.3)";
const EASE_OUT = "cubic-bezier(.16,.84,.3,1)";
const TURN = 120; // degrees the ring turns while closing / opening

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
// spinning closed. Only transform and opacity animate (no layout), so the
// browser can run it on the GPU: nodes keep their place and are pulled to
// the middle with a translate while the ring turns.
export function spinMotion({ entering, leaving, ms = SPIN_MS }) {
  const hidden = entering || leaving;
  const ease = leaving ? EASE_IN : EASE_OUT;
  const t = (props) => (entering ? "none" : props.map((p) => `${p} ${ms}ms ${ease}`).join(", "));
  return {
    hidden,
    wrap: { transform: `rotate(${entering ? -TURN : leaving ? TURN : 0}deg)`, transition: t(["transform"]), willChange: "transform" },
    // Style for a node whose center sits dx/dy px away from the web's middle.
    node: (dx, dy, base = "translate(-50%, -50%)") => ({
      transform: hidden ? `${base} translate(${-dx}px, ${-dy}px) scale(0.3)` : `${base} translate(0px, 0px) scale(1)`,
      opacity: hidden ? 0 : 1,
      transition: t(["transform", "opacity"]),
      willChange: "transform, opacity",
    }),
    fade: (opacity) => ({ opacity: hidden ? 0 : opacity, transition: t(["opacity"]) }),
    center: {
      transform: `translate(-50%, -50%) scale(${hidden ? 0.82 : 1})`,
      opacity: hidden ? 0.25 : 1,
      transition: t(["transform", "opacity"]),
      willChange: "transform, opacity",
    },
  };
}

// Measures a square box's width before the first paint (so nothing draws
// at a guessed size and then jumps), then keeps following resizes.
// Measures a square box's width before the first paint (so nothing draws
// at a guessed size and then jumps), then keeps following resizes.
export function useBoxSize(initial) {
  const ref = useRef(null);
  const [size, setSize] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const w = Math.round(el.getBoundingClientRect().width);
    if (w) setSize(w);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => { const cw = Math.round(e.contentRect.width); if (cw) setSize(cw); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// Short labels so tab names fit inside a node.
const SHORT = {
  tasks: "Current", requests: "Requests", documents: "Docs", address: "Address", load_in: "Load-in", schedule: "Schedule",
  wifi_power: "Wi-Fi", house_gear: "Gear", hospitality: "Hospo", contact: "Contact", doors: "Doors", tickets: "Tickets",
  marketing: "Marketing", guests: "Guests", settlement: "Settle", deal: "Deal", holds: "Holds", contract: "Contract",
  deposit: "Payments", lineup: "Lineup", advance: "Advance", travel: "Travel", merch: "Merch",
};
export const shortTabLabel = (t) => SHORT[t.key] || String(t.label || "").split(/[\s&]/)[0];

// A role color mixed into the dark background, for filled centers.
export function tintOnDark(hex, a) {
  const v = parseInt(String(hex).replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(v)) return "#161616";
  const mix = (c) => Math.round(13 + (c - 13) * a).toString(16).padStart(2, "0");
  return `#${mix((v >> 16) & 255)}${mix((v >> 8) & 255)}${mix(v & 255)}`;
}

const DOT = { done: "#8CFF3D", partial: "#FF6A00", empty: "#4a4a4a" };
const STATE_WORD = { done: "filled in", partial: "partly filled in", empty: "not started" };

const CORNERS = [[9, 9], [91, 9], [9, 91], [91, 91]];

export default function ProfileWeb({
  color, title, sub, tabs = [], activeKey, onPick, dcas = [], onBack, leaving = false, home = null,
  imageUrl = "", photoControl = null,
}) {
  // imageUrl: the profile's own picture on this event (job 147), behind its
  // title in the center. photoControl: a button to change it, pinned to the
  // center circle's lower right (only when you can edit the profile).
  // home: { title, imageUrl, eventType, onClick } - the event itself, as the
  // top-left corner box with its picture. Tapping it returns to the event web
  // (it replaces the old Back / Overview buttons). Features then use the
  // other three corners.
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
      <span aria-hidden="true" className="absolute rounded-full border border-[#1c1c1c]" style={{ left: `${50 - R}%`, top: `${50 - R}%`, width: `${R * 2}%`, height: `${R * 2}%`, ...m.fade(1) }} />

      <div className="absolute inset-0" style={m.wrap}>
        {ring.map(({ t, a }) => (
          <span
            key={`s-${t.key}`}
            aria-hidden="true"
            className="absolute"
            style={{ left: "50%", top: "50%", width: `${R - 6}%`, height: 1.5, transformOrigin: "0 50%", transform: `rotate(${a}deg)`, background: color, ...m.fade(t.key === activeKey ? 0.75 : 0.28) }}
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
                left: `${x}%`, top: `${y}%`,
                width: nodeSize, height: nodeSize, ...m.node(((x - 50) / 100) * size, ((y - 50) / 100) * size),
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
          const base = { left: `${cx}%`, top: `${cy}%`, ...m.node(((cx - 50) / 100) * size, ((cy - 50) / 100) * size) };
          if (home && i === 0) {
            const hs = dcaSize + 6;
            const glyphColor = eventTypeColor(home.eventType) || "#9a9a9a";
            return (
              <button
                key="home"
                type="button"
                onClick={home.onClick || onBack}
                aria-label={`${home.title || "Event"}. Back to the event web`}
                title="Back to the event web"
                className="absolute rounded-[12px] overflow-hidden p-0 flex items-end justify-center"
                style={{ ...base, width: hs, height: hs, background: "#1a1a1a", border: "2px solid #FFFFFF", boxShadow: "0 0 0 2px #FFFFFF33, 0 0 16px #FFFFFF66" }}
              >
                {/* Just the picture (job 125). */}
                {home.imageUrl ? (
                  <img src={home.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <EventTypeGlyph type={home.eventType} className="absolute" style={{ width: "64%", height: "64%", left: "18%", top: "18%", color: glyphColor, opacity: 0.6, strokeWidth: 1.5 }} />
                )}
                <span className="sr-only">{home.title || "Event"}</span>
              </button>
            );
          }
          const d = dcas[home ? i - 1 : i];
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
              aria-label={d.badge ? `${d.label} feature, ${d.badge} yours` : `${d.label} feature`}
              className="absolute rounded-[12px] flex flex-col items-center justify-center gap-1 p-0"
              style={{ ...base, width: dcaSize + 8, height: dcaSize + 8, background: "#161616", border: `1.5px solid ${d.color}`, boxShadow: `0 0 12px ${d.color}40`, color: "#f2f2f2" }}
            >
              <span className="rounded-full" style={{ width: Math.round(34 * k), height: 3, background: d.color, boxShadow: `0 0 8px ${d.color}` }} />
              <span className="font-bold leading-none text-center" style={{ fontSize: Math.round(11.5 * k) }}>{d.label}</span>
              {d.badge > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[11px] font-bold text-[#0d0d0d]" style={{ background: d.color, boxShadow: `0 0 8px ${d.color}` }}>{d.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onBack}
        aria-label={`${title}. Back to the event web`}
        className="absolute rounded-full flex flex-col items-center justify-center gap-1 px-2 overflow-hidden"
        style={{
          left: "50%", top: "50%", width: Math.round(98 * k), height: Math.round(98 * k),
          ...m.center,
          background: tintOnDark(color, 0.16), border: `2px solid ${color}`, boxShadow: `0 0 26px ${color}55`,
        }}
      >
        {imageUrl && (
          <>
            <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
            <span aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.55), rgba(0,0,0,0.3) 75%)" }} />
          </>
        )}
        <span className="relative font-bold leading-[0.95] tracking-[0.03em] text-center uppercase" style={{ color, fontSize: Math.round((String(title).length > 10 ? 13.5 : 17) * k), textShadow: imageUrl ? "0 0 3px #000, 0 1px 6px #000, 0 0 12px rgba(0,0,0,0.8)" : undefined }}>{title}</span>
        {sub && <span className="relative tracking-[0.08em] text-white/70 text-center" style={{ fontFamily: SCENE_MONO, fontSize: Math.round(8.5 * k), textShadow: imageUrl ? "0 1px 4px rgba(0,0,0,0.9)" : undefined }}>{sub}</span>}
      </button>
      {photoControl && (
        <div className="absolute z-10" style={{ left: `calc(50% + ${Math.round(34 * k)}px)`, top: `calc(50% + ${Math.round(34 * k)}px)`, transform: "translate(-50%, -50%)", ...m.fade(1) }}>
          {photoControl}
        </div>
      )}
    </div>
  );
}
