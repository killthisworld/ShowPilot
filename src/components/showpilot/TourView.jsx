import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import useEventFeed from "@/lib/eventFeed";
import { eventTitle } from "@/lib/eventTitle";
import { localISO } from "@/lib/needsMe";
import { SCENE_FONT } from "@/lib/sceneStyle";

// Dates (job 73, "On the road" stage 5; was "Tours"): your upcoming dates in
// order, split into tours and single dates (All / Tours / Single dates).
// Tours: your upcoming dates in order,
// grouped into runs (dates no more than 4 days apart are one run). Between
// two dates: the drive (opens directions from one venue to the next) or the
// days off. Each date says whether anything is still open on it - requests,
// conflicts, tasks, people to invite - the same count as the event Overview.

const RUN_GAP_DAYS = 4;
const has = (v) => v != null && String(v).trim() !== "";
const dayMs = 86400000;
const toDay = (iso) => new Date(iso + "T00:00:00");
const daysBetween = (a, b) => Math.round((toDay(b) - toDay(a)) / dayMs);
const where = (g) => [g.venue, g.city, g.state].filter(has).join(", ");
const cityOf = (g) => String(g.city || g.venue || "").trim().toLowerCase();

export function buildRuns(gigs, today = localISO()) {
  const dated = (gigs || [])
    .filter((g) => g.date && g.date >= today && g.share_token)
    .sort((a, b) => a.date.localeCompare(b.date) || eventTitle(a).localeCompare(eventTitle(b)));
  const runs = [];
  dated.forEach((g) => {
    const run = runs[runs.length - 1];
    const last = run?.dates[run.dates.length - 1];
    if (!run || daysBetween(last.date, g.date) > RUN_GAP_DAYS) runs.push({ dates: [g] });
    else run.dates.push(g);
  });
  return runs;
}

const fmt = (iso, opts) => toDay(iso).toLocaleDateString("en-US", opts);

export default function TourView({ gigs, accent = "#8CFF3D", onOpen, onClose }) {
  const { user } = useAuth();
  const allRuns = useMemo(() => buildRuns(gigs), [gigs]);
  const upcoming = useMemo(() => allRuns.flatMap((r) => r.dates), [allRuns]);
  // A run of two or more dates is a tour; a date on its own is a single date.
  const tourCount = allRuns.filter((r) => r.dates.length > 1).length;
  const singleCount = allRuns.filter((r) => r.dates.length === 1).length;
  const [show, setShow] = useState("all");
  const runs = show === "tours" ? allRuns.filter((r) => r.dates.length > 1) : show === "single" ? allRuns.filter((r) => r.dates.length === 1) : allRuns;
  // Open items per event (no "mine" filter: everything still open on it).
  const { groups, loading } = useEventFeed(upcoming, user?.id || null);
  const openBy = useMemo(() => Object.fromEntries(groups.map((g) => [g.gig.share_token, g.rows.length])), [groups]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // The feed loads the nearest 20 events; farther ones show no status.
  const tracked = useMemo(() => new Set(upcoming.slice(0, 20).map((g) => g.share_token)), [upcoming]);
  const ready = upcoming.filter((g) => tracked.has(g.share_token) && !openBy[g.share_token]).length;

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-[#0d0d0d] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Dates" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg mx-auto pb-16">
        <div className="flex items-center px-3 pt-[max(14px,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white"><ArrowLeft className="w-[22px] h-[22px]" /></button>
        </div>
        <div className="px-6 pt-2 flex flex-col gap-1">
          <h1 className="m-0 text-[40px] leading-none tracking-[0.04em] font-bold text-white" style={{ fontFamily: SCENE_FONT }}>DATES</h1>
          <p className="m-0 text-[15px] text-white/60">
            {upcoming.length ? `${upcoming.length} upcoming ${upcoming.length === 1 ? "date" : "dates"}${loading ? "" : ` · ${ready} ready`}` : "No upcoming dates"}
          </p>
        </div>

        {upcoming.length > 0 && (
          <div role="tablist" aria-label="Show" className="mx-6 mt-5 grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#161616] border border-[#262626]">
            {[["all", "All", upcoming.length], ["tours", "Tours", tourCount], ["single", "Single dates", singleCount]].map(([id, label, n]) => (
              <button key={id} type="button" role="tab" aria-selected={show === id} onClick={() => setShow(id)}
                className="h-10 rounded-lg text-[13.5px] font-semibold whitespace-nowrap transition-colors"
                style={show === id ? { background: accent, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.65)" }}>
                {label} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )}

        {upcoming.length > 0 && !runs.length && (
          <p className="m-0 px-6 pt-8 text-[15px] text-white/50">{show === "tours" ? "No tours coming up. Two or more dates within 4 days of each other show here as a tour." : "No single dates coming up."}</p>
        )}

        {!upcoming.length && (
          <p className="m-0 px-6 pt-8 text-[15px] text-white/50">Dates you add or get invited to show up here in order, with the drive between them.</p>
        )}

        {runs.map((run, ri) => {
          const first = run.dates[0].date;
          const last = run.dates[run.dates.length - 1].date;
          const span = first === last ? fmt(first, { month: "short", day: "numeric" }) : `${fmt(first, { month: "short", day: "numeric" })} – ${fmt(last, { month: "short", day: "numeric" })}`;
          const tour = run.dates.length > 1;
          return (
            <section key={first + ri} className="px-6 pt-8">
              <div className="flex items-baseline justify-between gap-3 pb-2">
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="text-[11px] font-bold tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0" style={tour ? { background: `${accent}26`, color: accent } : { background: "#222", color: "rgba(255,255,255,0.6)" }}>{tour ? "TOUR" : "SINGLE"}</span>
                  <span className="text-[13px] font-semibold tracking-[0.08em] text-white/55 truncate" style={{ fontFamily: SCENE_FONT }}>{span.toUpperCase()}</span>
                </span>
                {tour && <span className="text-[13px] text-white/45 shrink-0">{run.dates.length} dates</span>}
              </div>
              {run.dates.map((g, i) => {
                const prev = run.dates[i - 1];
                const gap = prev ? daysBetween(prev.date, g.date) : 0;
                const moving = prev && gap > 0 && cityOf(prev) && cityOf(g) && cityOf(prev) !== cityOf(g);
                const from = prev ? where(prev) : "";
                const to = where(g);
                const drive = moving && from && to
                  ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`
                  : "";
                const open = openBy[g.share_token] || 0;
                const isToday = g.date === localISO();
                return (
                  <div key={g.share_token}>
                    {prev && gap > 0 && (
                      <div className="flex items-center gap-2 pl-[64px] py-1.5 text-[12.5px] text-white/45">
                        {gap > 1 && <span>{gap - 1} {gap - 1 === 1 ? "day" : "days"} off{drive ? " ·" : ""}</span>}
                        {drive && (
                          <a href={drive} target="_blank" rel="noopener noreferrer" className="underline decoration-white/25 underline-offset-2 text-white/60 hover:text-white">
                            Drive to {g.city || g.venue}
                          </a>
                        )}
                      </div>
                    )}
                    <button type="button" onClick={() => onOpen?.(g)} className="w-full flex items-center gap-4 min-h-[64px] border-b border-[#1f1f1f] text-left active:bg-[#121212]">
                      <span className="w-12 shrink-0 flex flex-col items-start">
                        <span className="text-[11px] text-white/45">{fmt(g.date, { weekday: "short" })}</span>
                        <span className="text-[26px] leading-none font-bold" style={{ fontFamily: SCENE_FONT, color: isToday ? accent : "#fff" }}>{fmt(g.date, { day: "numeric" })}</span>
                      </span>
                      <span className="flex-1 min-w-0 flex flex-col">
                        <span className="text-[16px] font-semibold text-white truncate">{g.city || eventTitle(g)}</span>
                        <span className="text-[13px] text-white/50 truncate">{[g.venue, g.city ? eventTitle(g) : null].filter(has).filter((v, k, a) => a.indexOf(v) === k).join(" · ")}</span>
                      </span>
                      {!loading && tracked.has(g.share_token) && (
                        <span className="text-[13px] font-semibold shrink-0" style={{ color: open ? "#FF8A3D" : "#8CFF3D" }}>{open ? `${open} open` : "Ready"}</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-white/35 shrink-0" />
                    </button>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
