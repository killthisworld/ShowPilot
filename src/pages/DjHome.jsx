import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import TicketCard from "@/components/showpilot/TicketCard";
import NightSky from "@/components/showpilot/NightSky";
import DriveIcon from "@/components/showpilot/DriveIcon";
import { DJ_COLOR, driveCall } from "@/lib/djTools";

// DJ view home (job 353): an Artist with "I'm a DJ" on lands here. It's
// built around collecting each performer's set. Since job 362 (Jay
// 2026-11-19) it's simpler: the space background, a Drive icon in the
// corner (tap to connect), each set as a ticket you tap to open, nights on
// the calendar with no set yet, and New set. No Settings button (Me is in
// the tab bar) and no past nights. A set opens in DJ Tools (/dj?event=<id>).
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

// A set as a ticket: the date on the stub, the night and venue, how many
// sets are in (big, on the right) and a bar of every act's state.
function SetTicket({ r, c, next, onOpen }) {
  const all = c?.all || 0;
  const done = all > 0 && c.in >= all;
  const sub = [next ? "NEXT" : "", (r.venue || "").toUpperCase(), dueLine(r.due_at).toUpperCase()].filter(Boolean);
  return (
    <TicketCard color={DJ_COLOR} date={r.event_date} onClick={onOpen} ariaLabel={`${r.title}${all ? `, ${c.in} of ${all} sets in` : ""}`} stubWidth={64}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[22px] leading-[1.05] line-clamp-2 break-words" style={cond}>{r.title}</div>
          {sub.length > 0 && (
            <div className="mt-1 text-[11px] tracking-[0.1em] text-white/60 truncate" style={mono}>
              {sub.map((x, i) => <span key={i} style={x === "NEXT" ? { color: DJ_COLOR } : undefined}>{i ? " · " : ""}{x}</span>)}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[30px] leading-none" style={{ ...cond, color: done ? GREEN : all ? "#fff" : "rgba(255,255,255,0.35)" }}>
            {all ? <>{c.in}<span className="text-white/40">/{all}</span></> : "–"}
          </div>
          <div className="mt-0.5 text-[9.5px] tracking-[0.14em] text-white/50" style={mono}>{all ? "SETS IN" : "NO ACTS"}</div>
        </div>
      </div>
      {all > 0 && (
        <div aria-hidden="true" className="mt-3 flex gap-1">
          {Array.from({ length: Math.min(all, 16) }).map((_, i) => {
            const k = i * (all > 16 ? all / 16 : 1);
            const bg = k < c.in ? GREEN : k < c.in + c.started ? BLUE : k < c.in + c.started + c.sent ? DJ_COLOR : "#2e2e2e";
            return <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: bg }} />;
          })}
        </div>
      )}
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
  const [bareShows, setBareShows] = useState([]);

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
      (st || []).forEach((x) => {
        const c = (m[x.request_id] = m[x.request_id] || { in: 0, started: 0, sent: 0, all: 0 });
        c.all += 1;
        if (x.status === "submitted") c.in += 1; else if (x.status === "started") c.started += 1; else if (x.link_sent_at) c.sent += 1;
      });
      setCounts(m);
    } else setCounts({});
    // Your nights on the calendar that don't have a set yet.
    const { data: shows } = await supabase.from("shows").select("id, event_name, band_name, date, venue, icon_url")
      .eq("owner_id", user.id).gte("date", today()).order("date").limit(30);
    const linked = new Set((reqs || []).map((r) => r.show_id).filter(Boolean));
    setBareShows((shows || []).filter((s) => !linked.has(s.id)).slice(0, 8));
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
              <p className="m-0 py-6 text-center text-[15px] text-white/60">No sets yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {upcoming.map((r, i) => <SetTicket key={r.id} r={r} c={counts[r.id]} next={i === 0 && !!r.event_date} onOpen={() => open(r)} />)}
              </div>
            )}
            {bareShows.length > 0 && (
              <>
                {label("NO SET YET")}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {bareShows.map((s) => (
                    <TicketCard key={s.id} color={DJ_COLOR} date={s.date} photo={s.icon_url || ""} dim compact onClick={() => navigate(`/dj?show=${s.id}`)} ariaLabel={`Make the set for ${s.event_name || s.band_name || "this night"}`} stubWidth={56}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[17px] leading-tight truncate" style={cond}>{s.event_name || s.band_name || "Event"}</div>
                          {s.venue && <div className="text-[11px] tracking-[0.1em] text-white/55 truncate" style={mono}>{s.venue.toUpperCase()}</div>}
                        </div>
                        <span className="shrink-0 min-h-[32px] px-2.5 rounded-full text-[12.5px] font-bold flex items-center gap-1 border" style={{ borderColor: `${DJ_COLOR}88`, color: DJ_COLOR }}><Plus className="w-3.5 h-3.5" strokeWidth={3} />Set</span>
                      </div>
                    </TicketCard>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
      <BandBottomTabs />
    </div>
  );
}
