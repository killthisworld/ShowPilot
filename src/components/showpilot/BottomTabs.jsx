import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, CalendarDays, Briefcase } from "lucide-react";

const TABS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/calendar", label: "Calendar", icon: CalendarDays },
  { path: "/experience", label: "Cockpit", icon: Briefcase },
];

export default function BottomTabs() {
  const { pathname } = useLocation();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d]/95 backdrop-blur-lg border-t border-[#1e1e1e]">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16 px-4">
        {TABS.map((tab) => {
          const active = tab.path === "/" ? pathname === "/" : pathname.startsWith(tab.path);
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
  );
}
