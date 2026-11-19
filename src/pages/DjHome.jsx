import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, Settings, Send, ChevronRight, HardDrive } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import useIsDesktop from "@/hooks/useIsDesktop";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import { DJ_COLOR, driveCall } from "@/lib/djTools";

// DJ view home (job 353): an Artist with "I'm a DJ" on lands here. It's
// built around collecting each performer's set: the next night and how many
// sets are in, the nights coming up, nights on the calendar with no set yet,
// and New set. A night opens in DJ Tools (/dj?event=<id>), where the links
// are made and sent and the tracks come in.
const RED = "#F87171";
const GREEN = "#8CFF3D";
const BLUE = "#60A5FA";
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };

const today = () => new Date().toISOString().slice(0, 10);
const dayParts = (d) => {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  return {
    wd: dt.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    day: dt.getDate(),
    mon: dt.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
  };
};
const dueLine = (iso) => {
  if (!iso) return "";
  try { return `Due ${new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`; } catch { return ""; }
};
const initials = (s) => String(s || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "DJ";

function DateBlock({ d, hot }) {
  const p = dayParts(d);
  return (
    <div className="w-[52px] shrink-0 rounded-[10px] py-1.5 flex flex-col items-center" style={{ background: hot ? "#1d1b0c" : "#14151c" }}>
      {p ? (
        <>
          <span className="text-[10px] tracking-[0.1em]" style={{ ...mono, color: hot ? DJ_COLOR : "rgba(255,255,255,0.6)" }}>{p.wd}</span>
          <span className="text-[26px] leading-none" style={cond}>{p.day}</span>
          <span className="text-[10px] tracking-[0.1em] text-white/60" style={mono}>{p.mon}</span>
        </>
      ) : <span className="text-[11px] text-white/50 py-3" style={mono}>NO DATE</span>}
    </div>
  );
}

function countChip(c) {
  if (!c || !c.all) return <span className="shrink-0 px-2 py-1 rounded-full text-[12px] font-semibold border border-[#333] text-white/65">No acts yet</span>;
  if (c.in >= c.all) return <span className="shrink-0 px-2 py-1 rounded-full text-[12px] font-semibold" style={{ background: `${GREEN}1f`, color: "#B6FF85" }}>All {c.all} in</span>;
  return <span className="shrink-0 px-2 py-1 rounded-full text-[12px] font-semibold border" style={{ borderColor: `${DJ_COLOR}88`, color: DJ_COLOR }}>{c.in} of {c.all} in</span>;
}

export default function DjHome() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
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
    const { data: shows } = await supabase.from("shows").select("id, event_name, band_name, date, venue")
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

  const t = today();
  const upcoming = requests.filter((r) => !r.event_date || r.event_date >= t);
  const past = requests.filter((r) => r.event_date && r.event_date < t).reverse().slice(0, 5);
  const next = upcoming[0] || null;
  const rest = upcoming.slice(1);
  const nc = next ? counts[next.id] : null;
  const name = preferences?.display_name || "You";
  const open = (r) => navigate(`/dj?event=${r.id}`);

  const header = (
    <div className="flex items-center gap-3">
      <span className="w-[46px] h-[46px] rounded-full overflow-hidden shrink-0 border-2 flex items-center justify-center text-[18px]" style={{ ...cond, borderColor: RED, color: RED, background: "#1a1012" }}>
        {preferences?.profile_photo_url ? <img src={preferences.profile_photo_url} alt="" className="w-full h-full object-cover" /> : initials(name)}
      </span>
      <div className="flex-1 min-w-0">
        <h1 className="m-0 text-[26px] leading-none truncate" style={cond}>{name}</h1>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10.5px] tracking-[0.12em] px-1.5 py-0.5 rounded-[5px] font-semibold" style={{ ...mono, background: `${DJ_COLOR}22`, color: DJ_COLOR }}>DJ</span>
          <span className="text-[10.5px] tracking-[0.12em]" style={{ ...mono, color: RED }}>ARTIST</span>
        </div>
      </div>
      {!isDesktop && (
        <Link to="/me" aria-label="Settings" className="w-11 h-11 rounded-[12px] border border-[#2a2a2a] bg-[#111] text-white/75 flex items-center justify-center"><Settings className="w-5 h-5" /></Link>
      )}
    </div>
  );

  const driveLine = drive.loading ? null : drive.connected ? (
    <div className="flex items-center gap-1.5 text-[12.5px] text-white/65"><span className="w-[7px] h-[7px] rounded-full" style={{ background: GREEN }} />Google Drive connected · WAVs land in your Drive</div>
  ) : (
    <button type="button" onClick={connectDrive} className="min-h-[48px] rounded-[12px] border px-3 flex items-center gap-2.5 text-left" style={{ borderColor: `${DJ_COLOR}66`, background: "#12110a" }}>
      <HardDrive className="w-5 h-5 shrink-0" style={{ color: DJ_COLOR }} />
      <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-bold">Connect Google Drive</span><span className="block text-[12px] text-white/60">Performers' WAVs land there, already in order.</span></span>
      <ChevronRight className="w-4 h-4 text-white/50" />
    </button>
  );

  const nextCard = next && (
    <button type="button" onClick={() => open(next)} className="w-full text-left flex flex-col gap-3 p-3.5 rounded-[16px] border-[1.5px]" style={{ borderColor: `${DJ_COLOR}88`, background: "#12110a" }}>
      <div className="flex items-start gap-3">
        <DateBlock d={next.event_date} hot />
        <div className="flex-1 min-w-0">
          <div className="text-[22px] leading-[1.05]" style={cond}>{next.title}</div>
          <div className="text-[13.5px] text-white/70 mt-0.5">{[next.venue, nc?.all ? `${nc.all} performer${nc.all === 1 ? "" : "s"}` : "No performers yet"].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
      {nc?.all ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[26px] leading-none" style={cond}>{nc.in >= nc.all ? `All ${nc.all} sets in` : `${nc.in} of ${nc.all} sets in`}</span>
            {next.due_at && <span className="text-[12.5px] text-white/65">{dueLine(next.due_at)}</span>}
          </div>
          <div aria-hidden="true" className="flex gap-1">
            {Array.from({ length: Math.min(nc.all, 16) }).map((_, i) => {
              const scale = nc.all > 16 ? nc.all / 16 : 1;
              const k = i * scale;
              const bg = k < nc.in ? GREEN : k < nc.in + nc.started ? BLUE : k < nc.in + nc.started + nc.sent ? DJ_COLOR : "#2a2a2a";
              return <span key={i} className="h-2 flex-1 rounded" style={{ background: bg }} />;
            })}
          </div>
          {nc.in < nc.all && (
            <span className="text-[12.5px] text-white/60 flex flex-wrap gap-x-2.5">
              {[[nc.started, "started", BLUE], [nc.sent, "link sent", DJ_COLOR], [nc.all - nc.in - nc.started - nc.sent, "no link yet", "#5c5c5c"]].filter(([n]) => n > 0).map(([n, w, c]) => (
                <span key={w} className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{n} {w}</span>
              ))}
            </span>
          )}
        </div>
      ) : <span className="text-[13.5px] text-white/65">Add the running order, then send each performer their link.</span>}
      <span className="min-h-[44px] rounded-[11px] font-bold text-[15px] flex items-center justify-center gap-2" style={{ background: DJ_COLOR, color: "#0d0d0d" }}>
        <Send className="w-4 h-4" />Open the set
      </span>
    </button>
  );

  const row = (key, d, title, sub, right, onClick, last) => (
    <button key={key} type="button" onClick={onClick} className={`w-full flex items-center gap-3 p-3 text-left ${last ? "" : "border-b border-[#1d1d22]"}`}>
      <div className="w-11 text-center shrink-0">
        {dayParts(d) ? <><div className="text-[10px] text-white/60" style={mono}>{dayParts(d).wd}</div><div className="text-[22px] leading-none" style={cond}>{dayParts(d).day}</div></> : <div className="text-[10px] text-white/50" style={mono}>NO DATE</div>}
      </div>
      <div className="flex-1 min-w-0"><div className="text-[15px] font-semibold truncate">{title}</div><div className="text-[12.5px] text-white/60 truncate">{sub}</div></div>
      {right}
    </button>
  );
  const list = (items) => <div className="rounded-[14px] border border-[#222] bg-[#0d0e14] overflow-hidden">{items}</div>;
  const label = (t2) => <h2 className="m-0 mt-2 text-[11px] tracking-[0.14em] text-white/60 font-normal" style={mono}>{t2}</h2>;

  const newSet = (
    <Link to="/dj?new=1" className="min-h-[50px] rounded-[12px] border-[1.5px] border-dashed font-bold text-[15.5px] flex items-center justify-center gap-2" style={{ borderColor: `${DJ_COLOR}99`, color: DJ_COLOR }}>
      <Plus className="w-4 h-4" strokeWidth={3} />New set
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#05060d] text-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <main className="max-w-[1080px] mx-auto px-4 lg:px-8 pt-5 lg:pt-8 pb-[120px] lg:pb-12 flex flex-col gap-3">
        {header}
        {driveLine}
        {error && <p className="m-0 text-[14px] text-red-400">{error}</p>}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} /></div>
        ) : (
          <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2 items-start">
            <div className="flex flex-col gap-3 min-w-0">
              {next ? <>{label("NEXT NIGHT")}{nextCard}</> : (
                <div className="mt-2 rounded-[16px] border border-[#222] bg-[#0d0e14] p-4 flex flex-col gap-2">
                  <div className="text-[22px] leading-none" style={cond}>Collect every performer's set</div>
                  <p className="m-0 text-[14px] text-white/65 leading-relaxed">Make a set for a night, add the running order, and send each performer their own link. Their track lists and WAVs come in here, and the WAVs land in your Google Drive in order.</p>
                </div>
              )}
              {rest.length > 0 && <>{label("COMING UP")}{list(rest.map((r, i) => row(r.id, r.event_date, r.title, [r.venue, dueLine(r.due_at)].filter(Boolean).join(" · ") || "No venue yet", countChip(counts[r.id]), () => open(r), i === rest.length - 1)))}</>}
              {newSet}
            </div>
            <div className="flex flex-col gap-3 min-w-0">
              {bareShows.length > 0 && <>{label("ON YOUR CALENDAR, NO SET YET")}{list(bareShows.map((s, i) => row(s.id, s.date, s.event_name || s.band_name || "Event", s.venue || "", <span className="shrink-0 px-2 py-1 rounded-full text-[12px] font-semibold border border-[#333] text-white/75">Make the set</span>, () => navigate(`/dj?show=${s.id}`), i === bareShows.length - 1)))}</>}
              {past.length > 0 && <>{label("PAST NIGHTS")}{list(past.map((r, i) => row(r.id, r.event_date, r.title, r.venue || "", countChip(counts[r.id]), () => open(r), i === past.length - 1)))}</>}
            </div>
          </div>
        )}
      </main>
      <BandBottomTabs />
    </div>
  );
}
