import React from "react";
import EventBarPhoto from "@/components/showpilot/EventBarPhoto";
import { SCENE_MONO } from "@/lib/sceneStyle";

// How company profiles (venue, manager/artist) see
// an event on their home: a ticket. Audio sees channel strips and lighting
// its desk; this is the company side's own shape (job 71).
//
// A stub on the left holds the date, tinted in the event's color; a dashed
// perforation separates it from the body, with a half-circle notch cut out
// of the top and bottom edges where you'd tear it. The body takes whatever
// the screen needs (title, venue, progress, buttons).
export default function TicketCard({
  color,
  date, // "YYYY-MM-DD" or null
  photo,
  onClick,
  dim = false,
  stubWidth = 66,
  notch = 8,
  compact = false,
  shadow = true,
  className = "",
  ariaLabel,
  children,
}) {
  const d = date ? new Date(date + "T00:00:00") : null;
  const cut = (y) => `radial-gradient(circle at ${stubWidth}px ${y}, transparent ${notch}px, #000 ${notch + 0.5}px)`;
  const mask = `${cut("0")}, ${cut("100%")}`;
  const clickable = !!onClick;
  return (
    // The drop shadow sits on a wrapper so it follows the cut-out shape
    // (a box-shadow on the masked ticket itself would be cut off).
    <div className={className} style={{ filter: shadow ? "drop-shadow(0 6px 10px rgba(0,0,0,0.45))" : undefined }}>
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
      className={`relative flex items-stretch rounded-[10px] bg-[#151515] border border-[#262626] ${clickable ? "cursor-pointer hover:bg-[#191919]" : ""} transition-colors`}
      style={{
        WebkitMaskImage: mask, maskImage: mask,
        WebkitMaskComposite: "source-in", maskComposite: "intersect",
        opacity: dim ? 0.7 : 1,
      }}
    >
      <div
        className="shrink-0 flex flex-col items-center justify-center rounded-l-[10px]"
        style={{ width: stubWidth, background: `linear-gradient(160deg, ${color}38, ${color}14)`, color, fontFamily: SCENE_MONO }}
      >
        {d ? (
          <>
            <span className={compact ? "text-[9px] tracking-[0.12em]" : "text-[10px] tracking-[0.14em]"}>{d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</span>
            <span className={`${compact ? "text-[20px]" : "text-[28px]"} font-bold leading-none text-white`} style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{d.getDate()}</span>
            <span className={compact ? "text-[9px] tracking-[0.12em]" : "text-[10px] tracking-[0.14em]"}>{d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
          </>
        ) : (
          <span className="text-[10px] tracking-[0.1em] text-white/60 text-center px-1">NO DATE</span>
        )}
      </div>
      <span
        aria-hidden="true"
        className="absolute"
        style={{ left: stubWidth - 1, top: notch + 3, bottom: notch + 3, borderLeft: "2px dashed rgba(255,255,255,0.2)" }}
      />
      <div className={`relative isolate overflow-hidden flex-1 min-w-0 rounded-r-[10px] ${compact ? "px-2.5 py-2" : "pl-4 pr-3.5 py-3"}`}>
        {/* The event's photo across the ticket body (job 73: clearly
            visible, not a faint wash), with a scrim so the text stays
            readable on any image. */}
        <EventBarPhoto url={photo} opacity={0.6} />
        {photo && (
          <span aria-hidden="true" className="absolute inset-0 -z-10 pointer-events-none" style={{ background: "linear-gradient(90deg, rgba(21,21,21,0.92) 0%, rgba(21,21,21,0.55) 55%, rgba(21,21,21,0.15) 100%)" }} />
        )}
        {children}
      </div>
    </div>
    </div>
  );
}
