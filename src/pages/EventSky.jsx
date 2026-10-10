import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { hashColor, hashString, seededRandom } from "@/lib/constellation";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import SkyKey from "@/components/showpilot/SkyKey";
import GalaxyCanvas from "@/components/showpilot/GalaxyCanvas";

// /e/:token/sky?k=<sky key>  (public, no login)
//
// The link in a fan's RSVP email. Plays the key-unlock animation while the
// key is checked (get_event_sky), then opens the event's sky: every RSVP is a
// star, the fan's own star is marked "You". Other fans are never named; a
// star only knows its party size and when it joined. New RSVPs appear as the
// page refreshes every minute.

const MIN_VERIFY_MS = 1100; // let the rings spin for a beat even on a fast connection
const REFRESH_MS = 60_000;

// Sunflower spiral: the earliest RSVPs sit near the middle and each new one
// lands a little further out, so the sky visibly grows as people join. Seeded
// jitter keeps it from looking mechanical. Works in pixels (w x h) so the
// spiral fills the screen's shape; returns positions plus "constellation"
// lines: the short edges of a minimum spanning tree, so nearby stars link up
// into small groups instead of one tangled web.
function skyLayout(stars, w, h) {
  if (!w || !h || stars.length === 0) return { positions: [], lines: [] };
  const sorted = [...stars].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const n = sorted.length;
  const rx = w * 0.47, ry = h * 0.47;
  const positions = sorted.map((s, i) => {
    const seed = hashString(s.id);
    const frac = Math.min(1, Math.sqrt((i + 0.6) / Math.max(n, 6)) + (seededRandom(seed) - 0.5) * 0.12);
    const theta = i * 2.39996 + (seededRandom(seed + 1) - 0.5) * 0.9;
    const x = w / 2 + frac * rx * Math.cos(theta);
    const y = h / 2 + frac * ry * Math.sin(theta);
    return { star: s, x, y, xPct: (x / w) * 100, yPct: (y / h) * 100 };
  });

  const lines = [];
  if (n > 1 && n <= 400) {
    const inTree = new Array(n).fill(false);
    const best = new Array(n).fill(Infinity);
    const from = new Array(n).fill(-1);
    best[0] = 0;
    const edges = [];
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
      inTree[u] = true;
      if (from[u] >= 0) edges.push({ a: from[u], b: u, d: best[u] });
      for (let v = 0; v < n; v++) {
        if (inTree[v]) continue;
        const d = Math.hypot(positions[u].x - positions[v].x, positions[u].y - positions[v].y);
        if (d < best[v]) { best[v] = d; from[v] = u; }
      }
    }
    const sortedD = edges.map((e) => e.d).sort((a, b) => a - b);
    const median = sortedD[Math.floor(sortedD.length / 2)] || 0;
    edges.filter((e) => e.d <= median * 1.25).forEach((e) => lines.push([positions[e.a], positions[e.b]]));
  }
  return { positions, lines };
}

function SkyStar({ star, color, isMe, revealDelay, onSelect, selected, scale = 1 }) {
  // Bigger parties shine a little brighter; a crowded sky shrinks every star.
  const core = (6 + Math.min(star.guests, 10) * 1.1) * (isMe ? Math.max(scale, 0.85) : scale);
  const glow = core * 4.2;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={isMe ? `Your star, party of ${star.guests}` : `A star, party of ${star.guests}`}
      className="sky-star absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70"
      style={{ width: Math.max(44, glow), height: Math.max(44, glow), animationDelay: `${revealDelay}ms`, zIndex: isMe ? 3 : 2 }}
    >
      <span
        className="absolute rounded-full"
        style={{
          width: glow, height: glow,
          background: `radial-gradient(circle, ${color}${isMe ? "aa" : "66"} 0%, transparent 70%)`,
          filter: "blur(4px)",
          animation: isMe ? "skyMePulse 3.2s ease-in-out infinite" : undefined,
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          width: core, height: core,
          background: `radial-gradient(circle at 35% 30%, #ffffff, ${color})`,
          boxShadow: `0 0 ${isMe ? 16 : 9}px ${isMe ? 5 : 2}px ${color}${isMe ? "ee" : "aa"}`,
        }}
      />
      {isMe && (
        <span className="absolute rounded-full border" style={{ width: core + 18, height: core + 18, borderColor: "rgba(255,255,255,0.55)" }} />
      )}
      {(isMe || selected) && (
        <span
          className="absolute top-full mt-0.5 whitespace-nowrap px-2 py-0.5 rounded-full text-[13px] font-semibold text-white"
          style={{ background: "rgba(8,10,28,0.78)", border: "1px solid rgba(255,255,255,0.18)" }}
        >
          {isMe ? "You" : `Party of ${star.guests}`}
        </span>
      )}
    </button>
  );
}

export default function EventSky() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const key = params.get("k") || "";
  const [phase, setPhase] = useState("verifying"); // verifying | unlocking | open | failed
  const [sky, setSky] = useState(null);
  const [selected, setSelected] = useState(null);
  const firstOpen = useRef(true);
  const fieldRef = useRef(null);
  const [field, setField] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
      setField((f) => (f.w === w && f.h === h ? f : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]); // the star field only mounts once the sky is open

  const load = useCallback(() => supabase.rpc("get_event_sky", { p_token: token, p_key: key }), [token, key]);

  useEffect(() => {
    let alive = true;
    const started = Date.now();
    const valid = /^[0-9a-f-]{36}$/i.test(key) && /^[0-9a-f-]{36}$/i.test(token || "");
    (valid ? load() : Promise.resolve({ data: null })).then(({ data }) => {
      const wait = Math.max(0, MIN_VERIFY_MS - (Date.now() - started));
      setTimeout(() => {
        if (!alive) return;
        if (data) { setSky(data); setPhase("unlocking"); } else setPhase("failed");
      }, wait);
    });
    return () => { alive = false; };
  }, [load, key, token]);

  // Keep the sky current while it's open.
  useEffect(() => {
    if (phase !== "open") return undefined;
    const id = setInterval(() => load().then(({ data }) => { if (data) setSky(data); }), REFRESH_MS);
    return () => clearInterval(id);
  }, [phase, load]);

  const color = eventTypeColor(sky?.event?.event_type) || "#8CFF3D";
  const stars = sky?.stars || [];
  const layout = useMemo(() => skyLayout(stars, field.w, field.h), [stars, field.w, field.h]);

  const ev = sky?.event;
  const dateLabel = ev?.date
    ? new Date(ev.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "";
  const meStar = stars.find((s) => s.id === sky?.me?.id);
  const joined = meStar ? new Date(meStar.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  const open = phase === "open";
  const revealing = phase === "unlocking" || open;

  const onKeyDone = useCallback(() => setPhase("open"), []);
  useEffect(() => { if (open) firstOpen.current = false; }, [open]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#03040c] text-white" style={{ fontFamily: SCENE_FONT }}>
      <style>{`
        @keyframes skyMePulse { 0%,100% { transform: scale(1); opacity: .85 } 50% { transform: scale(1.45); opacity: 1 } }
        @keyframes skyStarIn { from { opacity: 0; transform: translate(-50%,-50%) scale(.2) } to { opacity: 1; transform: translate(-50%,-50%) scale(1) } }
        .sky-star { animation: skyStarIn 900ms cubic-bezier(.2,.8,.2,1) both }
        @media (prefers-reduced-motion: reduce) { .sky-star { animation: none } }
      `}</style>

      {/* The sky fades and settles into view as the key opens. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: revealing ? 1 : 0.35,
          transform: open ? "scale(1)" : "scale(1.08)",
          filter: open ? "none" : "blur(4px)",
          transition: "opacity 1200ms ease, transform 1600ms cubic-bezier(.2,.8,.2,1), filter 1400ms ease",
        }}
      >
        <GalaxyCanvas seed={token} />
      </div>

      {/* Key overlay */}
      {phase !== "open" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <SkyKey seed={key} color={color} phase={phase === "failed" ? "failed" : phase} onDone={onKeyDone} />
          {phase === "verifying" && <p className="mt-6 text-lg text-white/60">Checking your key…</p>}
          {phase === "failed" && (
            <div className="mt-6 max-w-xs">
              <p className="text-2xl font-bold">This key doesn't open this sky</p>
              <p className="mt-1.5 text-[15px] leading-snug text-white/60">Use the Unlock your key link in your RSVP email, or RSVP on the event page to get a key.</p>
              <a href={`/e/${token}`} className="inline-block mt-4 px-5 py-2.5 rounded-full text-base font-bold text-[#0d0d0d]" style={{ background: "#8CFF3D" }}>Go to the event page</a>
            </div>
          )}
        </div>
      )}

      {/* The sky itself */}
      {open && sky && (
        <>
          <div className="absolute left-0 right-0 top-0 px-5 pt-5 pb-10 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(3,4,12,0.75), transparent)" }}>
            <h1 className="text-[34px] font-bold leading-[0.95]">{ev?.event_name || ev?.band_name || "Tonight"}</h1>
            <p className="mt-1.5 text-[15px] text-white/65">{[dateLabel, ev?.venue].filter(Boolean).join(" at ")}</p>
          </div>

          {/* Stars live in a padded area so they stay clear of the header and footer. */}
          <div ref={fieldRef} className="absolute left-6 right-6 top-[120px] bottom-[130px]" onClick={() => setSelected(null)}>
            <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
              {layout.lines.map(([a, b]) => (
                <line key={`${a.star.id}-${b.star.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(200,210,255,0.13)" strokeWidth="1" />
              ))}
            </svg>
            {layout.positions.map((p, i) => {
              const isMe = p.star.id === sky.me?.id;
              return (
                <div key={p.star.id} className="absolute" style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}>
                  <SkyStar
                    star={p.star}
                    color={isMe ? color : hashColor(p.star.id)}
                    isMe={isMe}
                    scale={stars.length > 90 ? 0.6 : stars.length > 45 ? 0.78 : 1}
                    selected={selected === p.star.id}
                    revealDelay={firstOpen.current ? (isMe ? 700 : 100 + Math.min(i, 40) * 25) : 0}
                    onSelect={(e) => { e.stopPropagation(); setSelected(selected === p.star.id ? null : p.star.id); }}
                  />
                </div>
              );
            })}
          </div>

          <div className="absolute left-0 right-0 bottom-0 px-5 pb-6 pt-12" style={{ background: "linear-gradient(0deg, rgba(3,4,12,0.85), transparent)" }}>
            <p className="text-xl font-bold">
              {stars.length} {stars.length === 1 ? "star" : "stars"} in the sky, {sky.people} {sky.people === 1 ? "person" : "people"} coming
            </p>
            <p className="mt-0.5 text-[15px] text-white/60">
              {sky.me?.name ? `${sky.me.name}, your` : "Your"} star joined{joined ? ` on ${joined}` : ""}. Every new RSVP adds another.
            </p>
            <a href={`/e/${token}`} className="inline-block mt-3 text-[13px] text-white/55 underline underline-offset-2 hover:text-white" style={{ fontFamily: SCENE_MONO }}>Event details</a>
          </div>
        </>
      )}
    </div>
  );
}
