import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, CalendarDays, PlaneTakeoff, MessageCircle } from "lucide-react";
import useIsDesktop from "@/hooks/useIsDesktop";
import { usePreferences } from "@/hooks/usePreferences";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import TechRail from "@/components/showpilot/TechRail";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import { isCompanyType, visibleChats } from "@/lib/needsMe";
import useNeedsMe from "@/hooks/useNeedsMe";

const TABS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/calendar", label: "Calendar", icon: CalendarDays },
  // Chats, like the company phone bar (job 121); shows how many are unread.
  { path: "/chats", label: "Chats", icon: MessageCircle, unread: true },
  { path: "/experience", label: "Cockpit", icon: PlaneTakeoff },
];

// Tech profiles (audio / lighting). Phone: the bottom tab bar.
// Desktop (1024px+): the left rail instead, and <body> is tagged so the page
// shifts right to make room (index.css). `railOnly`: pages that never had
// the phone tab bar (e.g. the show page) still get the rail on desktop.
export default function BottomTabs({ railOnly = false }) {
  const { pathname } = useLocation();
  const isDesktop = useIsDesktop();
  const { preferences, reload } = usePreferences();

  // Pages shared with company profiles (Linked, Archived...) give a company
  // account its own rail on desktop.
  const company = isCompanyType(preferences?.account_type);

  useEffect(() => {
    if (!isDesktop || company) return undefined;
    document.body.classList.add("has-rail");
    return () => document.body.classList.remove("has-rail");
  }, [isDesktop, company]);

  if (isDesktop && company) return <BandBottomTabs />;
  if (isDesktop) {
    return (
      <TechRail
        className="fixed left-0 top-0 bottom-0 z-50"
        accent={getAccountTypeStyle(preferences?.account_type).color}
        preferences={preferences}
        onPreferencesUpdate={reload}
      />
    );
  }
  if (railOnly) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d]/95 backdrop-blur-lg border-t border-[#1e1e1e] pb-3">
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
              <span className="relative">
                <tab.icon className="w-5 h-5" />
                {tab.unread && <UnreadDot />}
              </span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Unread chats across your events, on the Chats tab.
function UnreadDot() {
  const { data } = useNeedsMe();
  const n = visibleChats(data?.chats).reduce((sum, c) => sum + Number(c.unread || 0), 0);
  if (!n) return null;
  return (
    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-[#0d0d0d]" style={{ background: "#8CFF3D" }}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
