import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import useBookings, { fmtDay } from "@/lib/useBookings";
import { wantsLine } from "@/lib/bookingPackage";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// The Bookings group on Needs me (job 246): a venue's new packages to answer,
// and a sender's packages with dates to pick. Nothing shows when nothing's
// waiting on you. Rows open the package; "All bookings" opens the pipeline.
const RED = "#F87171";
const BLUE = "#60A5FA";

export default function BookingsNeeds() {
  const { data } = useBookings();
  const rows = data?.needs || [];
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-2.5 px-5 mb-4">
      <div className="flex items-center text-sm font-bold tracking-[0.08em] text-white/55 px-0.5" style={{ fontFamily: SCENE_FONT }}>
        BOOKINGS
        <Link to="/bookings" className="ml-auto min-h-[32px] flex items-center text-[11px] tracking-[0.1em] text-white/60 hover:text-white" style={{ fontFamily: SCENE_MONO }}>ALL BOOKINGS ›</Link>
      </div>
      <div className="rounded-xl bg-[#151515] border border-[#262626] overflow-hidden divide-y divide-[#222]">
        {rows.map((p) => {
          const venueSide = p.side === "venue";
          const sub = venueSide
            ? [p.sender_name, wantsLine(p.wants) && `wants ${wantsLine(p.wants)}`].filter(Boolean).join(" · ")
            : `${(p.offers || []).length} date${(p.offers || []).length === 1 ? "" : "s"} offered${(p.offers || [])[0] ? ` · ${fmtDay(p.offers[0].date)}${p.offers.length > 1 ? " +" : ""}` : ""}`;
          return (
            <Link key={`${p.side}-${p.code}`} to={p.href} className="w-full flex items-center gap-3 px-3 py-3 text-left bg-[#121212] active:bg-[#1a1a1a] min-h-[64px]">
              <span className="w-10 h-10 rounded-full shrink-0 overflow-hidden border-2" style={{ borderColor: RED, background: "#2a1c1c" }}>
                {p.photo_url && <img src={p.photo_url} alt="" className="w-full h-full object-cover" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-white truncate">{p.act_name || "A booking package"}</span>
                <span className="block text-[12.5px] text-white/60 truncate">{sub}</span>
              </span>
              <span className="shrink-0 text-[10px] font-bold tracking-[0.1em] px-2 py-1 rounded" style={{ fontFamily: SCENE_MONO, color: venueSide ? BLUE : RED, background: (venueSide ? BLUE : RED) + "1f" }}>
                {venueSide ? "ANSWER" : "PICK DATE"}
              </span>
              <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// One row under the Calendar's header (job 246): dates you've been offered or
// have offered, as holds, and a way into Bookings. Hidden with nothing open.
export function BookingsCalendarRow({ className = "" }) {
  const { data } = useBookings();
  const holds = [
    ...(data?.sent || []).filter((p) => p.status === "offered").flatMap((p) => (p.offers || []).map((o) => ({ date: o.date, act: p.act_name, mine: true }))),
    ...(data?.incoming || []).filter((p) => p.status === "offered").flatMap((p) => (p.offers || []).map((o) => ({ date: o.date, act: p.act_name, mine: false }))),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const waiting = (data?.needs || []).length;
  if (!holds.length && !waiting) return null;
  return (
    <Link to="/bookings" className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed min-h-[52px] ${className}`} style={{ borderColor: `${RED}77`, background: "#141010" }}>
      <span className="text-[10.5px] font-bold tracking-[0.12em] shrink-0" style={{ fontFamily: SCENE_MONO, color: RED }}>BOOKINGS</span>
      <span className="flex-1 min-w-0 flex gap-1.5 overflow-hidden">
        {holds.slice(0, 4).map((h, i) => (
          <span key={i} className="shrink-0 text-[12px] px-2 py-0.5 rounded-full border border-dashed text-white/80" style={{ borderColor: `${RED}66` }}>{fmtDay(h.date)} · {h.act}</span>
        ))}
        {!holds.length && <span className="text-[13px] text-white/70 truncate">{waiting} waiting on you</span>}
      </span>
      {waiting > 0 && <span className="shrink-0 min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center text-[#0d0d0d]" style={{ background: RED }}>{waiting}</span>}
      <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
    </Link>
  );
}
