import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, ChevronRight, Disc3, Clock } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import useBookings, { fmtDay } from "@/lib/useBookings";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import TicketCard from "@/components/showpilot/TicketCard";
import NightSky from "@/components/showpilot/NightSky";
import { DJ_COLOR } from "@/lib/djTools";

// The DJ view's Bookings tab (job 362, Jay 2026-11-19): built to keep track
// of the gigs you're booked for. What needs you first (a venue's offer to
// answer, dates to pick), then every night coming up as a ticket with a
// countdown and whether its sets are in, then packages still waiting on a
// reply. Book a date and the full booking list (/bookings) are one tap away.
const RED = "#F87171";
const GREEN = "#8CFF3D";
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };
const today = () => new Date().toISOString().slice(0, 10);

const daysTo = (d) => {
  if (!d) return null;
  const a = new Date(`${today()}T00:00:00`);
  const b = new Date(`${d}T00:00:00`);
  return Math.round((b - a) / 86400000);
};
const countdown = (n) => (n === null ? ["", ""] : n <= 0 ? ["TONIGHT", ""] : n === 1 ? ["1", "DAY"] : n < 60 ? [String(n), "DAYS"] : [String(Math.round(n / 7)), "WEEKS"]);

function GigTicket({ g, sets, onOpen }) {
  const n = daysTo(g.date);
  const [big, small] = countdown(n);
  const soon = n !== null && n <= 7;
  const all = sets?.all || 0;
  return (
    <TicketCard color={DJ_COLOR} date={g.date} photo={g.icon_url || ""} onClick={onOpen} ariaLabel={`${g.name}${g.venue ? ` at ${g.venue}` : ""}`} stubWidth={64}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[21px] leading-[1.05] line-clamp-2 break-words" style={cond}>{g.name}</div>
          {g.venue && <div className="mt-1 text-[11px] tracking-[0.1em] text-white/65 truncate" style={mono}>{g.venue.toUpperCase()}</div>}
        </div>
        {big && (
          <div className="shrink-0 text-right">
            <div className="leading-none" style={{ ...cond, fontSize: big === "TONIGHT" ? 20 : 30, color: soon ? DJ_COLOR : "#fff" }}>{big}</div>
            {small && <div className="mt-0.5 text-[9.5px] tracking-[0.14em] text-white/55" style={mono}>{small}</div>}
          </div>
        )}
      </div>
      {(sets || g.time) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {g.time && <span className="min-h-[26px] px-2 rounded-full text-[12px] font-semibold flex items-center gap-1 bg-white/10 text-white/85"><Clock className="w-3 h-3" />{g.time}</span>}
          {sets && (
            <span className="min-h-[26px] px-2 rounded-full text-[12px] font-semibold flex items-center gap-1"
              style={all && sets.in >= all ? { background: `${GREEN}22`, color: "#B6FF85" } : { background: `${DJ_COLOR}1f`, color: DJ_COLOR }}>
              <Disc3 className="w-3 h-3" />{all ? (sets.in >= all ? `All ${all} sets in` : `${sets.in} of ${all} sets in`) : "Set: no acts yet"}
            </span>
          )}
        </div>
      )}
    </TicketCard>
  );
}

export default function DjGigs() {
  const navigate = useNavigate();
  const { data: bk } = useBookings();
  const [gigs, setGigs] = useState(null);
  const [sets, setSets] = useState({}); // show_id -> { in, all }

  useEffect(() => {
    let gone = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setGigs([]); return; }
      const t = today();
      const [{ data: owned }, { data: links }, { data: reqs }] = await Promise.all([
        supabase.from("shows").select("*").eq("owner_id", user.id).eq("archived", false).gte("date", t).order("date"),
        supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("archived", false),
        supabase.from("dj_set_requests").select("id, show_id"),
      ]);
      const linked = (await Promise.all((links || []).map(async (l) => {
        const { data } = await supabase.rpc("get_shared_gig", { p_token: l.share_token });
        return data && (!data.date || data.date >= t) ? { ...data, share_token: l.share_token, linked: true } : null;
      }))).filter(Boolean);
      const seen = new Set();
      const list = [...(owned || []), ...linked].filter((g) => (seen.has(g.id) ? false : seen.add(g.id))).map((g) => ({
        id: g.id,
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
        const { data: st } = await supabase.from("dj_set_slots").select("request_id, status").in("request_id", reqIds);
        const per = {};
        (st || []).forEach((x) => { const c = (per[x.request_id] = per[x.request_id] || { in: 0, all: 0 }); c.all += 1; if (x.status === "submitted") c.in += 1; });
        Object.entries(byShow).forEach(([show, req]) => { m[show] = per[req] || { in: 0, all: 0 }; });
      }
      if (gone) return;
      setSets(m);
      setGigs(list);
    })().catch((e) => { console.error(e); if (!gone) setGigs([]); });
    return () => { gone = true; };
  }, []);

  const needs = bk?.needs || [];
  const waiting = useMemo(() => (bk?.sent || []).filter((p) => p.status === "sent" || p.status === "countered"), [bk]);
  const label = (txt, right = null) => (
    <div className="mt-3 flex items-center justify-between gap-3">
      <h2 className="m-0 text-[11px] tracking-[0.16em] text-white/65 font-normal" style={mono}>{txt}</h2>
      {right}
    </div>
  );
  const row = (p, line, color) => (
    <Link key={`${p.side}-${p.code || p.id}`} to={p.href} className="min-h-[60px] flex items-center gap-3 px-3 py-2.5 rounded-[14px] border bg-[#0d0e14]/85 backdrop-blur" style={{ borderColor: `${color}66` }}>
      <span className="w-10 h-10 rounded-full overflow-hidden shrink-0 border-2" style={{ borderColor: color, background: "#1a1a1a" }}>
        {(p.photo_url || p.data?.photo_url) && <img src={p.photo_url || p.data?.photo_url} alt="" className="w-full h-full object-cover" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15.5px] font-semibold truncate">{p.side === "venue" ? p.sender_name || p.act_name || "A venue" : p.to_name || p.act_name || "A venue"}</span>
        <span className="block text-[12.5px] truncate" style={{ color }}>{line}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
    </Link>
  );

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#000" }}>
      <div aria-hidden="true" className="fixed inset-0 isolate pointer-events-none" style={{ zIndex: 0 }}><NightSky seed="dj-gigs" dim={0.3} /></div>
      <main className="relative z-[1] max-w-[1080px] mx-auto px-4 lg:px-8 pt-5 lg:pt-8 pb-[120px] lg:pb-12 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="m-0 text-[34px] leading-none" style={cond}>Gigs</h1>
            {gigs && <div className="mt-1 text-[11px] tracking-[0.14em] text-white/60" style={mono}>{gigs.length ? `${gigs.length} COMING UP` : "NOTHING BOOKED YET"}</div>}
          </div>
          <Link to="/book" className="min-h-[44px] px-4 rounded-full font-bold text-[14.5px] flex items-center gap-1.5" style={{ background: DJ_COLOR, color: "#0d0d0d" }}>
            <Plus className="w-4 h-4" strokeWidth={3} />Book a date
          </Link>
        </div>

        {needs.length > 0 && (
          <>
            {label("NEEDS YOU")}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{needs.map((p) => row(p, `${p.need}${p.act_name && p.side === "venue" ? ` · ${p.act_name}` : ""}`, RED))}</div>
          </>
        )}

        {label("BOOKED")}
        {gigs === null ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>
        ) : gigs.length === 0 ? (
          <p className="m-0 py-6 text-center text-[15px] text-white/60">No gigs coming up.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {gigs.map((g) => <GigTicket key={g.id} g={g} sets={sets[g.id]} onOpen={() => navigate(g.href)} />)}
          </div>
        )}

        {waiting.length > 0 && (
          <>
            {label("WAITING TO HEAR BACK")}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {waiting.map((p) => row({ ...p, side: "sender", href: p.kind === "venue" ? `/offer/${p.id}` : `/book/${p.id}` }, [p.status === "countered" ? "You sent new dates" : "Sent", p.sent_at ? fmtDay(String(p.sent_at).slice(0, 10)) : ""].filter(Boolean).join(" · "), "rgba(255,255,255,0.55)"))}
            </div>
          </>
        )}

        <Link to="/bookings" className="self-center mt-4 min-h-[44px] px-3 flex items-center gap-1 text-[14px] font-semibold text-white/65 hover:text-white">
          All booking packages<ChevronRight className="w-4 h-4" />
        </Link>
      </main>
      <BandBottomTabs />
    </div>
  );
}
