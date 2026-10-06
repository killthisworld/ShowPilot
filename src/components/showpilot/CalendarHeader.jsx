import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import StatusStrip from "@/components/showpilot/StatusStrip";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { eventTypeColor } from "@/lib/eventTypes";

// Console-style header shared by the tech and non-tech calendars: month
// title with arrow keys, a readout strip for the month, and a legend of the
// event types that actually appear in it (same colors as the home bars).
export default function CalendarHeader({ monthLabel, onPrev, onNext, cells, types = [] }) {
  const arrow = "h-9 w-9 flex items-center justify-center rounded-lg bg-[#111] border border-[#1f1f1f] text-white/60 hover:text-white";
  return (
    <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
      <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
        <button type="button" onClick={onPrev} className={arrow} aria-label="Previous month"><ChevronLeft className="w-5 h-5" /></button>
        <h2 className="text-white text-2xl font-semibold tracking-[0.08em] uppercase" style={{ fontFamily: SCENE_FONT }}>{monthLabel}</h2>
        <button type="button" onClick={onNext} className={arrow} aria-label="Next month"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="px-4 pb-2 max-w-lg mx-auto"><StatusStrip cells={cells} /></div>
      {types.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 pb-2.5 max-w-lg mx-auto flex-wrap">
          {types.map((t) => {
            const c = eventTypeColor(t);
            return (
              <span key={t} className="text-[8.5px] tracking-[0.08em] px-[6px] py-[2px] rounded-[3px]" style={{ fontFamily: SCENE_MONO, color: c, background: c + "1f" }}>
                {t.toUpperCase()}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
