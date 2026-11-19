import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import SentProgress from "@/components/showpilot/SentProgress";
import { ChevronLeft, Plus, Trash2, EyeOff, BookOpen } from "lucide-react";
import SwipeRow from "@/components/showpilot/SwipeRow";
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
// Venues (job 323): New event makes an event and invites the act (the New
// event web); those events sit in Booked beside booked packages.
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
  // Countered (job 347): new dates are on the table, like an offer.
  if (p.status === "offered" || p.status === "countered") return "offered";
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
  const isVenue = preferences?.account_type === "venue";
  // Board (where everything stands) or Sent (what you sent and how far
  // along it is; job 354). Kept in the address so Back returns to it.
  const [params, setParams] = useSearchParams();
  const view = params.get("tab") === "sent" ? "sent" : "board";
  const setView = (v) => setParams(v === "sent" ? { tab: "sent" } : {}, { replace: true });
  // The venue's own events from the New event web, from today on, with how
  // their act invites stand.
  const [made, setMade] = useState([]);
  useEffect(() => {
    if (!isVenue) return undefined;
    let gone = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const today = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const { data: shows, error } = await supabase.from("shows").select("id, event_name, band_name, date, icon_url, share_token, archived, done")
        .eq("owner_id", user.id).eq("manager_info->>made_with", "event_web").gte("date", today).order("date", { ascending: true });
      if (error) { console.error(error); return; }
      // In the Logbook already (job 361): off Bookings.
      const list = (shows || []).filter((s) => !s.archived && !s.done);
      let invites = [];
      if (list.length) {
        const { data: inv } = await supabase.from("gig_invites").select("show_id, status, invited_role").in("show_id", list.map((s) => s.id)).eq("invited_role", "band");
        invites = inv || [];
      }
      if (gone) return;
      setMade(list.map((s) => {
        const mine = invites.filter((i) => i.show_id === s.id);
        const joined = mine.filter((i) => i.status === "accepted").length;
        return {
          side: "venue", status: "booked", code: `ev-${s.id}`, show_id: s.id, picked_date: s.date,
          act_name: s.band_name || s.event_name, photo_url: s.icon_url || "",
          sender_name: !mine.length ? "No act invited" : joined === mine.length ? (joined === 1 ? "Act joined" : "Acts joined") : `Invite sent${mine.length > 1 ? ` · ${joined} of ${mine.length} joined` : ""}`,
          href: s.share_token ? `/gig/web?token=${s.share_token}` : `/show/${s.id}`,
          // For Sent (job 354).
          id: s.id, name: s.band_name || s.event_name || "Your event", date: s.date, photo: s.icon_url || "", invited: mine.length, joined,
        };
      }));
    })();
    return () => { gone = true; };
  }, [isVenue]);

  // Swipe a card (job 361): delete a draft, take a booking off YOUR
  // Bookings (the other side keeps it), or add its event to your Logbook.
  // It leaves the list at once; the change is made after a few seconds
  // unless Undo is tapped.
  const [gone, setGone] = useState(() => new Set());
  const [undo, setUndo] = useState(null); // { key, text, commit }
  const pending = useRef(null);
  const keyOf = (p) => `${p.side}-${p.code || p.id}`;
  const flush = () => {
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    clearTimeout(job.timer);
    Promise.resolve(job.commit()).then(() => reload()).catch((e) => {
      console.error(e);
      setGone((g) => { const n = new Set(g); n.delete(job.key); return n; });
    });
  };
  useEffect(() => () => flush(), []); // leaving the page: make the change now
  const later = (p, text, commit) => {
    flush();
    const key = keyOf(p);
    setGone((g) => new Set(g).add(key));
    const timer = setTimeout(() => { flush(); setUndo(null); }, 5000);
    pending.current = { key, commit, timer };
    setUndo({ key, text });
  };
  const undoIt = () => {
    const job = pending.current;
    pending.current = null;
    if (job) {
      clearTimeout(job.timer);
      setGone((g) => { const n = new Set(g); n.delete(job.key); return n; });
    }
    setUndo(null);
  };
  const call = async (fn, args) => { const { data: d, error } = await supabase.rpc(fn, args); if (error) throw error; return d; };
  const actionsFor = (p) => {
    const out = [];
    if (p.status === "draft") {
      out.push({ label: "Delete", icon: Trash2, color: RED, onClick: () => later(p, "Draft deleted", () => call("withdraw_booking_package", { p_id: p.id })) });
      return out;
    }
    if (p.show_id && p.status === "booked") {
      out.push({ label: "Add to Logbook", icon: BookOpen, color: GREEN, onClick: () => later(p, "Added to your Logbook", async () => {
        await call("add_show_to_logbook", { p_show: p.show_id });
        if (p.code && !String(p.code).startsWith("ev-")) await call("hide_booking_package", { p_code: p.code, p_hide: true });
      }) });
    }
    if (p.code && !String(p.code).startsWith("ev-")) {
      out.push({ label: "Remove", icon: EyeOff, color: "#9CA3AF", onClick: () => later(p, "Removed from your Bookings", () => call("hide_booking_package", { p_code: p.code, p_hide: true })) });
    }
    return out;
  };

  const items = [
    ...(data?.incoming || []).map((p) => ({ ...p, side: "venue", href: `/p/${p.code}` })),
    ...(data?.sent || []).map((p) => ({ ...p, side: "sender", href: p.kind === "venue" ? `/offer/${p.id}` : `/book/${p.id}` })),
    ...made,
  ].filter((p) => !gone.has(keyOf(p)));
  const by = (k) => items.filter((p) => colOf(p) === k);
  const passed = by("passed");
  // Unsent drafts, both kinds (job 355): a package or an offer you started.
  const drafts = (data?.drafts || []).map((p) => ({ ...p, side: "sender", href: p.kind === "venue" ? `/offer/${p.id}` : `/book/${p.id}` })).filter((p) => !gone.has(keyOf(p)));

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
    if (p.status === "draft") return `Not sent yet${p.to_name ? ` · for ${p.to_name}` : ""}`;
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
      <SwipeRow key={keyOf(p)} actions={actionsFor(p)} label={p.act_name || "Booking"}>
      <div className="rounded-[14px] bg-[#151515] border overflow-hidden" style={{ borderColor: needsMe(p) ? (p.side === "venue" ? `${BLUE}88` : `${RED}88`) : "#262626" }}>
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
      </SwipeRow>
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
          {isVenue && (
            <div className="ml-auto flex items-center gap-2">
              <Link to="/offer" className="shrink-0 whitespace-nowrap min-h-[44px] px-3.5 rounded-[10px] flex items-center gap-1.5 text-[15px] font-bold border" style={{ borderColor: BLUE, color: BLUE }}>Offer dates</Link>
              <Link to="/event/new" state={{ from: "bookings" }} className="shrink-0 whitespace-nowrap min-h-[44px] px-3.5 rounded-[10px] flex items-center gap-1.5 text-[15px] font-bold" style={{ background: BLUE, color: "#0d0d0d" }}><Plus className="w-4 h-4" strokeWidth={3} />New event</Link>
            </div>
          )}
        </div>

        <div role="tablist" aria-label="Bookings view" className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-xl bg-[#161616] border border-[#262626] lg:max-w-[360px]">
          {[["board", "All bookings"], ["sent", "Sent"]].map(([k, text]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className="min-h-[42px] rounded-[9px] text-[15px] transition-colors"
              style={view === k ? { background: isVenue ? BLUE : RED, color: "#0d0d0d", fontWeight: 700 } : { color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>
              {text}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>
        ) : view === "sent" ? (
          <SentProgress data={data} isVenue={isVenue} made={made} hidden={gone} keyOf={keyOf} actionsFor={actionsFor} />
        ) : items.length === 0 ? (
          <div className="rounded-xl bg-[#151515] border border-[#262626] p-6 text-center flex flex-col gap-2 items-center">
            <p className="m-0 text-base font-semibold">No bookings yet</p>
            <p className="m-0 text-sm text-white/55">{canSend ? "Send a booking package to a venue and it shows up here, all the way to booked." : "Booking packages acts send you show up here, and events you make with New event."}</p>
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

        {view === "board" && drafts.length > 0 && (
          <details className="mt-6">
            <summary className="min-h-[44px] flex items-center text-sm font-bold tracking-[0.08em] text-white/50 cursor-pointer" style={{ fontFamily: SCENE_FONT }}>DRAFTS · {drafts.length}</summary>
            <div className="grid gap-2.5 lg:grid-cols-3 mt-2">{drafts.map(card)}</div>
          </details>
        )}

        {view === "board" && passed.length > 0 && (
          <details className="mt-6">
            <summary className="min-h-[44px] flex items-center text-sm font-bold tracking-[0.08em] text-white/50 cursor-pointer" style={{ fontFamily: SCENE_FONT }}>PASSED · {passed.length}</summary>
            <div className="grid gap-2.5 lg:grid-cols-3 mt-2">{passed.map(card)}</div>
          </details>
        )}
      </div>

      {undo && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-[96px] lg:bottom-6 z-[60] flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-[#1f1f1f] border border-[#333] shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-[14px]">
          <span>{undo.text}</span>
          <button type="button" onClick={undoIt} className="min-h-[38px] px-3.5 rounded-full font-bold" style={{ color: GREEN }}>Undo</button>
        </div>
      )}
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
