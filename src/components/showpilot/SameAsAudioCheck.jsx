import React from "react";
import { Check } from "lucide-react";

// "Same as audio engineer" next to the Lighting crew spot (job 205): the audio
// engineer is also running lights. Stored as engineer_info.lighting.same_as_audio.
// subtle (job 207): a small, muted version for the phone's Engineers on call.
export default function SameAsAudioCheck({ checked, onChange, disabled = false, label = "Same as audio engineer", color = "#8CFF3D", subtle = false }) {
  if (subtle) {
    return (
      <label className={`inline-flex items-center gap-1.5 select-none ${disabled ? "" : "cursor-pointer"}`}>
        <input type="checkbox" className="sr-only" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
        <span
          aria-hidden="true"
          className="w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0"
          style={{ borderColor: checked ? color + "80" : "rgba(255,255,255,0.22)" }}
        >
          {checked && <Check className="w-2.5 h-2.5" style={{ color }} strokeWidth={3} />}
        </span>
        <span className="text-[11.5px] text-white/40">{label}</span>
      </label>
    );
  }
  return (
    <label className={`inline-flex items-center gap-2 select-none ${disabled ? "opacity-70" : "cursor-pointer"}`}>
      <input type="checkbox" className="sr-only" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span
        aria-hidden="true"
        className="w-5 h-5 rounded-[5px] border flex items-center justify-center shrink-0"
        style={checked ? { borderColor: color, background: color } : { borderColor: "rgba(255,255,255,0.3)" }}
      >
        {checked && <Check className="w-3.5 h-3.5 text-[#0d0d0d]" strokeWidth={3} />}
      </span>
      <span className="text-[13px] text-white/75">{label}</span>
    </label>
  );
}

// Is the lighting spot covered by the audio engineer?
export const lightingSameAsAudio = (engineerInfo) => !!engineerInfo?.lighting?.same_as_audio;
