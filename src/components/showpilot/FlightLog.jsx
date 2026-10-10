import React, { useEffect, useMemo, useState } from "react";
import { Plane } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";

const AMBER = "#F5B83D";

// Where each role stands, in flight terms.
function statusOf(n) {
  if (n.percent >= 100) return { word: "LANDED", color: "#8CFF3D" };
  if (n.percent > 0) return { word: "EN ROUTE", color: "#60A5FA" };
  if (n.claimed || n.invited) return { word: "BOARDING", color: AMBER };
  return { word: "NO CREW", color: "#6b6b6b" };
}

const pad = (n) => String(n).padStart(2, "0");
function stamp(iso, now) {
  const d = new Date(iso);
  const mins = Math.round((now - d.getTime()) / 60000);
  if (mins < 1) return "NOW";
  if (mins < 60) return `${mins}M AGO`;
  if (mins < 24 * 60 && d.getDate() === new Date(now).getDate()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

// The progress feed on the desktop board, styled like an airport
// departures board: a runway per role with the plane moving along it as
// the section fills in, then a log of what happened (tasks filed and
// cleared), newest first.
export default function FlightLog({ nodes = [], tasks = [], codes = {}, onSelectRole, selectedRole }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000); // keeps "5M AGO" honest
    return () => clearInterval(t);
  }, []);

  const byRole = useMemo(() => Object.fromEntries(nodes.map((n) => [n.role, n])), [nodes]);
  const events = useMemo(() => {
    const out = [];
    tasks.forEach((t) => {
      if (t.created_at) out.push({ at: t.created_at, kind: "FILED", task: t });
      if (t.status === "done" && t.completed_at) out.push({ at: t.completed_at, kind: "CLEARED", task: t });
    });
    return out.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 40);
  }, [tasks]);

  const avg = nodes.length ? Math.round(nodes.reduce((s, n) => s + (n.percent || 0), 0) / nodes.length) : 0;
  const landed = nodes.filter((n) => n.percent >= 100).length;

  return (
    <div className="h-full min-h-0 flex flex-col rounded-[6px] border border-[#2a2a2a] bg-[#0b0b0b] overflow-hidden" style={{ fontFamily: SCENE_MONO, boxShadow: "0 10px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
      <div className="flex items-baseline gap-2 px-4 pt-3 pb-2 border-b border-[#1f1f1f] shrink-0">
        <span className="text-[15px] font-semibold tracking-[0.14em]" style={{ color: AMBER }}>FLIGHT LOG</span>
        <span className="ml-auto text-[11px] text-white/45 tabular-nums">{landed}/{nodes.length} LANDED · {avg}% READY</span>
      </div>

      {/* Runways: one lane per role, the plane sits at that role's progress. */}
      <div className="px-4 py-3 flex flex-col gap-2.5 shrink-0 border-b border-[#1f1f1f]">
        {nodes.map((n) => {
          const st = statusOf(n);
          const pct = Math.max(0, Math.min(100, n.percent || 0));
          const on = selectedRole === n.role;
          return (
            <button key={n.role} type="button" onClick={() => onSelectRole?.(n.role)}
              className="grid grid-cols-[64px_minmax(0,1fr)_76px] items-center gap-2.5 text-left rounded-sm -mx-1 px-1 py-0.5 hover:bg-white/[0.03]"
              style={on ? { background: n.style.color + "14" } : undefined}>
              <span className="text-[11px] font-semibold tracking-[0.06em] truncate" style={{ color: n.style.color }}>{codes[n.role] || n.role}</span>
              <span className="relative h-[14px]" aria-label={`${n.style.label}: ${pct}%`}>
                {/* runway centre line */}
                <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px]" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 11px)" }} />
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] transition-[width] duration-700" style={{ width: `${pct}%`, background: n.style.color, boxShadow: `0 0 6px ${n.style.color}88` }} />
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-[12px] bg-white/25" />
                <Plane className="absolute top-1/2 w-[14px] h-[14px] transition-[left] duration-700" style={{ left: `calc(${pct}% - 7px)`, transform: "translateY(-50%) rotate(45deg)", color: pct > 0 ? n.style.color : "rgba(255,255,255,0.35)" }} />
              </span>
              <span className="text-[10px] font-semibold tracking-[0.08em] text-right whitespace-nowrap" style={{ color: st.color }}>
                {st.word}{st.word === "EN ROUTE" ? ` ${pct}%` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* The log: departures-board rows, newest first. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-[62px_64px_minmax(0,1fr)] gap-x-2 px-4 pt-2 pb-1 text-[9px] tracking-[0.14em] text-white/30 sticky top-0 bg-[#0b0b0b]">
          <span>TIME</span><span>FROM</span><span>STATUS</span>
        </div>
        {events.length === 0 ? (
          <p className="px-4 py-3 text-[11px] text-white/30 tracking-[0.04em]">NO MOVEMENT YET. TASKS SHOW UP HERE AS THEY'RE FILED AND CLEARED.</p>
        ) : (
          events.map((e, i) => {
            const n = byRole[e.task.section];
            const cleared = e.kind === "CLEARED";
            return (
              <div key={`${e.task.id}-${e.kind}-${i}`} className="grid grid-cols-[62px_64px_minmax(0,1fr)] gap-x-2 px-4 py-1.5 border-t border-[#161616] items-baseline">
                <span className="text-[11px] tabular-nums" style={{ color: AMBER }}>{stamp(e.at, now)}</span>
                <span className="text-[11px] font-semibold truncate" style={{ color: n?.style.color || "#9a9a9a" }}>{codes[e.task.section] || e.task.section}</span>
                <span className="min-w-0 text-[12px] leading-snug">
                  <span className="font-semibold tracking-[0.06em] mr-1.5" style={{ color: cleared ? "#8CFF3D" : "rgba(255,255,255,0.55)" }}>{cleared ? "✓ CLEARED" : "FILED"}</span>
                  <span className="text-white/80" style={{ fontFamily: "inherit" }}>{e.task.title}</span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
