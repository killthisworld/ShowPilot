import React, { useEffect, useState } from "react";
import { Mail, Ticket } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { eventbriteCall } from "@/lib/eventbrite";

const G = "#8CFF3D";
const EB = "#F05537"; // Eventbrite orange, used only for its own button

// Fan page settings section: connect Eventbrite and link this event to an
// Eventbrite event, so everyone who buys a ticket there gets the event-info
// email automatically. Linking saves right away (it doesn't wait for the
// sheet's Update button), because it talks to Eventbrite, not the show row.
// Hidden entirely until Eventbrite is set up on the server.
export default function EventbriteLink({ showId, onLinked }) {
  const [st, setSt] = useState(null); // { configured, connected, link }
  const [events, setEvents] = useState(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    eventbriteCall("status", { show_id: showId })
      .then((d) => alive && setSt(d))
      .catch(() => alive && setSt({ configured: false }));
    return () => { alive = false; };
  }, [showId]);

  useEffect(() => {
    if (!st?.connected || st.link || events) return;
    let alive = true;
    eventbriteCall("events")
      .then((d) => { if (alive) setEvents(d.events || []); })
      .catch((e) => { if (alive) { setEvents([]); setErr(e.message); } });
    return () => { alive = false; };
  }, [st, events]);

  if (!st?.configured) return null;

  const run = async (fn) => {
    setErr(""); setBusy(true);
    try { await fn(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const connect = () => run(async () => {
    const { url } = await eventbriteCall("start", { return_to: window.location.pathname + window.location.search });
    window.location.assign(url);
  });
  const link = () => run(async () => {
    const { link } = await eventbriteCall("link", { show_id: showId, eb_event_id: pick });
    setSt((s) => ({ ...s, link }));
    onLinked?.(link);
  });
  const unlink = () => run(async () => {
    await eventbriteCall("unlink", { show_id: showId });
    setSt((s) => ({ ...s, link: null })); setEvents(null); setPick("");
  });
  const disconnect = () => run(async () => {
    await eventbriteCall("disconnect");
    setSt((s) => ({ ...s, connected: false, link: null })); setEvents(null); setPick("");
  });

  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  const btn = "px-3 py-2 rounded-lg text-sm font-bold tracking-[0.06em] disabled:opacity-50";

  return (
    <>
      <div className="mt-3.5 text-[10px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>TICKET BUYER EMAILS</div>
      <div className="mt-1.5 bg-[#111] border border-[#1f1f1f] rounded-[10px] p-3">
        {!st.connected && (
          <>
            <p className="text-[15px] font-medium leading-tight text-white/70">Selling on Eventbrite? Connect it, and everyone who buys a ticket gets this event's info by email, once.</p>
            <button type="button" onClick={connect} disabled={busy} className={`${btn} mt-2.5 flex items-center gap-2 text-white`} style={{ background: EB }}>
              <Ticket className="w-4 h-4" /> {busy ? "OPENING EVENTBRITE..." : "CONNECT EVENTBRITE"}
            </button>
          </>
        )}

        {st.connected && st.link && (
          <>
            <div className="flex items-center gap-2.5">
              <span className="w-[26px] h-[26px] rounded-md flex items-center justify-center shrink-0" style={{ background: "#8CFF3D24", border: "1px solid #8CFF3D8c", color: G }}><Mail className="w-3.5 h-3.5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-white truncate">{st.link.eb_event_name || "Eventbrite event"}</div>
                <div className="text-[12px] text-white/50">Buyers get the event info by email. Keep the fan page on.</div>
              </div>
            </div>
            <div className="mt-2.5 flex gap-2">
              <button type="button" onClick={unlink} disabled={busy} className={`${btn} bg-[#0d0d0d] border border-[#2a2a2a] text-white/70`}>UNLINK</button>
            </div>
          </>
        )}

        {st.connected && !st.link && (
          <>
            <p className="text-[15px] font-medium leading-tight text-white/70">Pick the Eventbrite event fans buy tickets for.</p>
            {events === null ? (
              <div className="py-3 flex"><div className="w-4 h-4 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>
            ) : events.length === 0 ? (
              <p className="mt-2 text-[13px] text-white/45">No upcoming events found in your Eventbrite account.</p>
            ) : (
              <div className="mt-2 flex gap-2">
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#222] rounded-lg px-2.5 py-2 text-white text-sm focus:outline-none focus:border-[#8CFF3D]/60">
                  <option value="">Choose an event…</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>{[fmt(e.start), e.name, e.status === "draft" ? "(draft)" : ""].filter(Boolean).join(" · ")}</option>
                  ))}
                </select>
                <button type="button" onClick={link} disabled={busy || !pick} className={btn} style={{ background: G, color: "#0d0d0d" }}>{busy ? "LINKING..." : "LINK"}</button>
              </div>
            )}
          </>
        )}

        {err && <p className="mt-2 text-[13px] text-red-400">{err}</p>}
        {st.connected && (
          <button type="button" onClick={disconnect} disabled={busy} className="mt-2.5 text-[12px] text-white/35 hover:text-white/70 underline underline-offset-2">Disconnect Eventbrite</button>
        )}
      </div>
    </>
  );
}
