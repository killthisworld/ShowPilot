import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Home, CalendarDays, PlaneTakeoff, MessageCircle, Ticket, Camera, Plus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { eventTypeColor } from "@/lib/eventTypes";
import { uploadIconImage, saveMyIcon } from "@/lib/eventIcons";
import MonthDropdown, { jumpMonthOptions, nearestMonthKey } from "@/components/showpilot/MonthDropdown";
import useNeedsMe from "@/hooks/useNeedsMe";
import FanPageSheet from "@/components/showpilot/FanPageSheet";
import { FAN_SIDE_OPEN } from "@/lib/hiddenProfiles";

// Tech profiles, phone turned sideways (Settings > Customize > Console when
// sideways): every upcoming show as a mixing-console channel strip, read top
// to bottom like a real strip - name, open tasks, which profiles are on the
// event (lit = linked, dark = not yet), chat / fan page / web, and a fader
// showing how show-ready it is. The event photo, if there is one, sits behind
// the strip; the camera button changes it. Mockup: "Tech phone turned
// sideways" on the Company Phone Layout canvas (job 67).

const ROLES = [
  { id: "venue", label: "VENUE", color: "#60A5FA", soft: "#60A5FA" },
  { id: "promoter", label: "PROMOTER", color: "#60A5FA", soft: "#60A5FA" },
  { id: "booking_agent", label: "BOOKING", color: "#C026D3", soft: "#E879F9" },
  { id: "manager", label: "MANAGER", color: "#EF4444", soft: "#F87171" },
  { id: "engineer", label: "AUDIO/LX", color: "#8CFF3D", soft: "#8CFF3D" },
];

const WebIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4L19.6 9.5L16.7 18.5H7.3L4.4 9.5Z" />
    <path d="M12 12L12 4M12 12L19.6 9.5M12 12L16.7 18.5M12 12L7.3 18.5M12 12L4.4 9.5" />
    <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    {[[12, 4], [19.6, 9.5], [16.7, 18.5], [7.3, 18.5], [4.4, 9.5]].map(([x, y]) => <circle key={x + "-" + y} cx={x} cy={y} r="1.7" fill="currentColor" />)}
  </svg>
);

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function ConsoleStrips({ shows, onOpen, accent = "#8CFF3D" }) {
  const [progress, setProgress] = useState({});
  const [rolesByShow, setRolesByShow] = useState({});
  const [photoOverride, setPhotoOverride] = useState({});
  const [fanShow, setFanShow] = useState(null);
  const [busyPhoto, setBusyPhoto] = useState(null);
  const fileRef = useRef(null);
  const photoTarget = useRef(null);
  const groupRefs = useRef({});
  const [jumpedMonth, setJumpedMonth] = useState(null); // last month picked in the month dropdown
  const { data: needs } = useNeedsMe();
  const navigate = useNavigate();

  // Upcoming shows (and undated ones), soonest first. Past shows live in
  // the Logbook, not on the console.
  const strips = useMemo(() => {
    const t = todayISO();
    const up = (shows || []).filter((s) => !s.date || s.date >= t);
    return up.sort((a, b) => (!a.date ? 1 : !b.date ? -1 : a.date.localeCompare(b.date)));
  }, [shows]);

  // Progress (roles confirmed + open tasks) for every strip in one call, and
  // which roles are on each event the person owns (owners can read their
  // own invites).
  useEffect(() => {
    const ids = strips.map((s) => s.id).filter(Boolean);
    if (!ids.length) return;
    let alive = true;
    supabase.rpc("get_gigs_home_progress", { p_show_ids: ids }).then(({ data, error }) => {
      if (!alive || error || !data) return;
      const map = {};
      data.forEach((r) => { map[r.show_id] = r; });
      setProgress(map);
    });
    const owned = strips.filter((s) => s.is_owned !== false).map((s) => s.id);
    if (owned.length) {
      supabase.from("gig_invites").select("show_id, invited_role, status").in("show_id", owned).eq("status", "accepted").then(({ data, error }) => {
        if (!alive || error || !data) return;
        const map = {};
        data.forEach((r) => {
          const role = r.invited_role === "lighting" ? "engineer" : r.invited_role;
          (map[r.show_id] = map[r.show_id] || new Set()).add(role);
        });
        setRolesByShow(map);
      });
    }
    return () => { alive = false; };
  }, [strips]);

  const unreadByToken = useMemo(() => {
    const map = {};
    (needs?.chats || []).forEach((c) => { map[c.share_token] = (map[c.share_token] || 0) + Number(c.unread || 0); });
    return map;
  }, [needs]);

  const groups = useMemo(() => {
    const out = [];
    strips.forEach((s) => {
      const key = s.date ? s.date.slice(0, 7) : "undated";
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: s.date ? new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { month: "long" }).toUpperCase() : "NO DATE", items: [] };
        out.push(g);
      }
      g.items.push(s);
    });
    return out;
  }, [strips]);

  const totalOpen = strips.reduce((n, s) => n + Number(progress[s.id]?.open_tasks || 0), 0);
  const totalUnread = strips.reduce((n, s) => n + Number(unreadByToken[s.share_token] || 0), 0);

  const pickPhoto = (s) => {
    photoTarget.current = s;
    fileRef.current?.click();
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    const s = photoTarget.current;
    e.target.value = "";
    if (!file || !s) return;
    const key = s.id || s.share_token;
    setBusyPhoto(key);
    try {
      const url = await uploadIconImage(file);
      // Owners change the event's own photo; anyone else sets their personal one.
      if (s.is_owned !== false) {
        const { error } = await supabase.from("shows").update({ icon_url: url }).eq("id", s.id);
        if (error) throw error;
      } else {
        await saveMyIcon(s.id, url);
      }
      setPhotoOverride((m) => ({ ...m, [key]: url }));
    } catch (err) {
      console.error(err);
      window.alert("Couldn't change the photo. Try again.");
    }
    setBusyPhoto(null);
  };

  const rail = [
    { to: "/", label: "Home", Icon: Home, on: true },
    { to: "/calendar", label: "Calendar", Icon: CalendarDays },
    { to: "/experience", label: "Cockpit", Icon: PlaneTakeoff },
  ];

  // Strips share the visible width evenly: as many as fit at ~180px, none
  // cut off at the edge. Re-measured when the phone or window changes size.
  const rowRef = useRef(null);
  const [stripW, setStripW] = useState(184);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    const GAP = 8;
    const fit = () => {
      const w = el.clientWidth;
      const n = Math.max(2, Math.floor((w + GAP) / (176 + GAP)));
      setStripW(Math.floor((w - GAP * (n - 1)) / n));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [strips.length]);

  // Sideways is one fixed screen: nothing behind it scrolls, and the
  // strips only move left/right.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = [html.style.overflow, body.style.overflow, html.style.overscrollBehavior, body.style.overscrollBehavior];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      [html.style.overflow, body.style.overflow, html.style.overscrollBehavior, body.style.overscrollBehavior] = prev;
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-[80] flex bg-[#0d0d0d] text-[#f2f2f2] overflow-hidden" style={{ height: "100dvh", fontFamily: "Inter, system-ui, sans-serif", overscrollBehavior: "none", touchAction: "pan-x" }}>
      <nav aria-label="Main" className="w-[64px] shrink-0 flex flex-col items-center justify-center gap-1 border-r border-[#1e1e1e]" style={{ paddingLeft: "env(safe-area-inset-left)" }}>
        {rail.map(({ to, label, Icon, on }) => (
          <Link key={to} to={to} className="w-[60px] h-[52px] flex flex-col items-center justify-center gap-[3px] text-[12px] font-semibold" style={{ color: on ? accent : "rgba(255,255,255,0.65)" }}>
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col px-2.5 pt-2 pb-2" style={{ paddingRight: "max(10px, env(safe-area-inset-right))", paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
        <div className="h-8 mb-2 flex items-center gap-1.5 shrink-0 min-w-0">
          {/* One month dropdown instead of a chip per month: picking jumps to it. */}
          {groups.length > 0 && (() => {
            const cur = groups.find((g) => g.key === jumpedMonth) || groups[0];
            return (
              <MonthDropdown
                label={cur.label}
                value={cur.key}
                options={jumpMonthOptions(groups.map((x) => ({ key: x.key, label: x.label, count: x.items.length })))}
                onSelect={(picked) => { const k = nearestMonthKey(picked, groups.map((x) => x.key)); setJumpedMonth(k); groupRefs.current[k]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" }); }}
                accent={accent}
                ariaLabel="Jump to a month"
                className="h-8 px-3 shrink-0 rounded-full bg-[#1a1a1a] border border-[#333] text-[15px] font-bold tracking-[0.06em] text-white hover:bg-[#222]"
                style={{ fontFamily: SCENE_FONT }}
              />
            );
          })()}
          <span className="flex-1" />
          <span className="h-8 px-2.5 shrink-0 rounded-lg flex items-center gap-1 text-[13px] font-bold" style={{ background: "#341c0b", border: "1.5px solid #FF6A00", color: "#FF6A00" }}>
            <span style={{ fontFamily: SCENE_MONO }}>{totalOpen}</span> open
          </span>
          <span className="h-8 px-2.5 shrink-0 rounded-lg flex items-center gap-1 text-[13px] font-bold" style={{ background: "#0d1520", border: "1.5px solid #60A5FA", color: "#60A5FA" }}>
            <span style={{ fontFamily: SCENE_MONO }}>{totalUnread}</span> new
          </span>
          <Link to="/show/new" aria-label="Add a show" className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center" style={{ background: accent, color: "#0d0d0d" }}>
            <Plus className="w-4 h-4" strokeWidth={2.6} />
          </Link>
        </div>

        {strips.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/60 text-[15px]">No upcoming shows yet.</div>
        ) : (
          <div ref={rowRef} className="flex-1 min-h-0 flex gap-2 overflow-x-auto overflow-y-hidden snap-x snap-mandatory" style={{ scrollbarWidth: "none", overscrollBehavior: "contain", touchAction: "pan-x" }}>
            {groups.map((g) => g.items.map((s, i) => {
              const key = s.id || s.share_token;
              const color = eventTypeColor(s.event_type) || (s.is_owned === false ? "#F472B6" : accent);
              const photo = photoOverride[key] || s.icon_url;
              const pr = progress[s.id];
              const pct = pr && pr.total_roles ? Math.round((pr.confirmed_roles / pr.total_roles) * 100) : 0;
              const lvl = pct >= 80 ? "#8CFF3D" : pct >= 40 ? "#FF6A00" : "#E879F9";
              const open = Number(pr?.open_tasks || 0);
              const unread = Number(unreadByToken[s.share_token] || 0);
              const included = s.included_sections?.length ? s.included_sections : ROLES.map((r) => r.id);
              const on = rolesByShow[s.id];
              const glass = photo ? "rgba(10,10,10,0.6)" : "transparent";
              const btnBg = photo ? "rgba(20,20,20,0.85)" : "#242424";
              const d = s.date ? new Date(s.date + "T00:00:00") : null;
              return (
                <div
                  key={key}
                  ref={i === 0 ? (el) => { groupRefs.current[g.key] = el; } : undefined}
                  onClick={(e) => { if (!e.target.closest("a, button, input, label")) navigate(`/gig/web?token=${s.share_token}`); }}
                  className="shrink-0 h-full flex flex-col rounded-[10px] overflow-hidden relative isolate snap-start cursor-pointer"
                  style={{ width: stripW, background: "#171717", border: `1px solid ${photo ? color : "#2a2a2a"}` }}
                >
                  {photo && (
                    <>
                      <div aria-hidden="true" className="absolute inset-0 -z-30 bg-black" />
                      <img src={photo} alt="" className="absolute left-1/2 top-2.5 w-[240%] max-w-none -translate-x-1/2 -z-20" />
                      <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.6))" }} />
                    </>
                  )}

                  {/* Show */}
                  <Link to={`/gig/web?token=${s.share_token}`} className="shrink-0 px-2.5 pt-1.5 pb-2 flex flex-col gap-[2px] text-left" style={{ borderTop: `4px solid ${color}`, background: photo ? "linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.1))" : "#1c1c1c", textShadow: photo ? "0 1px 3px rgba(0,0,0,0.9)" : "none" }}>
                    <span className="text-[12px] leading-tight" style={{ fontFamily: SCENE_MONO, color }}>{d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() : "NO DATE"}</span>
                    <span className="text-[16px] font-semibold leading-snug truncate w-full">{s.event_name || s.band_name || "Untitled"}</span>
                    <span className="text-[12px] leading-tight text-white/75 truncate w-full">{s.venue || "No venue yet"}</span>
                  </Link>

                  {/* Tasks */}
                  <div className="shrink-0 px-2 py-1.5" style={{ background: glass, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <button type="button" onClick={() => navigate(`/gig/web?token=${s.share_token}`)} aria-label={open ? `${open} open tasks` : "No open tasks"} className="w-full h-8 flex items-center gap-1.5 px-2 rounded-lg" style={{ background: open ? "#341c0b" : "#0f1d08", border: `1.5px solid ${open ? "#FF6A00" : "#8CFF3D"}`, color: open ? "#FF6A00" : "#8CFF3D" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 12l3 3 5-6" /></svg>
                      {open > 0 && <span className="text-[15px] font-semibold" style={{ fontFamily: SCENE_MONO }}>{open}</span>}
                      <span className="text-[13px] font-bold" style={{ fontFamily: SCENE_FONT, letterSpacing: "0.05em" }}>{open ? (open === 1 ? "TASK OPEN" : "TASKS OPEN") : "ALL CLEAR"}</span>
                    </button>
                  </div>

                  {/* Who's on + sends, with the ready fader beside them */}
                  <div className="flex-1 min-h-0 flex gap-2 px-2 pt-1.5 pb-2" style={{ background: glass, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex-1 min-w-0 flex flex-col gap-[5px]">
                      {on || s.is_owned !== false ? (
                        ROLES.filter((r) => included.includes(r.id)).map((r) => {
                          const lit = on?.has(r.id);
                          return (
                            <span key={r.id} className="flex-1 min-h-[20px] max-h-[34px] rounded-[6px] flex items-center px-2 text-[14px] font-bold tracking-[0.05em]" style={{ fontFamily: SCENE_FONT, background: lit ? r.color : "#141414", border: `1.5px solid ${lit ? r.color : r.color + "66"}`, color: lit ? "#0d0d0d" : r.soft, boxShadow: lit ? `0 0 8px ${r.color}99` : "none" }}>
                              {r.label}
                            </span>
                          );
                        })
                      ) : (
                        <span className="flex-1 text-[13px] text-white/70 leading-snug py-1">Linked show. Open the web to see who's on it.</span>
                      )}
                      <div className="shrink-0 pt-1 grid grid-cols-4 gap-1.5">
                        <Link to={`/gig/rooms?token=${s.share_token}`} aria-label="Chat" className="h-9 rounded-lg flex items-center justify-center relative text-white" style={{ background: btnBg }}>
                          <MessageCircle className="w-4 h-4" />
                          {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-[#60A5FA] text-[#0d0d0d] text-[10px] font-bold flex items-center justify-center">{unread}</span>}
                        </Link>
                        {FAN_SIDE_OPEN && (
                          <button type="button" aria-label="Fan page" onClick={() => setFanShow(s)} className="h-9 rounded-lg flex items-center justify-center text-white" style={{ background: btnBg }}>
                            <Ticket className="w-4 h-4" />
                          </button>
                        )}
                        <Link to={`/gig/web?token=${s.share_token}`} aria-label="Open web" className="h-9 rounded-lg flex items-center justify-center text-white" style={{ background: btnBg }}>
                          <WebIcon size={17} />
                        </Link>
                        <button type="button" aria-label={photo ? "Change photo" : "Add photo"} onClick={() => pickPhoto(s)} disabled={busyPhoto === key} className="h-9 rounded-lg flex items-center justify-center text-white disabled:opacity-50" style={{ background: btnBg }}>
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="w-[40px] shrink-0 flex flex-col items-center gap-1 pt-0.5">
                      <div className="flex-1 min-h-0 flex gap-[7px]">
                        <div className="w-[7px] rounded bg-[#222] relative overflow-hidden" aria-hidden="true">
                          <div className="absolute left-0 right-0 bottom-0" style={{ height: `${pct}%`, background: lvl }} />
                        </div>
                        <div className="w-[5px] rounded bg-[#2e2e2e] relative" aria-hidden="true">
                          <div className="absolute -left-[10px] w-[25px] h-4 rounded bg-[#d4d4d4]" style={{ bottom: `calc((100% - 16px) * ${pct / 100})`, boxShadow: "0 2px 6px rgba(0,0,0,0.6)" }} />
                        </div>
                      </div>
                      <span className="text-[12px] leading-none" style={{ fontFamily: SCENE_MONO, color: lvl }} aria-label={`${pct}% ready`}>{pct}%</span>
                    </div>
                  </div>
                </div>
              );
            }))}
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      {fanShow && (
        <FanPageSheet
          showId={fanShow.is_owned !== false ? fanShow.id : undefined}
          shareToken={fanShow.is_owned !== false ? undefined : fanShow.share_token}
          onClose={() => setFanShow(null)}
        />
      )}
    </div>
  );
}
