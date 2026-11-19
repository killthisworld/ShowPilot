import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, CalendarDays, MapPin, Clock } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import NightSky from "@/components/showpilot/NightSky";
import DriveIcon from "@/components/showpilot/DriveIcon";
import { ActBar } from "@/components/showpilot/DjWeekMonths";
import { DJ_COLOR, driveCall } from "@/lib/djTools";

// DJ view home (job 353): an Artist with DJ Mode on lands here. It's
// built around collecting each performer's set: the space background, a
// Drive icon in the corner (tap to connect), New set, and the sets as cards
// with their act bars (jobs 362, 372). The events, as tickets by month, are
// on Bookings (DjGigs). A set opens in DJ Tools
// (/dj?event=<id>).
const RED = "#F87171";
const GREEN = "#8CFF3D";
const BLUE = "#60A5FA";
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };

const today = () => new Date().toISOString().slice(0, 10);
const dueLine = (iso) => {
  if (!iso) return "";
  try { return `Due ${new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`; } catch { return ""; }
};
const initials = (s) => String(s || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "DJ";

// A set as a card (job 372, Jay 2026-11-19): the event name as the title,
// then the date, venue and due date where they're easy to read, and the
// sets in with the bar (a section per act). Tap to open it.
function SetCard({ r, c, onOpen }) {
  const all = c?.all || 0;
  const done = all > 0 && c.in >= all;
  const day = r.event_date ? new Date(`${r.event_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  const dueAt = r.due_at ? new Date(r.due_at) : null;
  const late = dueAt && dueAt < new Date() && !done;
  const dueDay = dueAt ? dueAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
  return (
    <button type="button" onClick={onOpen} aria-label={`${r.title}${all ? `, ${c.in} of ${all} sets in` : ""}`}
      className="w-full text-left rounded-2xl border bg-[#0f1016]/90 backdrop-blur p-4 flex flex-col gap-3 hover:border-white/30 transition-colors"
      style={{ borderColor: done ? `${GREEN}55` : "#262626" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="text-[22px] leading-[1.1] line-clamp-2 break-words" style={cond}>{r.title}</div>
          {(day || r.venue) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-white/80">
              {day && <span className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-white/45" />{day}</span>}
              {r.venue && <span className="flex items-center gap-1.5 min-w-0"><MapPin className="w-4 h-4 text-white/45 shrink-0" /><span className="truncate">{r.venue}</span></span>}
            </div>
          )}
          {dueAt && !done && (
            <span className="self-start min-h-[26px] px-2.5 rounded-full text-[13px] font-semibold flex items-center gap-1.5"
              style={late ? { background: `${RED}22`, color: RED } : { background: `${DJ_COLOR}1c`, color: DJ_COLOR }}>
              <Clock className="w-3.5 h-3.5" />{late ? `Overdue · was due ${dueDay}` : `Sets due ${dueDay}`}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right pt-0.5">
          <div className="text-[26px] leading-none" style={{ ...cond, color: done ? GREEN : all ? "#fff" : "rgba(255,255,255,0.35)" }}>
            {all ? <>{c.in}<span className="text-white/40">/{all}</span></> : "–"}
          </div>
          <div className="mt-1 text-[12px] text-white/55">{all ? (done ? "all in" : "in") : "no acts"}</div>
        </div>
      </div>
      {all > 0 && <ActBar slots={c.slots} height={6} />}
    </button>
  );
}

// Sets in more than one month: a heading for each month, soonest first.
const monthOf = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "No date");

export default function DjHome() {
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drive, setDrive] = useState({ loading: true });
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({});

  const load = useCallback(async () => {
    setError("");
    driveCall("status").then((d) => setDrive({ ...d, loading: false })).catch(() => setDrive({ loading: false }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: reqs, error: e } = await supabase.from("dj_set_requests").select("id, title, event_date, venue, due_at, show_id")
      .order("event_date", { ascending: true, nullsFirst: false }).order("created_at");
    if (e) { setError("Couldn't load your sets. Pull down or come back in a moment."); setLoading(false); return; }
    setRequests(reqs || []);
    const ids = (reqs || []).map((r) => r.id);
    if (ids.length) {
      // "*" so this works before and after link_sent_at is in (job 354).
      const { data: st } = await supabase.from("dj_set_slots").select("*").in("request_id", ids);
      const m = {};
      [...(st || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).forEach((x) => {
        const c = (m[x.request_id] = m[x.request_id] || { in: 0, all: 0, slots: [] });
        c.all += 1;
        c.slots.push(x.status || "waiting");
        if (x.status === "submitted") c.in += 1;
      });
      setCounts(m);
    } else setCounts({});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const connectDrive = async () => {
    try { const { url } = await driveCall("start", { return_to: "/" }); window.location.assign(url); }
    catch (e) { setError(e.message || "Couldn't reach Google Drive."); }
  };
  const disconnectDrive = async () => {
    try { await driveCall("disconnect"); setDrive({ loading: true }); load(); } catch (e) { setError(e.message || "Couldn't disconnect."); }
  };

  const t = today();
  const upcoming = requests.filter((r) => !r.event_date || r.event_date >= t);
  const name = preferences?.display_name || "You";
  const open = (r) => navigate(`/dj?event=${r.id}`);
  const label = (txt, right = null) => (
    <div className="mt-3 flex items-center justify-between gap-3">
      <h2 className="m-0 text-[11px] tracking-[0.16em] text-white/65 font-normal" style={mono}>{txt}</h2>
      {right}
    </div>
  );

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#000" }}>
      <div aria-hidden="true" className="fixed inset-0 isolate pointer-events-none" style={{ zIndex: 0 }}><NightSky seed="dj-sets" dim={0.3} /></div>
      <main className="relative z-[1] max-w-[1080px] mx-auto px-4 lg:px-8 pt-5 lg:pt-8 pb-[120px] lg:pb-12 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-[46px] h-[46px] rounded-full overflow-hidden shrink-0 border-2 flex items-center justify-center text-[18px]" style={{ ...cond, borderColor: RED, color: RED, background: "#1a1012" }}>
            {preferences?.profile_photo_url ? <img src={preferences.profile_photo_url} alt="" className="w-full h-full object-cover" /> : initials(name)}
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="m-0 text-[26px] leading-none truncate" style={cond}>{name}</h1>
            <span className="inline-block mt-1 text-[10.5px] tracking-[0.12em] px-1.5 py-0.5 rounded-[5px] font-semibold" style={{ ...mono, background: `${DJ_COLOR}22`, color: DJ_COLOR }}>DJ</span>
          </div>
          <DriveIcon drive={drive} onConnect={connectDrive} onDisconnect={disconnectDrive} />
        </div>
        {error && <p className="m-0 text-[14px] text-red-400">{error}</p>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>
        ) : (
          <>
            {label("SETS", (
              <Link to="/dj?new=1" className="min-h-[40px] px-3.5 rounded-full font-bold text-[14px] flex items-center gap-1.5" style={{ background: DJ_COLOR, color: "#0d0d0d" }}>
                <Plus className="w-4 h-4" strokeWidth={3} />New set
              </Link>
            ))}
            {upcoming.length === 0 ? (
              <p className="m-0 py-6 text-center text-[15px] text-white/60">No sets yet. Start one from a gig on Bookings, or New set.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {Object.entries(upcoming.reduce((m, r) => { (m[monthOf(r.event_date)] = m[monthOf(r.event_date)] || []).push(r); return m; }, {})).map(([mon, list]) => (
                  <section key={mon} className="flex flex-col gap-2">
                    <h3 className="m-0 flex items-center gap-2 text-[12px] tracking-[0.14em] font-normal" style={{ ...mono, color: DJ_COLOR }}>
                      {mon.toUpperCase()}<span className="text-white/45">{list.length}</span><span className="flex-1 h-px bg-white/10" />
                    </h3>
                    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                      {list.map((r) => <SetCard key={r.id} r={r} c={counts[r.id]} onOpen={() => open(r)} />)}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <BandBottomTabs />
    </div>
  );
}
