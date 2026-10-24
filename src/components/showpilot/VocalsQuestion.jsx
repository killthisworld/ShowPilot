import React from "react";

// "Vocals" Yes / No for one member on the intake forms (job 152). Easier than
// adding vocals as an instrument. "Yes" keeps a Vocals mic line in the member's
// instruments (so the engineer's input list and show page get it like any
// other input), "No" takes it out. member.vocals records the answer.

const VOCAL_NAME = /^(lead |backing |background |back )?(vocals?|vox|voice)$/i;
export const isVocalInput = (inst) => !!inst && (inst.vocals === true || VOCAL_NAME.test(String(inst.name || "").trim()));

// The member's answer: an explicit yes / no, else yes when a vocal line is already there.
export function memberSings(member, instruments) {
  if (member?.vocals === true || member?.vocals === false) return member.vocals;
  return instruments.some(isVocalInput) ? true : null;
}

// The member with vocals set to yes / no (instruments updated to match).
export function setMemberVocals(member, instruments, yes) {
  const rest = instruments.filter((inst) => !isVocalInput(inst));
  const existing = instruments.find(isVocalInput);
  const next = yes ? [existing || { name: "Vocals", mic_di: "Mic", phantom_power: false, vocals: true }, ...rest] : rest;
  return { ...member, vocals: yes, instruments: next };
}

export default function VocalsQuestion({ value, onChange }) {
  const btn = (on, color) =>
    `h-8 px-3.5 rounded-lg text-xs font-semibold border transition-all ${on ? color : "border-[#333] text-white/40 hover:text-white/60"}`;
  return (
    // "Vocals" sits right beside its Yes / No (job 155).
    <div className="flex items-center gap-2" role="group" aria-label="Vocals">
      <span className="text-white/60 text-sm mr-1">Vocals</span>
      <button type="button" aria-pressed={value === true} onClick={() => onChange(true)} className={btn(value === true, "border-[#8CFF3D]/50 text-[#8CFF3D] bg-[#8CFF3D]/10")}>Yes</button>
      <button type="button" aria-pressed={value === false} onClick={() => onChange(false)} className={btn(value === false, "border-white/40 text-white bg-white/10")}>No</button>
    </div>
  );
}
