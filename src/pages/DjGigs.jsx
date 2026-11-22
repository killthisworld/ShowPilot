import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import TicketCard from "@/components/showpilot/TicketCard";
import NightSky from "@/components/showpilot/NightSky";
import { ActBar } from "@/components/showpilot/DjWeekMonths";
import { DJ_COLOR, DESK_HEADER, DESK_MAIN } from "@/lib/djTools";
import DjDateRequests from "@/components/showpilot/DjDateRequests";

// The DJ view's Bookings tab (jobs 362, 372, Jay 2026-11-19): the events
// you're on, to keep track of them. DJs get added to events rather than
// booking dates, so there's no Book a date or booking packages here: this
// week on top, the months below, each event a small ticket with when it
// is and its set (the sets in, or + Set to start one). One month at a time
// with arrows (job 452, was a year + month filter and month dropdowns), so
// past gigs are here too. The sets and their links are on the Sets tab.
const GREEN = "#8CFF3D";
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };
const today = () => new Date().toISOString().slice(0, 10);

const daysTo = (d) => (d ? Math.round((new Date(`${d}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000) : null);
const whenLabel = (d) => {
  const n = daysTo(d);
  return n === null ? "" : n < 0 ? "PLAYED" : n === 0 ? "TONIGHT" : n === 1 ? "TOMORROW" : `IN ${n} DAYS`;
};

// The set on an event: sets in (opens the set), or + Set on your own event.
function SetChip({ g, set, onSet, small = false }) {
  if (!set && (!g.mine || daysTo(g.date) < 0)) return null; // no new set for a night that's been played
  const go = (e) => { e.stopPropagation(); onSet(); };
  const h = small ? "min-h-[26px] px-2 text-[11.5px]" : "min-h-[32px] px-2.5 text-[12.5px]";
  if (!set) {
    return (
      <button type="button" onClick={go} aria-label={`Start the set for ${g.name}`} className={`${h} shrink-0 rounded-full font-bold flex items-center gap-1 border`} style={{ borderColor: `${DJ_COLOR}88`, color: DJ_COLOR }}>
        <Plus className="w-3.5 h-3.5" strokeWidth={3} />Set
      </button>
    );
  }
  const done = set.all > 0 && set.in >= set.all;
  return (
    <button type="button" onClick={go} aria-label={`Open the set: ${set.in} of ${set.all} in`} className={`${h} shrink-0 rounded-full font-bold flex items-center`}
      style={done ? { background: `${GREEN}22`, color: "#B6FF85" } : { background: `${DJ_COLOR}1f`, color: DJ_COLOR }}>
      {set.all ? `${set.in}/${set.all} sets` : "Set"}
    </button>
  );
}

function GigTicket({ g, set, onOpen, onSet }) {
  const when = whenLabel(g.date);
  const sub = [g.venue.toUpperCase(), g.time ? g.time.toUpperCase() : ""].filter(Boolean).join(" · ");
  return (
    <TicketCard color={DJ_COLOR} date={g.date} photo={g.icon_url} eagerPhoto compact dim={daysTo(g.date) < 0} onClick={onOpen} ariaLabel={`${g.name}${g.venue ? ` at ${g.venue}` : ""}`} stubWidth={48} notch={7}>
      <div className="flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[16.5px] leading-tight truncate" style={cond}>{g.name}</div>
          {sub && <div className="text-[10px] tracking-[0.08em] text-white/55 truncate" style={mono}>{sub}</div>}
          {when && <div className="text-[10px] tracking-[0.1em] truncate" style={{ ...mono, color: daysTo(g.date) >= 0 && daysTo(g.date) <= 7 ? DJ_COLOR : "rgba(255,255,255,0.45)" }}>{when}</div>}
        </div>
        <SetChip g={g} set={set} onSet={onSet} />
      </div>
      {set?.all > 0 && <div className="mt-1.5"><ActBar slots={set.slots} height={4} /></div>}
    </TicketCard>
  );
}

// Kept per signed-in account, so a different account on this phone never
// sees someone else's list for a moment.
const CACHE = "sp_dj_gigs_v1";
function signedInId() {
  try {
    const k = Object.keys(localStorage).find((x) => /^sb-.+-auth-token$/.test(x));
    return k ? JSON.parse(localStorage.getItem(k) || "null")?.user?.id || "" : "";
  } catch { return ""; }
}
function readCache() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE) || "null");
    return v && v.uid && v.uid === signedInId() ? v : null;
  } catch { return null; }
}
function writeCache(v) {
  try { localStorage.setItem(CACHE, JSON.stringify({ ...v, uid: signedInId() })); } catch { /* full or private mode */ }
}

export default function DjGigs() {
  const navigate = useNavigate();
  // The last list on this phone shows at once (job 467), so the tickets and
  // their photos don't wait on the server; the fresh list replaces it.
  const [gigs, setGigs] = useState(() => readCache()?.list || null);
  // Gigs | Requests (job 465). ?tab=requests opens on Requests.
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get("tab") === "requests" ? "requests" : "gigs"));
  const [newRequests, setNewRequests] = useState(0);
  const [reload, setReload] = useState(0);
  const [sets, setSets] = useState(() => readCache()?.sets || {}); // show_id -> { id, in, all, slots }

  useEffect(() => {
    let gone = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setGigs([]); return; }
      const [{ data: owned }, { data: links }, { data: reqs }] = await Promise.all([
        supabase.from("shows").select("*").eq("owner_id", user.id).eq("archived", false).order("date"),
        supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("archived", false),
        supabase.from("dj_set_requests").select("id, show_id"),
      ]);
      const linked = (await Promise.all((links || []).map(async (l) => {
        const { data } = await supabase.rpc("get_shared_gig", { p_token: l.share_token });
        return data ? { ...data, share_token: l.share_token, linked: true } : null;
      }))).filter(Boolean);
      const seen = new Set();
      const list = [...(owned || []).map((g) => ({ ...g, mine: true })), ...linked].filter((g) => (seen.has(g.id) ? false : seen.add(g.id))).map((g) => ({
        key: g.id,
        id: g.id,
        mine: !!g.mine,
        name: g.event_name || g.band_name || "Event",
        venue: g.venue || "",
        date: g.date || null,
        icon_url: g.icon_url || "",
        time: g.show_time || g.start_time || "",
        // The DJ event page: banner, the set and the artists (job 375).
        href: g.share_token ? `/dj/event?token=${g.share_token}` : `/show/${g.id}`,
      })).sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
      const byShow = Object.fromEntries((reqs || []).filter((r) => r.show_id).map((r) => [r.show_id, r.id]));
      const reqIds = Object.values(byShow);
      const m = {};
      if (reqIds.length) {
        const { data: st } = await supabase.from("dj_set_slots").select("request_id, status, position").in("request_id", reqIds);
        const per = {};
        [...(st || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).forEach((x) => {
          const c = (per[x.request_id] = per[x.request_id] || { in: 0, all: 0, slots: [] });
          c.all += 1; c.slots.push(x.status || "waiting"); if (x.status === "submitted") c.in += 1;
        });
        Object.entries(byShow).forEach(([show, req]) => { m[show] = { id: req, ...(per[req] || { in: 0, all: 0, slots: [] }) }; });
      }
      if (gone) return;
      setSets(m);
      setGigs(list);
      writeCache({ list, sets: m });
      // Start every photo now, not when the browser gets round to it.
      list.forEach((g) => { if (g.icon_url) { const im = new Image(); im.decoding = "async"; im.src = g.icon_url; } });
    })().catch((e) => { console.error(e); if (!gone) setGigs((g) => g || []); });
    return () => { gone = true; };
  }, [reload]);

  // One month at a time (job 452, Jay 2026-11-21): arrows step through the
  // months (and into other years), and that month's gigs are right there on
  // the screen, no dropdown. It opens on this month; swipe sideways on a
  // phone to change month too.
  const thisYm = today().slice(0, 7);
  const [ym, setYm] = useState(thisYm);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dated = (gigs || []).filter((g) => g.date);
  // How far the arrows go: from the first gig (or this month) to the last.
  const firstYm = dated.reduce((m, g) => (g.date.slice(0, 7) < m ? g.date.slice(0, 7) : m), thisYm);
  const lastYm = dated.reduce((m, g) => (g.date.slice(0, 7) > m ? g.date.slice(0, 7) : m), thisYm);
  const step = (d) => {
    const [y, m] = ym.split("-").map(Number);
    const t = new Date(y, m - 1 + d, 1);
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
    if (k >= firstYm && k <= lastYm) setYm(k);
  };
  const shown = [...dated.filter((g) => g.date.slice(0, 7) === ym), ...(ym === thisYm ? (gigs || []).filter((g) => !g.date) : [])];
  const upcoming = (gigs || []).filter((g) => !g.date || g.date >= today()).length;
  const [yy, mm] = ym.split("-").map(Number);
  const swipe = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s0 = swipe.current; swipe.current = null;
    if (!s0) return;
    const t = e.changedTouches[0]; const dx = t.clientX - s0.x; const dy = t.clientY - s0.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };
  const arrow = "w-11 h-11 rounded-full flex items-center justify-center border border-white/15 bg-[#0d0e14]/85 text-white/85 hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent";

  const openSet = (g) => { const s = sets[g.id]; navigate(s ? `/dj?event=${s.id}` : `/dj?show=${g.id}`); };

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#000" }}>
      <div aria-hidden="true" className="fixed inset-0 isolate pointer-events-none" style={{ zIndex: 0 }}><NightSky seed="dj-gigs" dim={0.3} /></div>
      {/* On a computer the page uses the full width under a header bar, like the Sets page (job 452). */}
      <main className={`relative z-[1] ${DESK_MAIN} pt-5 pb-[120px] flex flex-col gap-3`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <header className={DESK_HEADER}>
          <h1 className="m-0 text-[34px] lg:text-3xl leading-none" style={cond}>Bookings</h1>
          {upcoming > 0 && <span className="mt-1 lg:mt-0 lg:ml-auto block text-[11px] tracking-[0.14em] text-white/60" style={mono}>{upcoming} COMING UP</span>}
        </header>
        <div role="tablist" aria-label="Bookings" className="flex gap-1 p-1 rounded-full bg-black/45 border border-white/10 lg:self-start lg:min-w-[320px]">
          {[["gigs", "Gigs"], ["requests", "Requests"]].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="flex-1 min-h-[38px] px-4 rounded-full text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors" style={tab === k ? { background: DJ_COLOR, color: "#000" } : { color: "rgba(255,255,255,0.75)" }}>
              {label}
              {k === "requests" && newRequests > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center" style={tab === k ? { background: "#000", color: DJ_COLOR } : { background: "#F87171", color: "#0d0d0d" }}>{newRequests}</span>}
            </button>
          ))}
        </div>
        {/* Promoters asking for a night from the press kit (jobs 459, 465). Kept
            mounted so the tab's count stays right. */}
        <div className={tab === "requests" ? "" : "hidden"}>
          <DjDateRequests onCount={setNewRequests} onBooked={() => setReload((n) => n + 1)} />
        </div>
        {tab !== "gigs" ? null : gigs === null ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>
        ) : (
          <>
          {/* The month: arrows either side, Today to come back. */}
          <div className="flex items-center gap-2 lg:gap-3 mb-1 lg:mb-2">
            <button type="button" onClick={() => step(-1)} disabled={ym <= firstYm} aria-label="Month before" className={arrow}><ChevronLeft className="w-5 h-5" /></button>
            <div className="flex-1 lg:flex-none lg:min-w-[260px] text-center leading-none" aria-live="polite">
              <div className="text-[26px] lg:text-[30px] tracking-[0.04em]" style={{ ...cond, color: DJ_COLOR }}>{MONTHS[mm - 1].toUpperCase()}</div>
              <div className="mt-1 text-[11px] tracking-[0.18em] text-white/60" style={mono}>{yy} · {shown.length} GIG{shown.length === 1 ? "" : "S"}</div>
            </div>
            <button type="button" onClick={() => step(1)} disabled={ym >= lastYm} aria-label="Month after" className={arrow}><ChevronRight className="w-5 h-5" /></button>
            {ym !== thisYm && (
              <button type="button" onClick={() => setYm(thisYm)} className="hidden lg:flex ml-2 min-h-[36px] px-3.5 rounded-full text-[13px] font-semibold items-center border" style={{ borderColor: `${DJ_COLOR}88`, color: DJ_COLOR }}>Today</button>
            )}
          </div>
          {ym !== thisYm && (
            <button type="button" onClick={() => setYm(thisYm)} className="lg:hidden self-center -mt-1 min-h-[32px] px-3 rounded-full text-[12.5px] font-semibold flex items-center border" style={{ borderColor: `${DJ_COLOR}88`, color: DJ_COLOR }}>Back to this month</button>
          )}
          {shown.length === 0 ? (
            <p className="m-0 py-10 text-center text-[15px] text-white/55">No gigs in {MONTHS[mm - 1]} {yy}.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
              {shown.map((g) => <React.Fragment key={g.key}><GigTicket g={g} set={sets[g.id]} onOpen={() => navigate(g.href)} onSet={() => openSet(g)} /></React.Fragment>)}
            </div>
          )}
          </>
        )}
      </main>
      <BandBottomTabs />
    </div>
  );
}
