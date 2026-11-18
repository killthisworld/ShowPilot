import React from "react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { PROFILE_SHOWCASE, DJ_COLOR, EVERYONE_GETS } from "@/lib/profileShowcase";

// The "what you get" panel under a profile on the sign-up page (job 324).
// Drawn in the profile's own color. Content lives in lib/profileShowcase.js.
export default function ProfileShowcase({ role, label, color }) {
  const data = PROFILE_SHOWCASE[role];
  if (!data) return null;
  const DjIcon = data.dj?.icon;
  return (
    <div
      role="region"
      aria-label={`What ${label} includes`}
      className="mt-2 rounded-lg px-4 pt-3.5 pb-4"
      style={{ background: "#0d0d0d", border: `1.5px solid ${color}66`, boxShadow: `0 0 22px ${color}22` }}
    >
      <div className="text-[11px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color }}>
        WHAT YOU GET AS {label.toUpperCase()}
      </div>
      <p className="text-white/85 text-base leading-snug mt-1.5">{data.pitch}</p>

      {data.dj && (
        <div className="mt-3 rounded-md px-3 py-2.5 flex items-start gap-3" style={{ background: DJ_COLOR + "14", border: `1.5px solid ${DJ_COLOR}88` }}>
          <span className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: DJ_COLOR + "26" }}>
            <DjIcon className="w-[18px] h-[18px]" style={{ color: DJ_COLOR }} />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold leading-tight" style={{ color: DJ_COLOR }}>{data.dj.title}</span>
            <span className="block text-sm text-white/75 leading-snug mt-0.5">{data.dj.text}</span>
          </span>
        </div>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 mt-3.5">
        {data.items.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.title} className="flex items-start gap-2.5 min-w-0">
              <Icon className="w-[18px] h-[18px] shrink-0 mt-0.5" style={{ color }} />
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-tight text-white">{it.title}</span>
                <span className="block text-sm text-white/65 leading-snug mt-0.5">{it.text}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-white/55 leading-snug mt-4">{data.fit}</p>
      <p className="text-xs text-white/40 leading-snug mt-1.5">{EVERYONE_GETS}</p>
    </div>
  );
}
