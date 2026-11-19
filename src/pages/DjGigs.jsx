import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import TicketCard from "@/components/showpilot/TicketCard";
import NightSky from "@/components/showpilot/NightSky";
import DjWeekMonths, { ActBar } from "@/components/showpilot/DjWeekMonths";
import { DJ_COLOR } from "@/lib/djTools";

// The DJ view's Bookings tab (jobs 362, 372, Jay 2026-11-19): the events
// you're on, to keep track of them. DJs get added to events rather than
// booking dates, so there's no Book a date or booking packages here: this
// week on top, the months below, each event a small ticket with when it
// is and its set (the sets in, or + Set to start one). A filter on top
// moves between years and months (job 372, Jay 2026-11-19), so past gigs
// are here too. The sets and their links are on the Sets tab.
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
    <TicketCard color={DJ_COLOR} date={g.date} photo={g.icon_url} compact dim={daysTo(g.date) < 0} onClick={onOpen} ariaLabel={`${g.name}${g.venue ? ` at ${g.venue}` : ""}`} stubWidth={48} notch={7}>
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

function WeekGig({ g, set, onOpen }) {
  return (
    <TicketCard className="shrink-0 w-[168px]" color={DJ_COLOR} date={g.date} photo={g.icon_url} compact stubWidth={42} notch={6} shadow={false} onClick={onOpen} ariaLabel={g.name}>
      <div className="min-h-[50px] flex flex-col justify-center gap-1">
        <span className="text-[13.5px] font-bold leading-tight line-clamp-2 break-words">{g.name}</span>
        <span className="text-[9px] tracking-[0.06em] truncate" style={{ ...mono, color: daysTo(g.date) <= 0 ? DJ_COLOR : "rgba(255,255,255,0.6)" }}>{whenLabel(g.date) || g.venue.toUpperCase()}</span>
        {set?.all > 0 && <ActBar slots={set.slots} height={3} />}
      </div>
    </TicketCard>
  );
}

export default function DjGigs() {
  const navigate = useNavigate();
  const [gigs, setGigs] = useState(null);
  const [sets, setSets] = useState({}); // show_id -> { id, in, all, slots }

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
        href: g.linked && g.share_token ? `/gig/web?token=${g.share_token}` : `/show/${g.id}`,
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
    })().catch((e) => { console.error(e); if (!gone) setGigs([]); });
    return () => { gone = true; };
  }, []);

  // The filter: a year, and all of it or one month.
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(null); // "01".."12" or null for all
  const years = useMemo(() => {
    const ys = new Set([thisYear, ...(gigs || []).filter((g) => g.date).map((g) => Number(g.date.slice(0, 4)))]);
    return [...ys].sort((x, y) => x - y);
  }, [gigs, thisYear]);
  const inYear = useMemo(() => (gigs || []).filter((g) => g.date && Number(g.date.slice(0, 4)) === year), [gigs, year]);
  const perMonth = useMemo(() => { const m = {}; inYear.forEach((g) => { const k = g.date.slice(5, 7); m[k] = (m[k] || 0) + 1; }); return m; }, [inYear]);
  const shown = month ? inYear.filter((g) => g.date.slice(5, 7) === month) : inYear;
  const upcoming = (gigs || []).filter((g) => !g.date || g.date >= today()).length;
  const stepYear = (d) => {
    const i = years.indexOf(year) + d;
    if (i >= 0 && i < years.length) { setYear(years[i]); setMonth(null); }
  };
  // Keep the chosen month chip (or All) in view on a phone.
  const chips = useRef(null);
  useEffect(() => { chips.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "center" }); }, [year, month, gigs]);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const openSet = (g) => { const s = sets[g.id]; navigate(s ? `/dj?event=${s.id}` : `/dj?show=${g.id}`); };

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#000" }}>
      <div aria-hidden="true" className="fixed inset-0 isolate pointer-events-none" style={{ zIndex: 0 }}><NightSky seed="dj-gigs" dim={0.3} /></div>
      <main className="relative z-[1] max-w-[1080px] mx-auto px-4 lg:px-8 pt-5 lg:pt-8 pb-[120px] lg:pb-12 flex flex-col gap-3">
        <div>
          <h1 className="m-0 text-[34px] leading-none" style={cond}>Gigs</h1>
          {upcoming > 0 && <div className="mt-1 text-[11px] tracking-[0.14em] text-white/60" style={mono}>{upcoming} COMING UP</div>}
        </div>
        {gigs === null ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>
        ) : (
          <>
          {/* The filter: the year, then all months or one. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => stepYear(-1)} disabled={years.indexOf(year) <= 0} aria-label="Year before"
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 disabled:opacity-25 hover:bg-white/10"><ChevronLeft className="w-5 h-5" /></button>
              <span className="min-w-[64px] text-center text-[24px] leading-none" style={{ ...cond, color: DJ_COLOR }} aria-live="polite">{year}</span>
              <button type="button" onClick={() => stepYear(1)} disabled={years.indexOf(year) >= years.length - 1} aria-label="Year after"
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/80 disabled:opacity-25 hover:bg-white/10"><ChevronRight className="w-5 h-5" /></button>
              <span className="ml-auto text-[11px] tracking-[0.12em] text-white/55" style={mono}>{inYear.length} GIG{inYear.length === 1 ? "" : "S"}</span>
            </div>
            <div ref={chips} className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap" role="tablist" aria-label="Month">
              {[[null, "All"], ...MONTHS.map((m, i) => [String(i + 1).padStart(2, "0"), m])].map(([k, l]) => {
                const on = month === k;
                const n = k ? perMonth[k] || 0 : inYear.length;
                return (
                  <button key={l} type="button" role="tab" aria-selected={on} onClick={() => setMonth(k)} disabled={k && !n}
                    className="shrink-0 min-h-[36px] px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5 border disabled:opacity-30"
                    style={on ? { background: DJ_COLOR, color: "#0d0d0d", borderColor: DJ_COLOR } : { background: "rgba(13,14,20,0.85)", color: "rgba(255,255,255,0.85)", borderColor: "#2a2a2a" }}>
                    {l}{k && n > 0 && <span className="text-[10.5px] tabular-nums opacity-70" style={mono}>{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {shown.length === 0 && (year !== thisYear || month) ? (
            <p className="m-0 py-6 text-center text-[14px] text-white/50">No gigs in {month ? `${MONTHS[Number(month) - 1]} ` : ""}{year}.</p>
          ) : (
          <DjWeekMonths
            items={shown}
            showWeek={year === thisYear && !month}
            openAll={!!month}
            empty="No gigs this week."
            week={(g) => <WeekGig g={g} set={sets[g.id]} onOpen={() => navigate(g.href)} />}
            row={(g) => <GigTicket g={g} set={sets[g.id]} onOpen={() => navigate(g.href)} onSet={() => openSet(g)} />}
          />
          )}
          </>
        )}
      </main>
      <BandBottomTabs />
    </div>
  );
}
