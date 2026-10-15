import React from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarDays, PlaneTakeoff, Lightbulb } from "lucide-react";
import { SCENE_FONT } from "@/lib/sceneStyle";
import SettingsDrawer from "@/components/showpilot/SettingsDrawer";

// The tech desktop rail (1024px+), on every audio / lighting page:
// profile photo (settings) on top, then Home (audio "Console", lighting
// "Desk"), Calendar and Cockpit, and the Show Pilot logo (About) at the
// bottom. The phone keeps the bottom tab bar.

const ConsoleIcon = (props) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M4 21V14M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </svg>
);

export default function TechRail({ accent = "#8CFF3D", preferences, onPreferencesUpdate, className = "" }) {
  const { pathname } = useLocation();
  const lighting = preferences?.account_type === "lighting";
  const tabs = [
    { to: "/", label: lighting ? "Desk" : "Console", Icon: lighting ? Lightbulb : ConsoleIcon, on: pathname === "/" || pathname.startsWith("/show/") },
    { to: "/calendar", label: "Calendar", Icon: CalendarDays, on: pathname.startsWith("/calendar") },
    { to: "/experience", label: "Cockpit", Icon: PlaneTakeoff, on: pathname.startsWith("/experience") || pathname.startsWith("/logbook") },
  ];
  return (
    <nav aria-label="Main" className={`w-[84px] shrink-0 flex flex-col items-center gap-1.5 py-[18px] border-r border-[#1a1a1a] bg-[#0d0d0d] ${className}`} style={{ fontFamily: SCENE_FONT }}>
      <div className="mb-3.5">
        <SettingsDrawer preferences={preferences} onPreferencesUpdate={onPreferencesUpdate} avatar accent={accent} />
      </div>
      {tabs.map(({ to, label, Icon, on }) => (
        <Link
          key={to}
          to={to}
          aria-current={on ? "page" : undefined}
          className={`w-16 pt-2.5 pb-2 rounded-[10px] flex flex-col items-center gap-1 transition-colors ${on ? "" : "text-white/55 hover:text-white/85 hover:bg-white/5"}`}
          style={on ? { color: accent, background: accent + "1a" } : undefined}
        >
          <Icon className="w-5 h-5" />
          <span className="text-[13px] font-bold tracking-[0.04em]">{label}</span>
        </Link>
      ))}
      <Link to="/about" aria-label="About Show Pilot" className="mt-auto w-11 h-11 rounded-[11px] overflow-hidden shrink-0 ring-1 ring-[#8CFF3D]/40 hover:ring-[#8CFF3D] transition-shadow">
        <img src="/icon-192.png" alt="Show Pilot" width={44} height={44} className="w-full h-full object-cover" />
      </Link>
    </nav>
  );
}
