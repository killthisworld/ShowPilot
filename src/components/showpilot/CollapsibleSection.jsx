import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false, badge }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-[#161616] rounded-2xl border border-[#222] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[#1a1a1a] transition-colors"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-5 h-5 text-[#8CFF3D]" />}
          <span className="text-white font-medium">{title}</span>
          {badge != null && (
            <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full">{badge}</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 border-t border-[#222]">{children}</div>}
    </div>
  );
}
