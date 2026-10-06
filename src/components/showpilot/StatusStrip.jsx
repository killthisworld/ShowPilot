import React from "react";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Console-style readout: three big mono numbers with tiny labels.
export default function StatusStrip({ cells }) {
  if (!cells?.length) return null;
  return (
    <div className="flex bg-[#111111] border border-[#1f1f1f] rounded-[10px] overflow-hidden">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex-1 min-w-0 px-2.5 pt-[7px] pb-2 ${i < cells.length - 1 ? "border-r border-[#1c1c1c]" : ""}`}>
          <div className="text-[9px] tracking-[0.12em] text-white/45 whitespace-nowrap truncate" style={{ fontFamily: SCENE_MONO }}>{c.label}</div>
          <div className="text-lg font-semibold mt-0.5" style={{ fontFamily: SCENE_MONO, color: c.color }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}
