import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, CalendarDays, PlaneTakeoff, Zap, MessageCircle, Plus } from "lucide-react";
import BandSettingsDrawer from "@/components/showpilot/BandSettingsDrawer";
import QuickAddSheet from "@/components/showpilot/QuickAddSheet";
import { usePreferences } from "@/hooks/usePreferences";
import useIsDesktop from "@/hooks/useIsDesktop";
import useNeedsMe from "@/hooks/useNeedsMe";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { SCENE_FONT } from "@/lib/sceneStyle";
import { vocab, openQuickAdd } from "@/lib/needsMe";

// Desktop rail destinations (unchanged).
const TABS = [
  { path: "/", label: "Home", icon: Home },
  { path: "/band/calendar", label: "Calendar", icon: CalendarDays },
  { path: "/experience", label: "Cockpit", icon: PlaneTakeoff },
];

// Phones: the company phone layout's bottom bar - Needs me / Events / + /
// Chats / Me, with "+" (quick-add a task) in the middle on every screen.
// Events opens the banner calendar; an event's web opens from there. Me is
// your profile and settings (job 67).
// Desktop (1024px+): a slim left rail with Home / Calendar / Cockpit plus
// settings, and <body> is tagged so the page shifts over to make room (see
// index.css).
export default function BandBottomTabs() {
  const { pathname, search } = useLocation();
  const { preferences, reload } = usePreferences();
  const isDesktop = useIsDesktop();
  const isActive = (tab) => (tab.path === "/" ? pathname === "/" : pathname.startsWith(tab.path));

  useEffect(() => {
    document.body.classList.add("has-rail");
    return () => document.body.classList.remove("has-rail");
  }, []);

  return (
    <>
      {!isDesktop && <CompanyPhoneBar preferences={preferences} pathname={pathname} search={search} />}

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

function CompanyPhoneBar({ preferences, pathname, search }) {
  const { reload } = usePreferences();
  const accent = getAccountTypeStyle(preferences?.account_type).color;
  const words = vocab(preferences?.account_type);
  const { data } = useNeedsMe();
  const unread = (data?.chats || []).reduce((n, c) => n + Number(c.unread || 0), 0);
  const v = pathname === "/" ? new URLSearchParams(search).get("view") || "needs" : null;
  const view = v === "events" ? "events" : v;
  const activeKey =
    view ||
    (pathname.startsWith("/band/calendar") ? "events" : pathname.startsWith("/gig/rooms") || pathname.startsWith("/gig/messages") ? "chats" : null);

  const tab = (key, to, label, Icon, badge) => {
    const active = activeKey === key;
    return (
      <Link
        to={to}
        aria-current={active ? "page" : undefined}
        className="relative w-16 h-[52px] flex flex-col items-center justify-center gap-[3px] text-[11px] font-semibold transition-colors"
        style={{ color: active ? accent : "rgba(255,255,255,0.55)" }}
      >
        <Icon className="w-[22px] h-[22px]" strokeWidth={2} />
        <span>{label}</span>
        {badge > 0 && (
          <span className="absolute top-0.5 right-3 min-w-[18px] h-[18px] px-[5px] rounded-full bg-[#60A5FA] text-[#0d0d0d] text-[11px] font-bold flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d]/95 backdrop-blur-lg border-t border-[#1e1e1e]"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))", fontFamily: "Inter, system-ui, sans-serif" }}
      >
        <div className="flex items-center justify-around max-w-lg mx-auto h-[68px] px-2">
          {tab("needs", "/", "Needs me", Zap)}
          {tab("events", "/band/calendar", words.events, CalendarDays)}
          <button
            onClick={openQuickAdd}
            aria-label="Quick-add a task"
            className="w-[60px] h-[60px] -mt-[26px] rounded-full flex items-center justify-center shrink-0"
            style={{ background: accent, color: "#0d0d0d", boxShadow: `0 6px 20px ${accent}59` }}
          >
            <Plus className="w-7 h-7" strokeWidth={3} />
          </button>
          {tab("chats", "/?view=chats", "Chats", MessageCircle, unread)}
          <BandSettingsDrawer preferences={preferences} onPreferencesUpdate={reload} tab accent={accent} />
        </div>
      </nav>
      <QuickAddSheet preferences={preferences} accent={accent} />
    </>
  );
}
