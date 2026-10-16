import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, PlaneTakeoff, MessageCircle, Ticket, Camera, Plus, Search, SlidersHorizontal, MoreHorizontal, Archive, Trash2, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO, SCENE_BANKS, sceneTitle } from "@/lib/sceneStyle";
import { eventTypeColor } from "@/lib/eventTypes";
import { uploadIconImage, saveMyIcon } from "@/lib/eventIcons";
import { chatHref, chatTitle, dueInfo, localISO, readSeenChanges } from "@/lib/needsMe";
import { shareLink } from "@/lib/share";
import useNeedsMe from "@/hooks/useNeedsMe";
import { clearNewShowDraft } from "@/hooks/usePersistedState";
import FanPageSheet from "@/components/showpilot/FanPageSheet";
import TechRail from "@/components/showpilot/TechRail";
import MonthDropdown, { jumpMonthOptions, nearestMonthKey } from "@/components/showpilot/MonthDropdown";

// Audio tech desktop (1024px+): the mixing console. Each upcoming show is a
// channel strip, grouped by month like console banks, read top to bottom
// like a real strip: name -> open tasks -> which profiles are on it (lit =
// linked) -> sends (chat, fan page, web, share) -> fader (how show-ready it
// is). The event photo, if there is one, sits behind the strip.
// The page itself follows the same order: input (what came in), filter,
// the strips, and the rail on the left for going somewhere else.
// Mockup: "Audio tech desktop · event photo strips" on the Company Phone
// Layout canvas; rule in claude/design-principle-channel-strip-flow.md.
// The phone layout (Home.jsx) is untouched.

const ROLES = [
  { id: "venue", label: "VENUE", color: "#F2FF00", soft: "#c9d400" },
  { id: "promoter", label: "PROMOTER", color: "#60A5FA", soft: "#60A5FA" },
  { id: "booking_agent", label: "BOOKING", color: "#C026D3", soft: "#E879F9" },
  { id: "manager", label: "MANAGER", color: "#EF4444", soft: "#F87171" },
  { id: "engineer", label: "AUDIO/LX", color: "#8CFF3D", soft: "#8CFF3D" },
];

const ALL_BANK = { id: "all", label: "ALL", color: "#8CFF3D" };

// Section heights, shared by the strips and the labels column so they line up.
const H = { name: 104, tasks: 66, roles: 178, sends: 104 };

const WebIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4L19.6 9.5L16.7 18.5H7.3L4.4 9.5Z" />
    <path d="M12 12L12 4M12 12L19.6 9.5M12 12L16.7 18.5M12 12L7.3 18.5M12 12L4.4 9.5" />
    <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    {[[12, 4], [19.6, 9.5], [16.7, 18.5], [7.3, 18.5], [4.4, 9.5]].map(([x, y]) => <circle key={x + "-" + y} cx={x} cy={y} r="1.7" fill="currentColor" />)}
  </svg>
);

export default function TechConsoleDesk({
  shows, // already filtered by search / bank / dropdown filters
  loading,
  accent = "#8CFF3D",
  preferences,
  onPreferencesUpdate,
  search,
  setSearch,
  activeTab,
  setActiveTab,
  bankCounts,
  totalCount,
  filtersNode,
  hasActiveFilters,
  onOpen,
  onArchive,
  onDeleteRequest,
}) {
  const [progress, setProgress] = useState({});
  const [rolesByShow, setRolesByShow] = useState({});
  const [photoOverride, setPhotoOverride] = useState({});
  const [fanShow, setFanShow] = useState(null);
  const [busyPhoto, setBusyPhoto] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [toast, setToast] = useState("");
  const fileRef = useRef(null);
  const photoTarget = useRef(null);
  const groupRefs = useRef({});
  const { data: needs } = useNeedsMe();

  // Upcoming shows (and undated ones), soonest first. Past shows live in the
  // Logbook; a search still finds them.
  const strips = useMemo(() => {
    const t = localISO();
    const list = search ? [...shows] : shows.filter((s) => !s.date || s.date >= t);
    return list.sort((a, b) => (!a.date ? 1 : !b.date ? -1 : a.date.localeCompare(b.date)));
  }, [shows, search]);

  const stripIds = useMemo(() => strips.map((s) => s.id).filter(Boolean).join(","), [strips]);

  useEffect(() => {
    const ids = stripIds ? stripIds.split(",") : [];
    if (!ids.length) return undefined;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripIds]);

  // --- 1 · Input: what came in ---
  const today = localISO();
  const dueTasks = useMemo(() => (needs?.tasks || []).filter((t) => t.due_date && t.due_date <= today).sort((a, b) => a.due_date.localeCompare(b.due_date)), [needs, today]);
  const unreadChats = useMemo(() => (needs?.chats || []).filter((c) => Number(c.unread) > 0), [needs]);
  const unreadTotal = unreadChats.reduce((n, c) => n + Number(c.unread || 0), 0);
  const changes = useMemo(() => {
    const seen = readSeenChanges();
    return (needs?.changes || []).filter((c) => !seen.has(c.key));
  }, [needs]);
  const topTask = dueTasks[0] || (needs?.tasks || [])[0] || null;
  const topChat = unreadChats[0] || null;

  const unreadByToken = useMemo(() => {
    const map = {};
    (needs?.chats || []).forEach((c) => { map[c.share_token] = (map[c.share_token] || 0) + Number(c.unread || 0); });
    return map;
  }, [needs]);

  // --- 3 · The strips, grouped by month ---
  const groups = useMemo(() => {
    const out = [];
    strips.forEach((s) => {
      const key = s.date ? s.date.slice(0, 7) : "undated";
      let g = out.find((x) => x.key === key);
      if (!g) {
        const d = s.date ? new Date(s.date + "T00:00:00") : null;
        const thisYear = new Date().getFullYear();
        const label = d
          ? d.toLocaleDateString("en-US", d.getFullYear() === thisYear ? { month: "long" } : { month: "long", year: "numeric" }).toUpperCase()
          : "NO DATE";
        g = { key, label, items: [] };
        out.push(g);
      }
      g.items.push(s);
    });
    return out;
  }, [strips]);

  const flash = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  };

  const share = async (s) => {
    const url = `${window.location.origin}/gig/shared?token=${s.share_token}`;
    const r = await shareLink({ url, title: sceneTitle(s), text: `${sceneTitle(s)} on ShowPilot` });
    if (r === "copied") flash("Crew link copied");
    else if (r === "failed") flash("Couldn't share the link");
  };

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
      flash("Couldn't change the photo. Try again.");
    }
    setBusyPhoto(null);
  };

  const banks = [ALL_BANK, ...SCENE_BANKS];
  const countFor = (id) => (id === "all" ? totalCount : bankCounts[id] || 0);

  return (
    <div className="fixed inset-0 flex bg-[#0d0d0d] text-[#f2f2f2] overflow-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <TechRail accent={accent} preferences={preferences} onPreferencesUpdate={onPreferencesUpdate} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* 1 · Input */}
        <div className="flex items-center gap-[18px] px-6 py-3.5 border-b border-[#1a1a1a]">
          <h1 className="text-[26px] font-bold shrink-0" style={{ fontFamily: SCENE_FONT }}>Show<span style={{ color: accent }}>Pilot</span></h1>
          <div className="flex gap-2 shrink-0">
            <InputCount n={dueTasks.length} label="DUE NOW" color="#FF6A00" bg="#341c0b" to={topTask ? `/gig/web?token=${topTask.share_token}` : undefined} />
            <InputCount n={unreadTotal} label="UNREAD" color="#60A5FA" bg="#0d1520" to={topChat ? chatHref(topChat) : undefined} />
            <InputCount n={changes.length} label="CHANGED" color="#E879F9" bg="#24102a" to={changes[0] ? `/gig/web?token=${changes[0].share_token}` : undefined} />
          </div>
          <div className="flex-1 min-w-0 flex gap-2 overflow-hidden">
            {topTask && (
              <Link to={`/gig/web?token=${topTask.share_token}`} className="flex-1 min-w-0 flex items-center gap-2.5 h-[46px] px-3 rounded-[10px] bg-[#151515] border border-[#262626] hover:border-[#3a3a3a]">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dueInfo(topTask.due_date)?.urgent ? "#FF6A00" : "#9A9A9A" }} />
                <span className="flex-1 min-w-0 text-[13px] truncate">
                  <b>{topTask.title}</b> · {topTask.event_title || "Event"}{topTask.due_date ? ` · ${dueInfo(topTask.due_date).label.toLowerCase()}` : ""}
                </span>
              </Link>
            )}
            {topChat && (
              <Link to={chatHref(topChat)} className="flex-1 min-w-0 flex items-center gap-2.5 h-[46px] px-3 rounded-[10px] bg-[#151515] border border-[#262626] hover:border-[#3a3a3a]">
                <span className="w-2 h-2 rounded-full shrink-0 bg-[#60A5FA]" />
                <span className="flex-1 min-w-0 text-[13px] truncate">
                  <b>{topChat.last_sender_name || chatTitle(topChat)}:</b> {topChat.last_body || "New message"}
                </span>
              </Link>
            )}
            {!topTask && !topChat && needs && (
              <span className="self-center text-[13px] text-white/55">Nothing waiting on you right now.</span>
            )}
          </div>
          <Link to="/show/new" onClick={clearNewShowDraft} className="h-[46px] px-4 rounded-[10px] flex items-center gap-1.5 text-[15px] font-bold shrink-0" style={{ background: accent, color: "#0d0d0d" }}>
            <Plus className="w-4 h-4" strokeWidth={2.6} /> New show
          </Link>
        </div>

        {/* 2 · Filter */}
        <div className="px-6 py-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <label className="flex-1 min-w-[170px] max-w-[300px] flex items-center gap-2 h-10 px-3 rounded-[10px] bg-[#111] border border-[#222] text-[#8a8a8a] focus-within:border-[#444]">
              <Search className="w-4 h-4" />
              <input
                type="search"
                aria-label="Search shows"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search artists, venues, cities"
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-[#f2f2f2] placeholder:text-[#8a8a8a]"
              />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
              )}
            </label>
            {banks.map((b) => {
              const on = activeTab === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setActiveTab(b.id)}
                  aria-pressed={on}
                  className="h-10 px-2.5 xl:px-3.5 rounded-full text-[16px] xl:text-[17px] font-bold tracking-[0.04em] shrink-0"
                  style={{ fontFamily: SCENE_FONT, background: on ? b.color : b.color + "20", color: on ? "#0d0d0d" : b.color, border: `1.5px solid ${on ? b.color : b.color + "55"}` }}
                >
                  {b.label} <span className="text-[11px] opacity-80" style={{ fontFamily: SCENE_MONO }}>{countFor(b.id)}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="h-10 px-3 rounded-[10px] flex items-center gap-1.5 text-[14px] font-semibold shrink-0"
              style={filtersOpen || hasActiveFilters ? { background: accent, color: "#0d0d0d", border: `1px solid ${accent}` } : { background: "#111", color: "#b5b5b5", border: "1px solid #222" }}
            >
              <SlidersHorizontal className="w-4 h-4" /> Filters
            </button>
          </div>
          {filtersOpen && <div className="flex gap-2 flex-wrap">{filtersNode}</div>}
        </div>

        {/* 3 · The strips */}
        <div className="flex-1 min-h-0 mx-5 mb-[18px] mt-1 rounded-[14px] bg-[#101010] border border-[#1d1d1d] p-3.5 pb-3 flex overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
            </div>
          ) : strips.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-white/60 text-[15px]">
                {search || hasActiveFilters || activeTab !== "all" ? "No upcoming shows match." : "No upcoming shows yet."}
              </p>
              <div className="flex gap-2">
                <Link to="/show/new" onClick={clearNewShowDraft} className="h-10 px-4 rounded-[10px] flex items-center gap-1.5 text-[14px] font-bold" style={{ background: accent, color: "#0d0d0d" }}>
                  <Plus className="w-4 h-4" /> New show
                </Link>
                <Link to="/logbook" className="h-10 px-4 rounded-[10px] flex items-center text-[14px] font-semibold bg-[#1a1a1a] border border-[#333] text-white/80">Past shows: Logbook</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0 flex overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
                {groups.map((g, gi) => (
                  <div
                    key={g.key}
                    ref={(el) => { groupRefs.current[g.key] = el; }}
                    className="flex flex-col gap-2 shrink-0"
                    style={gi < groups.length - 1 ? { paddingRight: 14, marginRight: 14, borderRight: "1px solid #222" } : undefined}
                  >
                    {/* Month heading = dropdown of every month bank; picking one jumps to it. */}
                    <div className="h-[26px] flex items-center">
                      <MonthDropdown
                        label={g.label}
                        value={g.key}
                        options={jumpMonthOptions(groups.map((x) => ({ key: x.key, label: x.label, count: x.items.length })))}
                        onSelect={(picked) => groupRefs.current[nearestMonthKey(picked, groups.map((x) => x.key))]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })}
                        accent={gi % 2 ? "#60A5FA" : accent}
                        ariaLabel="Jump to a month"
                        className="-ml-1 px-1 h-[28px] text-[20px] font-bold tracking-[0.08em]"
                        style={{ fontFamily: SCENE_FONT, color: gi % 2 ? "#60A5FA" : accent }}
                      />
                    </div>
                    <div className="flex-1 min-h-0 flex gap-2">
                      {g.items.map((s) => (
                        <Strip
                          key={s.id || s.share_token}
                          s={s}
                          accent={accent}
                          photo={photoOverride[s.id || s.share_token] || s.icon_url}
                          pr={progress[s.id]}
                          on={rolesByShow[s.id]}
                          unread={Number(unreadByToken[s.share_token] || 0)}
                          busyPhoto={busyPhoto === (s.id || s.share_token)}
                          menuOpen={menuFor === (s.id || s.share_token)}
                          onMenu={(open) => setMenuFor(open ? s.id || s.share_token : null)}
                          onOpen={onOpen}
                          onFan={() => setFanShow(s)}
                          onShare={() => share(s)}
                          onPhoto={() => pickPhoto(s)}
                          onArchive={() => { setMenuFor(null); onArchive(s); }}
                          onDelete={() => { setMenuFor(null); onDeleteRequest(s); }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 rounded-lg bg-[#1f1f1f] border border-[#333] text-sm text-white">{toast}</div>
      )}
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

function InputCount({ n, label, color, bg, to }) {
  const inner = (
    <>
      <span className="text-[20px] font-semibold" style={{ fontFamily: SCENE_MONO }}>{n}</span>
      <span className="text-[13px] font-bold tracking-[0.06em]" style={{ fontFamily: SCENE_FONT }}>{label}</span>
    </>
  );
  const cls = "h-[46px] px-3 rounded-[10px] flex items-center gap-2";
  const style = n ? { background: bg, border: `1.5px solid ${color}`, color } : { background: "#141414", border: "1.5px solid #2a2a2a", color: "#8a8a8a" };
  return n && to ? <Link to={to} className={cls} style={style}>{inner}</Link> : <span className={cls} style={style}>{inner}</span>;
}

function Strip({ s, accent, photo, pr, on, unread, busyPhoto, menuOpen, onMenu, onOpen, onFan, onShare, onPhoto, onArchive, onDelete }) {
  const color = eventTypeColor(s.event_type) || (s.is_owned === false ? "#F472B6" : accent);
  const pct = pr && pr.total_roles ? Math.round((pr.confirmed_roles / pr.total_roles) * 100) : 0;
  const lvl = pct >= 80 ? "#8CFF3D" : pct >= 40 ? "#FF6A00" : "#E879F9";
  const open = Number(pr?.open_tasks || 0);
  const included = s.included_sections?.length ? s.included_sections : ROLES.map((r) => r.id);
  const glass = photo ? "rgba(10,10,10,0.55)" : "transparent";
  const line = photo ? "rgba(255,255,255,0.12)" : "#262626";
  const btnBg = photo ? "rgba(20,20,20,0.8)" : "#222";
  const ts = photo ? "0 1px 3px rgba(0,0,0,0.9)" : "none";
  const d = s.date ? new Date(s.date + "T00:00:00") : null;
  const webTo = `/gig/web?token=${s.share_token}`;
  const navigate = useNavigate();
  // The whole strip opens the event's web, except its own buttons and links.
  const openWeb = (e) => {
    if (e.target.closest("a, button, input, label")) return;
    navigate(webTo);
  };

  return (
    <div onClick={openWeb} className="w-[192px] shrink-0 h-full flex flex-col rounded-[10px] overflow-hidden relative isolate cursor-pointer hover:brightness-110 transition-[filter]" style={{ background: "#171717", border: `1px solid ${photo ? color : "#2a2a2a"}` }}>
      {photo && (
        <>
          <div aria-hidden="true" className="absolute inset-0 -z-30 bg-black" />
          <img src={photo} alt="" className="absolute left-1/2 top-10 w-[260%] max-w-none -translate-x-1/2 -z-20" />
          <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.5))" }} />
        </>
      )}

      {/* Show */}
      <div className="relative shrink-0" style={{ height: H.name, borderTop: `4px solid ${color}`, background: photo ? "linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0))" : "#1c1c1c" }}>
        <Link to={webTo} title="Open the event web" className="w-full h-full px-2.5 pt-2 pb-2 flex flex-col gap-[3px] text-left" style={{ textShadow: ts }}>
          <span className="text-[13px] pr-6" style={{ fontFamily: SCENE_MONO, color }}>{d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() : "NO DATE"}</span>
          <span className="text-[18px] font-semibold leading-[1.15] line-clamp-2 w-full">{sceneTitle(s)}</span>
          <span className="text-[13px] text-white/75 truncate w-full">{s.venue || "No venue yet"}</span>
        </Link>
        <button type="button" aria-label="More" aria-expanded={menuOpen} onClick={() => onMenu(!menuOpen)} className="absolute top-1 right-1 w-6 h-6 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10">
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="absolute top-8 right-1 z-20 w-[132px] rounded-lg bg-[#1a1a1a] border border-[#333] shadow-xl overflow-hidden" onMouseLeave={() => onMenu(false)}>
            <button type="button" onClick={onArchive} className="w-full h-9 px-3 flex items-center gap-2 text-[13px] text-blue-300 hover:bg-white/5"><Archive className="w-3.5 h-3.5" /> Archive</button>
            <button type="button" onClick={onDelete} className="w-full h-9 px-3 flex items-center gap-2 text-[13px] text-red-400 hover:bg-white/5"><Trash2 className="w-3.5 h-3.5" /> {s.is_owned === false ? "Remove" : "Delete"}</button>
          </div>
        )}
      </div>

      {/* Tasks */}
      <div className="shrink-0 px-2.5 py-2 flex" style={{ height: H.tasks, borderTop: `1px solid ${line}`, background: glass }}>
        <Link
          to={webTo}
          aria-label={open ? `${open} open tasks` : "No open tasks"}
          className="flex-1 flex items-center gap-2 px-2.5 rounded-lg"
          style={{ background: open ? "#341c0b" : "#0f1d08", border: `1.5px solid ${open ? "#FF6A00" : "#8CFF3D"}`, color: open ? "#FF6A00" : "#8CFF3D", boxShadow: open ? "0 0 12px rgba(255,106,0,0.35)" : "none" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 12l3 3 5-6" /></svg>
          <span className="flex flex-col items-start leading-[1.05]">
            {open > 0 && <span className="text-[19px] font-semibold" style={{ fontFamily: SCENE_MONO }}>{open}</span>}
            <span className="text-[14px] font-bold tracking-[0.06em]" style={{ fontFamily: SCENE_FONT }}>{open ? (open === 1 ? "TASK OPEN" : "TASKS OPEN") : "ALL CLEAR"}</span>
          </span>
        </Link>
      </div>

      {/* Who's on + sends, with the ready fader running beside them */}
      <div className="flex-1 min-h-0 flex" style={{ borderTop: `1px solid ${line}`, background: glass }}>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 pl-2.5 pr-1 py-2 flex flex-col gap-1.5" style={{ height: H.roles }}>
            {on || s.is_owned !== false ? (
              ROLES.filter((r) => included.includes(r.id)).map((r) => {
                const lit = on?.has(r.id);
                return (
                  <span
                    key={r.id}
                    className="h-[27px] shrink-0 rounded-[6px] flex items-center px-2 text-[15px] font-bold tracking-[0.05em]"
                    style={{ fontFamily: SCENE_FONT, background: lit ? r.color : "#141414", border: `1.5px solid ${lit ? r.color : r.color + "66"}`, color: lit ? "#0d0d0d" : r.soft, boxShadow: lit ? `0 0 10px ${r.color}99` : "none" }}
                    title={lit ? `${r.label} is on this show` : `${r.label} not linked yet`}
                  >
                    {r.label}
                  </span>
                );
              })
            ) : (
              <span className="text-[14px] text-white/70 leading-snug py-1">Linked show. Open the web to see who's on it.</span>
            )}
          </div>

          <div className="shrink-0 pl-2.5 pr-1 py-2 grid grid-cols-2 gap-1.5 content-start" style={{ height: H.sends, borderTop: `1px solid ${line}` }}>
            <Link to={`/gig/rooms?token=${s.share_token}`} aria-label={unread ? `Chat, ${unread} unread` : "Chat"} title="Chat" className="h-[38px] rounded-lg flex items-center justify-center relative text-white hover:brightness-125" style={{ background: btnBg }}>
              <MessageCircle className="w-[18px] h-[18px]" />
              {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-[#60A5FA] text-[#0d0d0d] text-[10px] font-bold flex items-center justify-center">{unread}</span>}
            </Link>
            <button type="button" aria-label="Fan page" title="Fan page" onClick={onFan} className="h-[38px] rounded-lg flex items-center justify-center text-white hover:brightness-125" style={{ background: btnBg }}>
              <Ticket className="w-[18px] h-[18px]" />
            </button>
            <Link to={webTo} aria-label="Open web" title="Open web" className="h-[38px] rounded-lg flex items-center justify-center text-white hover:brightness-125" style={{ background: btnBg }}>
              <WebIcon size={20} />
            </Link>
            <button type="button" onClick={onShare} className="h-[38px] rounded-lg bg-transparent border border-[#3a3a3a] text-[#e5e5e5] text-[14px] font-semibold hover:border-[#555]">Share</button>
          </div>

          <div className="flex-1 min-h-0 flex items-end p-2">
            <button type="button" aria-label={photo ? "Change photo" : "Add photo"} title={photo ? "Change photo" : "Add photo"} onClick={onPhoto} disabled={busyPhoto} className="h-8 px-2 rounded-[7px] flex items-center gap-1.5 text-[12px] font-semibold text-white disabled:opacity-50 hover:border-white/50" style={{ background: "rgba(13,13,13,0.85)", border: "1px solid rgba(255,255,255,0.25)" }}>
              <Camera className="w-3.5 h-3.5" /> {photo ? "Photo" : "Add photo"}
            </button>
          </div>
        </div>

        {/* Ready fader */}
        <div className="w-[46px] shrink-0 flex flex-col items-center gap-1.5 pt-3 pb-2 border-l" style={{ borderColor: line }} title="Profiles confirmed on this show">
          <div className="flex-1 min-h-0 flex gap-[9px]">
            <div className="w-2 rounded bg-[#222] relative overflow-hidden" aria-hidden="true">
              <div className="absolute left-0 right-0 bottom-0" style={{ height: `${pct}%`, background: lvl }} />
            </div>
            <div className="w-1.5 rounded bg-[#2e2e2e] relative" aria-hidden="true">
              <div className="absolute -left-[11px] w-7 h-[18px] rounded bg-[#d4d4d4]" style={{ bottom: `calc((100% - 18px) * ${pct / 100})`, boxShadow: "0 2px 6px rgba(0,0,0,0.6)" }} />
            </div>
          </div>
          <span className="text-[13px] leading-none" style={{ fontFamily: SCENE_MONO, color: lvl }} aria-label={`${pct}% ready`}>{pct}%</span>
          <span className="text-[10px] leading-none tracking-[0.1em] text-white/60" style={{ fontFamily: SCENE_MONO }}>READY</span>
        </div>
      </div>
    </div>
  );
}
