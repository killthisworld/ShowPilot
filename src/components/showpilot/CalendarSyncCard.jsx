import React, { useEffect, useState } from "react";
import { CalendarPlus, Copy, Check, RotateCcw } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Google Calendar for every profile (job 411): one tap adds the person's
// private Show Pilot calendar (every event they create or are linked into)
// to Google Calendar; Apple Calendar / Outlook take the same link. Their
// calendar app keeps checking it, so new events show up on their own.
// The feed: api/calendar.js; the token: supabase/calendar_feed_migration.sql.
export default function CalendarSyncCard({ accent = "#8CFF3D", className = "" }) {
  const [token, setToken] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false); // asking "are you sure?"
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_my_calendar_feed").then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setState("error"); return; }
      setToken(data); setState("ready");
    });
    return () => { alive = false; };
  }, []);

  const host = typeof window !== "undefined" ? window.location.host : "showpilot.space";
  const feed = token ? `${host}/cal/${token}.ics` : "";
  const google = token ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${feed}`)}` : undefined;
  const webcal = token ? `webcal://${feed}` : undefined;

  const copy = async () => {
    try { await navigator.clipboard.writeText(`https://${feed}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard */ }
  };
  const reset = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("reset_my_calendar_feed");
    setBusy(false); setResetting(false);
    if (!error && data) setToken(data);
  };

  return (
    <section aria-label="Google Calendar" className={`rounded-xl border p-3.5 ${className}`} style={{ background: "#111", borderColor: accent + "44", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="flex items-center gap-2">
        <CalendarPlus className="w-4 h-4 shrink-0" style={{ color: accent }} />
        <span className="text-[12px] font-semibold tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: accent }}>GOOGLE CALENDAR</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-white/60">
        Every event you create or are linked into, in your Google Calendar. New and changed events show up on their own within a few hours.
      </p>

      {state === "error" ? (
        <p className="mt-3 text-[12.5px] text-red-300/90">Couldn't load your calendar link. Close Settings and try again.</p>
      ) : (
        <>
          <a
            href={google}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!token}
            className={`mt-3 w-full h-11 rounded-lg flex items-center justify-center gap-2 text-[15px] font-bold text-[#0d0d0d] ${token ? "" : "pointer-events-none opacity-50"}`}
            style={{ background: accent }}
          >
            <CalendarPlus className="w-4 h-4" /> {state === "loading" ? "Getting your link…" : "Add to Google Calendar"}
          </a>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <a
              href={webcal}
              aria-disabled={!token}
              className={`h-9 rounded-lg flex items-center justify-center text-[13px] font-semibold text-white/80 border border-[#2a2a2a] bg-[#161616] ${token ? "" : "pointer-events-none opacity-50"}`}
            >
              Apple / Outlook
            </a>
            <button type="button" onClick={copy} disabled={!token} className="h-9 rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-semibold text-white/80 border border-[#2a2a2a] bg-[#161616] disabled:opacity-50">
              {copied ? <><Check className="w-3.5 h-3.5" style={{ color: accent }} /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-white/40">This link is private to you. Anyone with it can see your events.</p>
          {token && (resetting ? (
            <div className="mt-2 flex items-center gap-2 text-[12px]">
              <span className="flex-1 text-white/60">Reset the link? The old one stops working, so add the calendar again.</span>
              <button type="button" onClick={reset} disabled={busy} className="px-2.5 h-8 rounded-md font-semibold text-red-300 border border-red-400/40 bg-red-500/10 disabled:opacity-60">{busy ? "…" : "Reset"}</button>
              <button type="button" onClick={() => setResetting(false)} className="px-2 h-8 text-white/55">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setResetting(true)} className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-white/45 hover:text-white/70">
              <RotateCcw className="w-3 h-3" /> Reset link
            </button>
          ))}
        </>
      )}
    </section>
  );
}
