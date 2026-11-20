import React from "react";
import { Box } from "lucide-react";
import { useLdStages } from "@/lib/ldStages";

// Which 3D stage goes out with an LD's intake link (job 400): the event's
// own stage (or the LD's stage for that venue), or one of their stages.
//   value: a stage template id, or "" for the event's stage
//   onChange(id, rig)
export default function LdStagePicker({ value = "", onChange, eventLabel = "The event's stage", color = "#FFB400" }) {
  const [stages] = useLdStages();
  const usable = (stages || []).filter((s) => s.hasRig);
  return (
    <div>
      <label className="flex items-center gap-1.5 text-white/50 text-xs"><Box className="w-3.5 h-3.5" style={{ color }} />3D stage for the act to place their members on</label>
      <select value={value} onChange={(e) => { const s = usable.find((x) => x.id === e.target.value); onChange(e.target.value, s ? s.rig : null); }}
        aria-label="3D stage for this link"
        className="mt-1 block w-full h-11 rounded-xl bg-[#111] border border-[#2a2a2a] px-3 text-white text-sm focus:outline-none [color-scheme:dark]">
        <option value="">{eventLabel}</option>
        {usable.map((s) => <option key={s.id} value={s.id}>{s.name || "Untitled stage"}</option>)}
      </select>
      {stages && !usable.length && <p className="text-white/35 text-[11px] mt-1.5">No stages yet. Build one in Rig the stage.</p>}
    </div>
  );
}
