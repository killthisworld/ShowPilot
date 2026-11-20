import React from "react";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Console-style readout: three big mono numbers with tiny labels.
// Every number reads in Show Pilot green (Jay, 2026-10-21, job 114); a cell's
// own `color` is no longer used for the value.
const VALUE_COLOR = "#8CFF3D";

export default function StatusStrip({ cells }) {
  if (!cells?.length) return null;
  return (
    <div className="flex bg-[#111111] border border-[#1f1f1f] rounded-[10px] overflow-hidden">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex-1 min-w-0 flex flex-col px-2.5 pt-[7px] pb-2 ${i < cells.length - 1 ? "border-r border-[#1c1c1c]" : ""}`}>
          {/* The whole label shows, on two lines if it needs them; values line up at the bottom (job 382). */}
          <div className="text-[9px] leading-tight tracking-[0.08em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{c.label}</div>
          <div className="text-lg font-semibold mt-auto pt-0.5" style={{ fontFamily: SCENE_MONO, color: VALUE_COLOR }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}
