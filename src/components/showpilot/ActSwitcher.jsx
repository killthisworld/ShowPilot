import React from "react";
import { useActs, pickAct } from "@/lib/acts";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";

// The act chips across the top of Calendar, Dates and Needs me (job 73,
// "one act vs many" stage 2). Shows only for accounts managing more than one
// act; one-act accounts never see it.
export default function ActSwitcher({ className = "" }) {
  const { multi, acts, current } = useActs();
  if (!multi) return null;
  const color = ACCOUNT_TYPE_STYLES.band?.color || "#F87171";
  const chip = (name, label, photo) => {
    const on = (current || "") === name;
    return (
      <button key={name || "all"} type="button" role="tab" aria-selected={on} onClick={() => pickAct(name)}
        className="shrink-0 h-10 pl-1.5 pr-3.5 rounded-full border flex items-center gap-2 text-[14px] font-semibold"
        style={on ? { background: color, borderColor: color, color: "#0d0d0d" } : { borderColor: "#2e2e2e", background: "#141414", color: "rgba(255,255,255,0.8)" }}>
        {photo !== undefined && (
          <span className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: on ? "#0d0d0d33" : "#262626", color: on ? "#0d0d0d" : color }}>
            {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : label.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className={photo === undefined ? "pl-2" : ""}>{label}</span>
      </button>
    );
  };
  return (
    <div role="tablist" aria-label="Which act" className={`flex gap-2 overflow-x-auto no-scrollbar ${className}`} style={{ fontFamily: "Inter, system-ui, sans-serif", scrollbarWidth: "none" }}>
      {chip("", "All acts")}
      {acts.map((a) => chip(a.name, a.name, a.photo_url))}
    </div>
  );
}
