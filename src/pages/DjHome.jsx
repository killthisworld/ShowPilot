import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
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

// A set as a card (job 372, Jay 2026-11-19: the Sets page is the sets;
// the tickets and months are on Bookings): the night, sets in, the bar
// with a section per act, and each act by name, marked once their set is
// in. Tap to open it.
function SetCard({ r, c, onOpen }) {
  const all = c?.all || 0;
  const done = all > 0 && c.in >= all;
  const day = r.event_date ? new Date(`${r.event_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() : "";
  const sub = [day, (r.venue || "").toUpperCase()].filter(Boolean).join(" · ");
  const due = dueLine(r.due_at);
  const names = c?.names || [];
  return (
    <button type="button" onClick={onOpen} aria-label={`${r.title}${all ? `, ${c.in} of ${all} sets in` : ""}`}
      className="w-full text-left rounded-2xl border bg-[#0f1016]/90 backdrop-blur p-3.5 flex flex-col gap-2.5 hover:border-white/30 transition-colors"
      style={{ borderColor: done ? `${GREEN}55` : "#262626" }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[19px] leading-tight truncate" style={cond}>{r.title}</div>
          <div className="text-[10.5px] tracking-[0.08em] text-white/55 truncate" style={mono}>
            {sub}{due && <span style={{ color: DJ_COLOR }}>{sub ? " · " : ""}{due.toUpperCase()}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[24px] leading-none" style={{ ...cond, color: done ? GREEN : all ? "#fff" : "rgba(255,255,255,0.35)" }}>
            {all ? <>{c.in}<span className="text-white/40">/{all}</span></> : "–"}
          </div>
          <div className="mt-0.5 text-[9px] tracking-[0.14em] text-white/50" style={mono}>{all ? "SETS IN" : "NO ACTS"}</div>
        </div>
      </div>
      {all > 0 && <ActBar slots={c.slots} height={6} />}
      {names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {names.slice(0, 6).map((n, i) => (
            <span key={i} className="min-h-[24px] px-2 rounded-full text-[12px] flex items-center gap-1.5"
              style={n.in ? { background: `${GREEN}1c`, color: "#B6FF85" } : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: n.in ? GREEN : "rgba(255,255,255,0.3)" }} />{n.name || `Act ${i + 1}`}
            </span>
          ))}
          {names.length > 6 && <span className="min-h-[24px] px-2 rounded-full text-[12px] flex items-center text-white/55 bg-white/5">+{names.length - 6}</span>}
        </div>
      )}
    </button>
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
        (c.names = c.names || []).push({ name: x.artist_name || "", in: x.status === "submitted" });
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
              <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {upcoming.map((r) => <SetCard key={r.id} r={r} c={counts[r.id]} onOpen={() => open(r)} />)}
              </div>
            )}
          </>
        )}
      </main>
      <BandBottomTabs />
    </div>
  );
}
