import React from "react";
import { sceneAccent, sceneDate, sceneTitle, SCENE_MONO } from "@/lib/sceneStyle";

// One cue pad in the lighting profile's grid. Tapping loads it into the
// GO bar; GO (in Home.jsx) is what opens the show.
export default function CuePad({ show, selected, onSelect }) {
  const accent = sceneAccent(show);
  return (
    <button
      type="button"
      onClick={() => onSelect(show)}
      className="relative h-28 rounded-lg overflow-hidden flex flex-col text-left text-white"
      style={{
        background: selected ? "rgba(140,255,61,0.10)" : "#141414",
        border: `1px solid ${selected ? "#8CFF3D" : "#262626"}`,
        boxShadow: selected ? "0 0 0 1px #8CFF3D" : "none",
      }}
    >
      <span className="block w-full h-[5px] shrink-0" style={{ background: accent }} />
      <div className="px-2 pt-1.5 pb-2 flex flex-col flex-1 min-h-0 w-full">
        <span className="text-[16px] font-semibold leading-[1.1] line-clamp-3">{sceneTitle(show)}</span>
        <span className="mt-auto text-[10px] text-white/60" style={{ fontFamily: SCENE_MONO }}>{sceneDate(show)}</span>
      </div>
    </button>
  );
}
