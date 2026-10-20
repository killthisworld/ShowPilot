import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

// `color` (optional) gives the section its profile color: a colored outline and
// a tinted header, like the sections on the shared event page (Venue is blue,
// Performer red, Audio / Lighting green). Without it the section stays neutral.
export default function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false, badge, color }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-2xl overflow-hidden ${color ? "border-2" : "bg-[#161616] border border-[#222]"}`}
      style={color ? { borderColor: color, background: "#161616" } : undefined}
    >
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between p-4 text-left transition-colors ${color ? "" : "hover:bg-[#1a1a1a]"}`}
        style={color ? { backgroundColor: color + "14" } : undefined}
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-5 h-5" style={{ color: color || "#8CFF3D" }} />}
          <span className={color ? "font-semibold" : "text-white font-medium"} style={color ? { color } : undefined}>{title}</span>
          {badge != null && (
            <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 border-t" style={{ borderColor: color ? color + "33" : "#222" }}>{children}</div>}
    </div>
  );
}
