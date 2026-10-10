import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, CalendarDays, PlaneTakeoff } from "lucide-react";
import BandSettingsDrawer from "@/components/showpilot/BandSettingsDrawer";
import { usePreferences } from "@/hooks/usePreferences";
import { SCENE_FONT } from "@/lib/sceneStyle";

const TABS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/band/calendar", label: "Calendar", icon: CalendarDays },
  { path: "/experience", label: "Cockpit", icon: PlaneTakeoff },
];

// Phones: the bottom tab bar. Desktop (1024px+): a slim left rail with the
// same three destinations plus settings, and <body> is tagged so the page
// shifts over to make room (see index.css).
export default function BandBottomTabs() {
  const { pathname } = useLocation();
  const { preferences, reload } = usePreferences();
  const isActive = (tab) => (tab.path === "/" ? pathname === "/" : pathname.startsWith(tab.path));

  useEffect(() => {
    document.body.classList.add("has-rail");
    return () => document.body.classList.remove("has-rail");
  }, []);

  return (
    <>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d]/95 backdrop-blur-lg border-t border-[#1e1e1e] pb-3">
        <div className="flex items-center justify-around max-w-lg mx-auto h-16 px-4">
          {TABS.map((tab) => {
            const active = isActive(tab);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`flex flex-col items-center gap-1 px-4 py-1 transition-colors ${
                  active ? "text-[#8CFF3D]" : "text-white/40 hover:text-white/60"
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <nav className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[84px] z-50 flex-col items-center py-[18px] gap-1.5 bg-[#0d0d0d] border-r border-[#1a1a1a]" style={{ fontFamily: SCENE_FONT }}>
        {/* Settings, shown as the person's own profile photo. */}
        <div className="mb-3.5 flex flex-col items-center gap-1">
          <BandSettingsDrawer preferences={preferences} onPreferencesUpdate={reload} avatar />
        </div>
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`w-16 pt-2.5 pb-2 rounded-[10px] flex flex-col items-center gap-1 transition-colors ${
                active ? "text-[#8CFF3D] bg-[#8CFF3D]/10" : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-xs font-semibold tracking-[0.04em]">{tab.label}</span>
            </Link>
          );
        })}
        {/* The Show Pilot logo (same art as the app icon) opens About. */}
        <Link to="/about" aria-label="About Show Pilot" className="mt-auto w-11 h-11 rounded-[11px] overflow-hidden shrink-0 ring-1 ring-[#8CFF3D]/40 hover:ring-[#8CFF3D] transition-shadow">
          <img src="/icon-192.png" alt="Show Pilot" width={44} height={44} className="w-full h-full object-cover" />
        </Link>
      </nav>
    </>
  );
}
