import React from "react";
import { useSearchParams } from "react-router-dom";
import BandSettingsDrawer from "@/components/showpilot/BandSettingsDrawer";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import Cockpit from "@/pages/Experience";
import { usePreferences } from "@/hooks/usePreferences";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { SCENE_FONT } from "@/lib/sceneStyle";

// The company phone's "Me" tab: a full page (it used to slide over from the
// left) with two sections:
//   Profile - your profile and settings, the same panel as the desktop
//             rail's settings drawer, so both stay in step.
//   Cockpit - the Cockpit's phone screens: digital card, Fellow Pilots
//             wallets and Logbook (desktop keeps its own Cockpit tab).
// /me?section=cockpit opens straight on the Cockpit (add &tab=logbook or
// &tab=fellow for those).
const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "cockpit", label: "Cockpit" },
];

export default function MePage() {
  const { preferences, reload } = usePreferences();
  const [params, setParams] = useSearchParams();
  const section = params.get("section") === "cockpit" ? "cockpit" : "profile";
  const style = getAccountTypeStyle(preferences?.account_type);
  const accent = style.color;

  const pick = (id) => {
    if (id === section) return;
    setParams(id === "cockpit" ? { section: "cockpit" } : {}, { replace: true });
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-32">
      <div className="max-w-lg mx-auto">
        <div className="px-5 pt-[22px]">
          <h1 className="m-0 text-[34px] font-bold tracking-[0.04em] leading-none text-white" style={{ fontFamily: SCENE_FONT }}>ME</h1>
          <div className="flex items-center gap-1.5 mt-1 text-[13px] text-white/60" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
            <span>{style.label}</span>
          </div>
        </div>

        <div role="tablist" aria-label="Me sections" className="mx-5 mt-4 grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#161616] border border-[#262626]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
          {SECTIONS.map((s) => {
            const on = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pick(s.id)}
                className="h-11 rounded-[9px] text-[15px] transition-colors"
                style={on ? { background: accent, color: "#0d0d0d", fontWeight: 700 } : { color: "rgba(255,255,255,0.65)", fontWeight: 600 }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {section === "cockpit" ? (
        <div className="mt-1">
          <Cockpit embedded />
        </div>
      ) : (
        <div className="max-w-lg mx-auto">
          {preferences && <BandSettingsDrawer page preferences={preferences} onPreferencesUpdate={reload} />}
        </div>
      )}
      <BandBottomTabs />
    </div>
  );
}
