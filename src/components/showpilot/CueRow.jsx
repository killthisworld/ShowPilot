import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";

const AMBER = "#8CFF3D"; // job 421: lighting is green (was amber)
const OPEN = 84; // px the row slides to show Delete

// Playing cues (jobs 389, 421): tap a cue and it runs for its length, then
// stops. Several can run at once.
// [play, start(i, secs), stop(i?), plays]
//  - plays: [{ i, key, secs, at }] all running, oldest first
//  - play: the latest one (or null)
//  - start(i, secs): plays cue i (again from the top if it's running)
//  - stop(i): stops cue i; stop() stops them all
export function useCuePlayer() {
  const [plays, setPlays] = useState([]);
  const timers = useRef({});
  useEffect(() => () => Object.values(timers.current).forEach((t) => window.clearTimeout(t)), []);
  const stop = (i) => {
    if (i === undefined) { Object.values(timers.current).forEach((t) => window.clearTimeout(t)); timers.current = {}; setPlays([]); return; }
    window.clearTimeout(timers.current[i]); delete timers.current[i];
    setPlays((ps) => ps.filter((p) => p.i !== i));
  };
  const start = (i, secs) => {
    const s = Math.max(0.5, Number(secs) || 8);
    const key = Date.now() + Math.random();
    window.clearTimeout(timers.current[i]);
    timers.current[i] = window.setTimeout(() => { delete timers.current[i]; setPlays((ps) => ps.filter((p) => p.key !== key)); }, s * 1000);
    setPlays((ps) => [...ps.filter((p) => p.i !== i), { i, key, secs: s, at: performance.now() / 1000 }]);
  };
  return [plays[plays.length - 1] || null, start, stop, plays];
}

// A cue in a list: tap to play it - the row fills left to right in the cue's
// color for its length. Swipe it left to show Delete (when onDelete).
// open / onToggleOpen (job 398): an arrow at the end opens the cue's settings.
export function CueRow({ n, title, sub = "", color = "", active = false, play = null, onTap, onDelete = null, badge = null, open = false, onToggleOpen = null }) {
  const [dx, setDx] = useState(0);
  const g = useRef(null);
  const fill = color || AMBER;
  const down = (e) => {
    if (e.target.closest?.("[data-cue-open]")) return;
    if (!onDelete) return;
    g.current = { x: e.clientX, y: e.clientY, base: dx, swiping: false };
  };
  const move = (e) => {
    const s = g.current;
    if (!s) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (!s.swiping) {
      if (Math.abs(mx) < 8 || Math.abs(my) > Math.abs(mx)) return;
      s.swiping = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    }
    setDx(Math.max(-OPEN - 20, Math.min(0, s.base + mx)));
  };
  const up = (e) => {
    if (e?.target?.closest?.("[data-cue-open]")) { g.current = null; return; }
    if (!onDelete) return; // no swipe here: the click plays it
    const s = g.current;
    g.current = null;
    if (s?.swiping) { setDx((v) => (v < -OPEN / 2 ? -OPEN : 0)); return; }
    if (dx) { setDx(0); return; } // tap on an open row: close it
    onTap?.();
  };
  return (
    <div className="relative rounded-[6px] overflow-hidden" style={{ touchAction: "pan-y" }}>
      {onDelete && (
        <button type="button" onClick={() => { setDx(0); onDelete(); }} aria-label={`Delete ${title}`} tabIndex={dx ? 0 : -1}
          className="absolute right-0 top-0 bottom-0 flex items-center justify-center gap-1 text-[12.5px] font-bold text-white" style={{ width: OPEN, background: "#b91c1c" }}>
          <Trash2 className="w-4 h-4" />Delete
        </button>
      )}
      <div role="button" tabIndex={0} aria-pressed={active} aria-label={`Play cue ${n}: ${title}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { g.current = null; setDx((v) => (v < -OPEN / 2 ? -OPEN : 0)); }}
        onClick={onDelete ? undefined : onTap}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap?.(); } }}
        className="relative min-h-[44px] px-2.5 border rounded-[6px] text-left flex items-center gap-2 select-none cursor-pointer"
        style={{ transform: `translateX(${dx}px)`, transition: g.current?.swiping ? "none" : "transform 160ms ease", background: active ? "#16240d" : "#1b1b1b", borderColor: active ? AMBER : "#2a2a2a" }}>
        {play && (
          <span key={play.key} aria-hidden="true" className="absolute left-0 top-0 bottom-0 pointer-events-none"
            style={{ background: fill, opacity: 0.38, animation: `sp-cue-fill ${play.secs}s linear forwards` }} />
        )}
        <span className="relative w-6 text-[11px] tabular-nums" style={{ fontFamily: SCENE_MONO, color: active ? AMBER : "#888" }}>{n}</span>
        {color && <span className="relative w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />}
        <span className="relative flex-1 min-w-0">
          {sub && <span className="block text-[12px] text-white/50 truncate">{sub}</span>}
          <span className="block text-[13.5px] text-white truncate">{title}</span>
        </span>
        {badge}
        {onToggleOpen && (
          <button type="button" data-cue-open onClick={(e) => { e.stopPropagation(); onToggleOpen(); }} aria-expanded={open} aria-label={`${open ? "Close" : "Open"} cue ${n}'s settings`}
            className="relative -mr-1 w-9 h-9 shrink-0 rounded-[6px] flex items-center justify-center text-white/60 hover:text-white">
            <ChevronDown className="w-5 h-5 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
          </button>
        )}
      </div>
      <style>{"@keyframes sp-cue-fill { from { width: 0% } to { width: 100% } }"}</style>
    </div>
  );
}
