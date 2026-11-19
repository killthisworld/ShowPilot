import React from "react";
import { Check } from "lucide-react";

// Which act from My Templates goes on this package (job 349). Since job 352
// (Jay 2026-11-18) there's no steps page: Book a date opens straight into
// the web, and this list sits at the top of its centre circle (The act &
// your card) when there's more than one act. Picking one fills the package
// from the act and its booking template.
const RED = "#F87171";
const mono = { fontFamily: "'JetBrains Mono', monospace" };

const savedOn = (iso) => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };
const initials = (s) => String(s || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function ActPicker({ acts = [], pickedId = null, onPick }) {
  if (!acts.length) return null;
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Which act">
      <span className="text-[11px] tracking-[0.12em] text-white/55" style={mono}>WHICH ACT</span>
      {acts.map((a) => {
        const on = a.id === pickedId;
        const photo = a.data?.photo_url || "";
        return (
          <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => onPick(a.id)}
            className="min-h-[60px] rounded-[12px] border px-3 py-2 flex items-center gap-3 text-left"
            style={on ? { borderColor: RED, background: `${RED}14` } : { borderColor: "#2a2a2a", background: "#101010" }}>
            <span className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2 flex items-center justify-center text-[14px] font-bold" style={{ borderColor: RED, color: RED, background: "#1a1012" }}>
              {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : initials(a.name)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15.5px] font-bold truncate">{a.name || "Your act"}</span>
              <span className="block text-[12.5px] text-white/60 truncate">{a.booking ? `Booking template · saved ${savedOn(a.booking.saved_at)}` : "Members, stage plot, notes"}</span>
            </span>
            <span aria-hidden="true" className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={on ? { background: RED } : { border: "1.5px solid rgba(255,255,255,0.3)" }}>
              {on && <Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
