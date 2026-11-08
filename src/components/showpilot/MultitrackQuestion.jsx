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

// The engineer's own services (job 265), asked after multi-track when the link
// includes additional services. services: [{ id, label, question }];
// answers: [{ id, label, answer }]; tapping the chosen answer clears it.
const questionOf = (s) => (s?.question || "").trim() || `Interested in ${String(s?.label || "").trim().toLowerCase()}?`;
export function ServiceQuestions({ services = [], answers = [], onChange }) {
  const list = (services || []).filter((s) => String(s?.label || "").trim());
  if (!list.length) return null;
  const valueOf = (s) => (answers || []).find((a) => (a.id && a.id === s.id) || a.label === s.label)?.answer ?? null;
  const set = (s, v) => {
    const rest = (answers || []).filter((a) => !((a.id && a.id === s.id) || a.label === s.label));
    onChange(v === null ? rest : [...rest, { id: s.id, label: s.label, answer: v }]);
  };
  return (
    <div className="flex flex-col gap-3 mt-3">
      {list.map((s) => {
        const value = valueOf(s);
        return (
          <div key={s.id || s.label} className="bg-[#111] rounded-2xl p-4">
            <p className="text-white/50 text-xs">{s.label}</p>
            <p className="text-white text-sm font-semibold mt-2">{questionOf(s)}</p>
            <div className="grid grid-cols-2 gap-2 mt-3" role="radiogroup" aria-label={s.label}>
              {[[true, "Yes"], [false, "No"]].map(([v, text]) => {
                const on = value === v;
                return (
                  <button key={text} type="button" role="radio" aria-checked={on} onClick={() => set(s, on ? null : v)}
                    className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${on ? "border-[#8CFF3D]/60 bg-[#8CFF3D]/10 text-[#8CFF3D]" : "border-[#2a2a2a] text-white/60 hover:text-white"}`}>
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Chips for the engineer's own services' answers: "Video recording: Yes".
export function ServiceChips({ answers = [], small = false }) {
  const list = (answers || []).filter((a) => a && a.label && typeof a.answer === "boolean");
  if (!list.length) return null;
  return list.map((a, i) => (
    <span key={`${a.label}-${i}`} title={a.answer ? `Interested in ${a.label}.` : `Not interested in ${a.label}.`}
      className={`${small ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-1"} font-bold uppercase tracking-wide rounded-full whitespace-nowrap shrink-0 ${a.answer ? "bg-[#8CFF3D]/15 text-[#8CFF3D]" : "bg-white/10 text-white/40"}`}>
      {a.label}: {a.answer ? "Yes" : "No"}
    </span>
  ));
}
