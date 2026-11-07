import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Plus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import AskTechSheet from "@/components/showpilot/AskTechSheet";
import useBookings, { fmtDay } from "@/lib/useBookings";
import { wantsLine } from "@/lib/bookingPackage";
import { usePreferences } from "@/hooks/usePreferences";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// Every booking package in one place (job 246): Incoming / Dates offered /
// Booked. Side by side on a laptop, stacked on a phone. A venue sees what's
// been sent to it; an artist / manager sees what they've sent. Booked events
// on the venue's side get "Ask a tech".
const RED = "#F87171";
const BLUE = "#60A5FA";
const GREEN = "#8CFF3D";
const COLS = [
  { key: "incoming", label: "INCOMING" },
  { key: "offered", label: "DATES OFFERED" },
  { key: "booked", label: "BOOKED" },
];

function colOf(p) {
  if (p.status === "booked") return "booked";
  if (p.status === "offered") return "offered";
  if (p.status === "sent") return "incoming";
  return "passed";
}

export default function Bookings() {
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const { data, loading, reload } = useBookings();
  const [asking, setAsking] = useState(null); // the booked item
  const [asks, setAsks] = useState({}); // show_id -> asks
  const canSend = ["manager", "band"].includes(preferences?.account_type);

  const items = [
    ...(data?.incoming || []).map((p) => ({ ...p, side: "venue", href: `/p/${p.code}` })),
    ...(data?.sent || []).map((p) => ({ ...p, side: "sender", href: `/book/${p.id}` })),
  ];
  const by = (k) => items.filter((p) => colOf(p) === k);
  const passed = by("passed");

  // Who's been asked to work each booked event on my side.
  const bookedShows = items.filter((p) => p.side === "venue" && p.status === "booked" && p.show_id).map((p) => p.show_id).join(",");
  useEffect(() => {
    if (!bookedShows) return;
    bookedShows.split(",").forEach((id) => {
      supabase.rpc("list_booking_tech_asks", { p_show: id }).then(({ data: a }) => {
        if (Array.isArray(a)) setAsks((m) => ({ ...m, [id]: a }));
      });
    });
  }, [bookedShows]);

  const line = (p) => {
    if (p.status === "booked") return [fmtDay(p.picked_date), p.side === "venue" ? p.sender_name : p.to_name].filter(Boolean).join(" · ");
    if (p.status === "offered") {
      const n = (p.offers || []).length;
      return p.side === "venue" ? `You offered ${n} date${n === 1 ? "" : "s"} · waiting on them` : `${n} date${n === 1 ? "" : "s"} to pick from`;
    }
    if (p.status === "declined") return p.side === "venue" ? "You passed" : `${p.to_name || "The venue"} passed`;
    const wl = wantsLine(p.wants);
    return p.side === "venue" ? [p.sender_name, wl && `wants ${wl}`].filter(Boolean).join(" · ") : `Sent to ${p.to_name || "a venue"} · waiting on them`;
  };
  const needsMe = (p) => (p.side === "venue" && p.status === "sent") || (p.side === "sender" && p.status === "offered");

  const card = (p) => {
    const mine = asks[p.show_id] || [];
    const roleWord = (r) => (r === "lighting" ? "Lighting" : "Audio");
    return (
      <div key={`${p.side}-${p.code}`} className="rounded-[14px] bg-[#151515] border overflow-hidden" style={{ borderColor: needsMe(p) ? (p.side === "venue" ? `${BLUE}88` : `${RED}88`) : "#262626" }}>
        <Link to={p.href} className="flex items-center gap-3 px-3 py-3 min-h-[68px] active:bg-[#1a1a1a]">
          <span className="w-11 h-11 rounded-full shrink-0 overflow-hidden border-2" style={{ borderColor: RED, background: "#2a1c1c" }}>
            {p.photo_url && <img src={p.photo_url} alt="" className="w-full h-full object-cover" />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[16px] font-semibold text-white truncate">{p.act_name || "A booking package"}</span>
            <span className="block text-[12.5px] text-white/60 truncate">{line(p)}</span>
          </span>
          {needsMe(p) && (
            <span className="shrink-0 text-[10px] font-bold tracking-[0.1em] px-2 py-1 rounded" style={{ fontFamily: SCENE_MONO, color: p.side === "venue" ? BLUE : RED, background: (p.side === "venue" ? BLUE : RED) + "1f" }}>
              {p.side === "venue" ? "ANSWER" : "PICK DATE"}
            </span>
          )}
        </Link>
        {p.side === "venue" && p.status === "booked" && p.show_id && (
          <div className="px-3 pb-3 flex flex-col gap-2">
            {mine.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mine.map((a) => (
                  <span key={a.code} className="text-[12px] px-2 py-1 rounded-full border" style={a.status === "in" ? { borderColor: `${GREEN}88`, color: GREEN } : a.status === "declined" ? { borderColor: "#333", color: "rgba(255,255,255,0.45)", textDecoration: "line-through" } : { borderColor: `${GREEN}55`, color: "rgba(255,255,255,0.75)", borderStyle: "dashed" }}>
                    {roleWord(a.role)} · {a.to_name || "Tech"} · {a.status === "in" ? "in" : a.status === "declined" ? "can't" : "asked"}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setAsking(p)} className="flex-1 min-h-[44px] rounded-[10px] border text-[14px] font-bold" style={{ borderColor: `${GREEN}66`, color: GREEN }}>Ask a tech</button>
              <Link to={`/show/${p.show_id}`} className="flex-1 min-h-[44px] rounded-[10px] border border-[#333] text-[14px] font-semibold text-white/80 flex items-center justify-center">Open the event</Link>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white pb-28 lg:pb-8" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg lg:max-w-[1180px] mx-auto px-5 pt-[22px]">
        <div className="flex items-center gap-2 mb-4">
          <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="w-11 h-11 -ml-3 rounded-full flex items-center justify-center text-white/60 hover:text-white lg:hidden"><ChevronLeft className="w-6 h-6" /></button>
          <h1 className="m-0 text-[34px] font-bold tracking-[0.04em] leading-none" style={{ fontFamily: SCENE_FONT }}>BOOKINGS</h1>
          {canSend && (
            <Link to="/book" className="ml-auto min-h-[44px] px-4 rounded-[10px] flex items-center gap-1.5 text-[15px] font-bold" style={{ background: RED, color: "#0d0d0d" }}><Plus className="w-4 h-4" strokeWidth={3} />Book a date</Link>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-xl bg-[#151515] border border-[#262626] p-6 text-center flex flex-col gap-2 items-center">
            <p className="m-0 text-base font-semibold">No bookings yet</p>
            <p className="m-0 text-sm text-white/55">{canSend ? "Send a booking package to a venue and it shows up here, all the way to booked." : "Booking packages venues and acts send you show up here."}</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3 lg:gap-4 items-start">
            {COLS.map((c) => {
              const list = by(c.key);
              return (
                <section key={c.key} aria-label={c.label} className="flex flex-col gap-2.5 lg:rounded-[16px] lg:bg-[#101010] lg:border lg:border-[#1d1d1d] lg:p-3 lg:min-h-[320px]">
                  <div className="flex items-center text-sm font-bold tracking-[0.08em] text-white/55 px-0.5" style={{ fontFamily: SCENE_FONT }}>
                    {c.label}<span className="ml-auto text-[11px] tracking-[0.1em] text-white/40" style={{ fontFamily: SCENE_MONO }}>{list.length}</span>
                  </div>
                  {list.length ? list.map(card) : <p className="text-[13px] text-white/35 px-0.5 m-0">Nothing here.</p>}
                </section>
              );
            })}
          </div>
        )}

        {passed.length > 0 && (
          <details className="mt-6">
            <summary className="min-h-[44px] flex items-center text-sm font-bold tracking-[0.08em] text-white/50 cursor-pointer" style={{ fontFamily: SCENE_FONT }}>PASSED · {passed.length}</summary>
            <div className="grid gap-2.5 lg:grid-cols-3 mt-2">{passed.map(card)}</div>
          </details>
        )}
      </div>

      {asking && (
        <AskTechSheet showId={asking.show_id} title={asking.act_name} date={asking.picked_date} onClose={() => setAsking(null)}
          onAsked={() => {
            supabase.rpc("list_booking_tech_asks", { p_show: asking.show_id }).then(({ data: a }) => { if (Array.isArray(a)) setAsks((m) => ({ ...m, [asking.show_id]: a })); });
            reload();
          }} />
      )}
      <BandBottomTabs />
    </div>
  );
}
