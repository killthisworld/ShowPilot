import React from "react";
import BandSettingsDrawer from "@/components/showpilot/BandSettingsDrawer";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import { usePreferences } from "@/hooks/usePreferences";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { SCENE_FONT } from "@/lib/sceneStyle";

// The company phone's "Me" tab: your profile and settings as a full page
// (it used to slide over from the left). Same panel as the desktop rail's
// settings drawer, so both stay in step.
export default function MePage() {
  const { preferences, reload } = usePreferences();
  const style = getAccountTypeStyle(preferences?.account_type);
  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-32">
      <div className="max-w-lg mx-auto">
        <div className="px-5 pt-[22px]">
          <h1 className="m-0 text-[34px] font-bold tracking-[0.04em] leading-none text-white" style={{ fontFamily: SCENE_FONT }}>ME</h1>
          <div className="flex items-center gap-1.5 mt-1 text-[13px] text-white/60" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: style.color }} />
            <span>{style.label}</span>
          </div>
        </div>
        {preferences && <BandSettingsDrawer page preferences={preferences} onPreferencesUpdate={reload} />}
      </div>
      <BandBottomTabs />
    </div>
  );
}
