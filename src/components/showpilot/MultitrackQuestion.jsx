import React from "react";

// "Additional Services" box on the Performer Intake and Opener Set Info
// forms, shown when the engineer turned it on for that link. value is
// true / false / null (not answered); tapping the chosen answer clears it.
export default function MultitrackQuestion({ value, onChange }) {
  return (
    <div className="bg-[#111] rounded-2xl p-4">
      <p className="text-white/50 text-xs">Additional Services <span className="text-white/30">(optional)</span></p>
      <p className="text-white text-sm font-semibold mt-2">Interested in getting your set multi-track recorded?</p>
      <p className="text-white/40 text-xs mt-1">No payment now. This just gives the engineer a heads-up so you can talk details at the event.</p>
      <div className="grid grid-cols-2 gap-2 mt-3" role="radiogroup" aria-label="Multi-track recording">
        {[[true, "Yes"], [false, "No"]].map(([v, text]) => {
          const on = value === v;
          return (
            <button
              key={text}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? null : v)}
              className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${on ? "border-[#8CFF3D]/60 bg-[#8CFF3D]/10 text-[#8CFF3D]" : "border-[#2a2a2a] text-white/60 hover:text-white"}`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Small "Multi-track: Yes / No / No answer" chip for Manage Links.
export function MultitrackChip({ value, small = false }) {
  const yes = value === true;
  const text = yes ? "Multi-track: Yes" : value === false ? "Multi-track: No" : "Multi-track: —";
  return (
    <span
      title={yes ? "Interested in getting their set multi-track recorded. Talk details at the event." : value === false ? "Not interested in multi-track recording." : "Didn't answer the multi-track question."}
      className={`${small ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-1"} font-bold uppercase tracking-wide rounded-full whitespace-nowrap shrink-0 ${yes ? "bg-[#8CFF3D]/15 text-[#8CFF3D]" : "bg-white/10 text-white/40"}`}
    >
      {text}
    </span>
  );
}
