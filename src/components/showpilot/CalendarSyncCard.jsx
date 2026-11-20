import React, { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";

// Calendars for every profile (job 411): two buttons. Connect Google Calendar
// opens Google (sign in if needed) and adds the person's private Show Pilot
// calendar - every event they create or are linked into. Connect Apple /
// Outlook does the same in Apple Calendar on an iPhone, iPad or Mac, and in
// Outlook (Microsoft sign-in) everywhere else. Their calendar app keeps
// checking it, so new and changed events show up on their own.
// The feed: api/calendar.js; the token: supabase/calendar_feed_migration.sql.
const isApple = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent || "");

export default function CalendarSyncCard({ accent = "#8CFF3D", className = "" }) {
  const [token, setToken] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_my_calendar_feed").then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setFailed(true); return; }
      setToken(data);
    });
    return () => { alive = false; };
  }, []);

  const host = typeof window !== "undefined" ? window.location.host : "showpilot.space";
  const feed = token ? `${host}/cal/${token}.ics` : "";
  const google = token ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${feed}`)}` : undefined;
  const other = !token ? undefined : isApple()
    ? `webcal://${feed}`
    : `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(`https://${feed}`)}&name=${encodeURIComponent("Show Pilot")}`;
  const off = token ? "" : "pointer-events-none opacity-50";

  return (
    <section aria-label="Connect your calendar" className={`rounded-xl border p-3 flex flex-col gap-2 ${className}`} style={{ background: "#111", borderColor: accent + "44", fontFamily: "Inter, system-ui, sans-serif" }}>
      <a href={google} target="_blank" rel="noopener noreferrer" aria-disabled={!token}
        className={`h-11 rounded-lg flex items-center justify-center gap-2 text-[15px] font-bold text-[#0d0d0d] ${off}`} style={{ background: accent }}>
        <CalendarPlus className="w-4 h-4" /> Connect Google Calendar
      </a>
      <a href={other} target={isApple() ? undefined : "_blank"} rel="noopener noreferrer" aria-disabled={!token}
        className={`h-11 rounded-lg flex items-center justify-center gap-2 text-[15px] font-bold text-white border border-[#2a2a2a] bg-[#181818] ${off}`}>
        <CalendarPlus className="w-4 h-4" style={{ color: accent }} /> Connect Apple / Outlook
      </a>
      {failed && <p className="m-0 text-[12px] text-red-300/90 text-center">Couldn't reach your calendar. Close Settings and try again.</p>}
    </section>
  );
}
