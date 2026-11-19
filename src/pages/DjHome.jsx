import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import TicketCard from "@/components/showpilot/TicketCard";
import NightSky from "@/components/showpilot/NightSky";
import DriveIcon from "@/components/showpilot/DriveIcon";
import DjWeekMonths, { ActBar } from "@/components/showpilot/DjWeekMonths";
import { DJ_COLOR, driveCall } from "@/lib/djTools";

// DJ view home (job 353): an Artist with DJ Mode on lands here. It's
// built around collecting each performer's set: the space background, a
// Drive icon in the corner (tap to connect), New set, and the sets as
// tickets, this week on top and the months below (jobs 362, 372). The
// events themselves are on Bookings (DjGigs). A set opens in DJ Tools
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

// A set as a ticket, smaller (job 372): the date on the stub, the night
// and venue, sets in on the right and the act bar.
function SetTicket({ r, c, onOpen }) {
  const all = c?.all || 0;
  const done = all > 0 && c.in >= all;
  const sub = [(r.venue || "").toUpperCase(), dueLine(r.due_at).toUpperCase()].filter(Boolean).join(" · ");
  return (
    <TicketCard color={DJ_COLOR} date={r.event_date} compact onClick={onOpen} ariaLabel={`${r.title}${all ? `, ${c.in} of ${all} sets in` : ""}`} stubWidth={48} notch={7}>
      <div className="flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[16.5px] leading-tight truncate" style={cond}>{r.title}</div>
          {sub && <div className="text-[10px] tracking-[0.08em] text-white/55 truncate" style={mono}>{sub}</div>}
        </div>
        <div className="shrink-0 text-[19px] leading-none" style={{ ...cond, color: done ? GREEN : all ? "#fff" : "rgba(255,255,255,0.35)" }}>
          {all ? <>{c.in}<span className="text-white/40">/{all}</span></> : "–"}
        </div>
      </div>
      {all > 0 && <div className="mt-1.5"><ActBar slots={c.slots} height={4} /></div>}
    </TicketCard>
  );
}

// This week's sets: a small ticket to scroll sideways, like the audio home.
function WeekSet({ r, c, onOpen }) {
  const all = c?.all || 0;
  return (
    <TicketCard className="shrink-0 w-[168px]" color={DJ_COLOR} date={r.event_date} compact stubWidth={42} notch={6} shadow={false} onClick={onOpen} ariaLabel={r.title}>
      <div className="min-h-[50px] flex flex-col justify-center gap-1">
        <span className="text-[13.5px] font-bold leading-tight line-clamp-2 break-words">{r.title}</span>
        {all > 0 ? <ActBar slots={c.slots} height={3} /> : <span className="text-[9px] tracking-[0.06em] text-white/50" style={mono}>NO ACTS</span>}
      </div>
    </TicketCard>
  );
}

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
            {/* Like the audio home (job 372): this week, then the months. */}
            <DjWeekMonths
              items={upcoming.map((r) => ({ ...r, key: r.id, date: r.event_date }))}
              empty="No sets this week."
              week={(r) => <WeekSet r={r} c={counts[r.id]} onOpen={() => open(r)} />}
              row={(r) => <SetTicket r={r} c={counts[r.id]} onOpen={() => open(r)} />}
            />
          </>
        )}
      </main>
      <BandBottomTabs />
    </div>
  );
}
