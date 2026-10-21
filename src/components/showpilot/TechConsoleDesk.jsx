import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, Ticket, Camera, Plus, Search, SlidersHorizontal, MoreHorizontal, Archive, Trash2, X, Share2, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO, SCENE_BANKS, sceneTitle } from "@/lib/sceneStyle";
import { eventTypeColor } from "@/lib/eventTypes";
import { uploadIconImage, saveMyIcon } from "@/lib/eventIcons";
import { localISO, addDaysISO } from "@/lib/needsMe";
import { shareLink } from "@/lib/share";
import useNeedsMe from "@/hooks/useNeedsMe";
import { clearNewShowDraft } from "@/hooks/usePersistedState";
import FanPageSheet from "@/components/showpilot/FanPageSheet";
import TechRail from "@/components/showpilot/TechRail";
import MonthDropdown, { jumpMonthOptions, nearestMonthKey } from "@/components/showpilot/MonthDropdown";
import { FAN_RSVP_OPEN } from "@/lib/hiddenProfiles";

// Audio tech desktop (1024px+): the mixing console. Each upcoming show is a
// channel strip, grouped by month like console banks, read top to bottom
// like a real strip: name -> your open tasks (opens the event's task page)
// -> which profiles are on it (lit = someone's on it) -> sends (chat, fan
// page, share) -> fader (how show-ready it is). Clicking the strip itself
// opens the event web. The event photo, if there is one, sits behind it.
// A "This week" row sits above the strips (v2, Oct 21: AudioDeskV2 board).
// The page itself follows the same order: input (what came in), filter,
// the strips, and the rail on the left for going somewhere else.
// Mockup: "Audio tech desktop · event photo strips" on the Company Phone
// Layout canvas; rule in claude/design-principle-channel-strip-flow.md.
// The phone layout (Home.jsx) is untouched.

const ROLES = [
  { id: "venue", label: "VENUE", color: "#60A5FA", soft: "#60A5FA" },
  { id: "manager", label: "MANAGER/ARTIST", color: "#EF4444", soft: "#F87171" },
  { id: "engineer", label: "AUDIO/LX", color: "#8CFF3D", soft: "#8CFF3D" },
];
// Roles as the database names them -> the three profile boxes.
const ROLE_BOX = { venue: "venue", manager: "manager", band: "manager", engineer: "engineer", lighting: "engineer" };
const SEND = { chat: "#60A5FA", fan: "#E879F9", share: "#8CFF3D" };

const ALL_BANK = { id: "all", label: "ALL", color: "#8CFF3D" };

export default function TechConsoleDesk({
  shows, // already filtered by search / bank / dropdown filters
  allShows, // every show, for the week view
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
  const stripScrollRef = useRef(null);
  const [visibleMonth, setVisibleMonth] = useState(null);
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
    // Who's on. Your own shows: you (the audio / lighting box) plus every
    // accepted invite. Linked shows: whoever has claimed a role, from the
    // same permissions call the event web uses.
    const owned = strips.filter((s) => s.is_owned !== false).map((s) => s.id);
    if (owned.length) {
      supabase.from("gig_invites").select("show_id, invited_role, status").in("show_id", owned).eq("status", "accepted").then(({ data, error }) => {
        if (!alive || error) return;
        const map = {};
        owned.forEach((id) => { map[id] = new Set(["engineer"]); });
        (data || []).forEach((r) => { if (ROLE_BOX[r.invited_role] && map[r.show_id]) map[r.show_id].add(ROLE_BOX[r.invited_role]); });
        setRolesByShow((m) => ({ ...m, ...map }));
      });
    }
    strips.filter((s) => s.is_owned === false && s.share_token).forEach((s) => {
      supabase.rpc("get_gig_section_permissions", { p_token: s.share_token }).then(({ data, error }) => {
        if (!alive || error || !data) return;
        const set = new Set();
        [...(data.claimed_roles || []), ...(data.my_roles || [])].forEach((r) => ROLE_BOX[r] && set.add(ROLE_BOX[r]));
        setRolesByShow((m) => ({ ...m, [s.id]: set }));
      });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripIds]);

  const today = localISO();

  // Your profile's open tasks on each show (get_needs_me only returns tasks
  // in your own sections).
  const myTasksByToken = useMemo(() => {
    const map = {};
    (needs?.tasks || []).forEach((t) => { map[t.share_token] = (map[t.share_token] || 0) + 1; });
    return map;
  }, [needs]);

  // This week (Mon-Sun), moved with the arrows.
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDays = useMemo(() => {
    const now = new Date();
    const dow = now.getDay();
    const monday = addDaysISO(-(dow === 0 ? 6 : dow - 1) + weekOffset * 7);
    const base = new Date(monday + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = localISO(d);
      return { key, d, shows: (allShows || shows).filter((x) => x.date === key) };
    });
  }, [weekOffset, allShows, shows]);

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

  // The month dropdown (next to the week arrows) names the month the strips
  // are scrolled to; picking one scrolls the strips there.
  const syncVisibleMonth = () => {
    const box = stripScrollRef.current;
    if (!box || !groups.length) return;
    const left = box.getBoundingClientRect().left;
    const hit = groups.find((g) => {
      const el = groupRefs.current[g.key];
      return el && el.getBoundingClientRect().right > left + 40;
    });
    setVisibleMonth((hit || groups[0]).key);
  };
  useEffect(() => { syncVisibleMonth(); }, [groups]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownMonth = groups.find((g) => g.key === visibleMonth) || groups[0];
  const jumpToMonth = (picked) => {
    const key = nearestMonthKey(picked, groups.map((x) => x.key));
    groupRefs.current[key]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setVisibleMonth(key);
  };

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
        {/* Top bar: title, search, banks, filters, New show - one row,
            like the company desktop home. */}
        <div className="flex items-center gap-2.5 xl:gap-3 px-6 py-3 border-b border-[#1a1a1a]">
          <h1 className="text-[26px] font-bold shrink-0 mr-1 xl:mr-2" style={{ fontFamily: SCENE_FONT }}>Show<span style={{ color: accent }}>Pilot</span></h1>
          <label className="flex-1 min-w-[150px] max-w-[300px] flex items-center gap-2 h-10 px-3 rounded-[10px] bg-[#111] border border-[#222] text-[#8a8a8a] focus-within:border-[#444]">
            <Search className="w-4 h-4 shrink-0" />
            <input
              type="search"
              aria-label="Search shows"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shows"
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
                className="h-10 px-2 xl:px-3.5 rounded-full text-[15px] xl:text-[17px] font-bold tracking-[0.03em] xl:tracking-[0.04em] shrink-0 whitespace-nowrap"
                style={{ fontFamily: SCENE_FONT, background: on ? b.color : b.color + "20", color: on ? "#0d0d0d" : b.color, border: `1.5px solid ${on ? b.color : b.color + "55"}` }}
              >
                {b.label} <span className="text-[10px] xl:text-[11px] opacity-80" style={{ fontFamily: SCENE_MONO }}>{countFor(b.id)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-label="Filters"
            className="h-10 px-2.5 xl:px-3 rounded-[10px] flex items-center gap-1.5 text-[14px] font-semibold shrink-0"
            style={filtersOpen || hasActiveFilters ? { background: accent, color: "#0d0d0d", border: `1px solid ${accent}` } : { background: "#111", color: "#b5b5b5", border: "1px solid #222" }}
          >
            <SlidersHorizontal className="w-4 h-4" /><span className="hidden xl:inline">Filters</span>
          </button>
          <Link to="/show/new" onClick={clearNewShowDraft} aria-label="New show" className="ml-auto h-[44px] px-3 xl:px-4 rounded-[10px] flex items-center gap-1.5 text-[15px] font-bold shrink-0 whitespace-nowrap" style={{ background: accent, color: "#0d0d0d" }}>
            <Plus className="w-4 h-4" strokeWidth={2.6} /><span className="hidden xl:inline">New show</span>
          </Link>
        </div>
        {filtersOpen && <div className="px-6 py-2.5 flex gap-2 flex-wrap border-b border-[#1a1a1a]">{filtersNode}</div>}

        {/* This week */}
        <div className="px-6 pt-3">
          <div className="flex items-center gap-2.5 mb-2">
            <h2 className="text-[18px] font-bold tracking-[0.08em]" style={{ fontFamily: SCENE_FONT }}>{weekOffset === 0 ? "THIS WEEK" : weekOffset === 1 ? "NEXT WEEK" : weekOffset === -1 ? "LAST WEEK" : "WEEK"}</h2>
            <span className="text-[12px] text-white/55" style={{ fontFamily: SCENE_MONO }}>
              {weekDays[0].d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} – {weekDays[6].d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
            </span>
            <div className="ml-2 flex items-center gap-1.5">
              <button type="button" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week" className="w-8 h-8 rounded-lg bg-[#111] border border-[#262626] flex items-center justify-center text-white/70 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
              {weekOffset !== 0 && <button type="button" onClick={() => setWeekOffset(0)} className="h-8 px-2.5 rounded-lg bg-[#111] border border-[#262626] text-[12px] font-semibold text-white/75 hover:text-white">This week</button>}
              <button type="button" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week" className="w-8 h-8 rounded-lg bg-[#111] border border-[#262626] flex items-center justify-center text-white/70 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
            </div>
            {shownMonth && (
              <>
                <span className="w-px h-6 bg-[#2a2a2a] mx-2" aria-hidden="true" />
                <MonthDropdown
                  label={shownMonth.label}
                  value={shownMonth.key}
                  options={jumpMonthOptions(groups.map((x) => ({ key: x.key, label: x.label, count: x.items.length })))}
                  onSelect={jumpToMonth}
                  accent={accent}
                  ariaLabel="Jump to a month"
                  className="px-1 h-8 text-[18px] font-bold tracking-[0.08em]"
                  style={{ fontFamily: SCENE_FONT, color: accent }}
                />
              </>
            )}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const isToday = day.key === today;
              return (
                <div key={day.key} className="h-[84px] rounded-[10px] px-2 py-1.5 flex flex-col gap-1 min-w-0 overflow-hidden"
                  style={{ background: isToday ? "#132009" : "#111", border: isToday ? `1.5px solid ${accent}` : "1px solid #1f1f1f", boxShadow: isToday ? "0 0 14px rgba(140,255,61,0.2)" : "none" }}>
                  <div className="flex items-baseline gap-1.5" style={{ fontFamily: SCENE_MONO }}>
                    <span className="text-[11px] tracking-[0.1em]" style={{ color: isToday ? accent : "#8f8f8f" }}>{day.d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</span>
                    <span className="text-[15px] font-semibold" style={{ color: isToday ? accent : "#e5e5e5" }}>{day.d.getDate()}</span>
                    {isToday && <span className="ml-auto text-[9px] tracking-[0.1em]" style={{ color: accent }}>TODAY</span>}
                  </div>
                  {day.shows.slice(0, 2).map((x) => {
                    const c = eventTypeColor(x.event_type) || (x.is_owned === false ? "#F472B6" : accent);
                    return (
                      <Link key={x.id || x.share_token} to={`/gig/web?token=${x.share_token}`} className="block min-w-0 rounded-md px-1.5 py-0.5 hover:brightness-125" style={{ background: c + "22", borderLeft: `3px solid ${c}` }}>
                        <span className="block text-[13px] font-semibold truncate">{sceneTitle(x)}</span>
                        {day.shows.length === 1 && <span className="block text-[11px] text-white/60 truncate">{x.venue || "No venue yet"}</span>}
                      </Link>
                    );
                  })}
                  {day.shows.length > 2 && <span className="text-[10px] text-white/50" style={{ fontFamily: SCENE_MONO }}>+{day.shows.length - 2} more</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3 · The strips */}
        <div className="flex-1 min-h-0 mx-5 mb-[18px] mt-3.5 rounded-[14px] bg-[#101010] border border-[#1d1d1d] p-3.5 pb-3 flex overflow-hidden">
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
              <div ref={stripScrollRef} onScroll={syncVisibleMonth} className="flex-1 min-w-0 flex overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
                {groups.map((g, gi) => (
                  <div
                    key={g.key}
                    ref={(el) => { groupRefs.current[g.key] = el; }}
                    className="flex flex-col gap-2 shrink-0"
                    style={gi < groups.length - 1 ? { paddingRight: 14, marginRight: 14, borderRight: "1px solid #222" } : undefined}
                  >
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
                          myTasks={Number(myTasksByToken[s.share_token] || 0)}
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

function Strip({ s, accent, photo, pr, on, unread, myTasks, busyPhoto, menuOpen, onMenu, onFan, onShare, onPhoto, onArchive, onDelete }) {
  const color = eventTypeColor(s.event_type) || (s.is_owned === false ? "#F472B6" : accent);
  const pct = pr && pr.total_roles ? Math.round((pr.confirmed_roles / pr.total_roles) * 100) : 0;
  const lvl = pct >= 80 ? "#8CFF3D" : pct >= 40 ? "#FF6A00" : "#E879F9";
  const glass = photo ? "rgba(10,10,10,0.6)" : "transparent";
  const line = photo ? "rgba(255,255,255,0.12)" : "#262626";
  const ts = photo ? "0 1px 3px rgba(0,0,0,0.9)" : "none";
  const d = s.date ? new Date(s.date + "T00:00:00") : null;
  const webTo = `/gig/web?token=${s.share_token}`;
  const navigate = useNavigate();
  // The whole strip opens the event's web, except its own buttons and links.
  const openWeb = (e) => {
    if (e.target.closest("a, button, input, label")) return;
    navigate(webTo);
  };
  const sendBtn = (c) => ({ background: photo ? "rgba(13,13,13,0.85)" : c + "1c", border: `1px solid ${c}73`, color: c });

  return (
    <div onClick={openWeb} className="w-[210px] shrink-0 h-full flex flex-col rounded-[10px] overflow-hidden relative isolate cursor-pointer hover:brightness-110 transition-[filter]" style={{ background: "#171717", border: `1px solid ${photo ? color : "#2a2a2a"}` }}>
      {photo && (
        <>
          <div aria-hidden="true" className="absolute inset-0 -z-30 bg-black" />
          <img src={photo} alt="" className="absolute left-1/2 top-10 w-[260%] max-w-none -translate-x-1/2 -z-20" />
          <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.5))" }} />
        </>
      )}

      {/* Show */}
      <div className="relative shrink-0" style={{ borderTop: `4px solid ${color}`, background: photo ? "linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.1))" : "#1c1c1c" }}>
        <Link to={webTo} title="Open the event web" className="w-full px-[11px] pt-2 pb-2.5 flex flex-col gap-[3px] text-left" style={{ textShadow: ts }}>
          <span className="text-[12px] pr-6" style={{ fontFamily: SCENE_MONO, color }}>{d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() : "NO DATE"}</span>
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

      <div className="flex-1 min-h-0 flex" style={{ borderTop: `1px solid ${line}`, background: glass }}>
        <div className="flex-1 min-w-0 flex flex-col gap-2.5 py-2.5 pl-2.5 pr-2">
          {/* Your tasks -> the event's task page */}
          <Link
            to={`/gig/tasks?token=${s.share_token}`}
            aria-label={myTasks ? `${myTasks} open ${myTasks === 1 ? "task" : "tasks"} for you` : "No tasks for you"}
            className="h-[44px] shrink-0 flex items-center gap-1.5 px-2 rounded-[9px] hover:brightness-125"
            style={myTasks
              ? { background: "#341c0b", border: "1.5px solid #FF6A00", color: "#FF6A00", boxShadow: "0 0 12px rgba(255,106,0,0.3)" }
              : { background: photo ? "rgba(13,13,13,0.85)" : "#151515", border: "1.5px solid #3a3a3a", color: "#a3a3a3" }}
          >
            <ClipboardList className="w-[18px] h-[18px] shrink-0" />
            <span className="text-[15px] font-bold tracking-[0.03em] whitespace-nowrap" style={{ fontFamily: SCENE_FONT }}>{myTasks ? `${myTasks} ${myTasks === 1 ? "TASK" : "TASKS"}` : "NO TASKS"}</span>
            <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0" />
          </Link>

          {/* Who's on */}
          <div className="flex flex-col gap-1.5" style={{ textShadow: ts }}>
            <span className="text-[10px] tracking-[0.12em] text-white/55" style={{ fontFamily: SCENE_MONO }}>WHO'S ON</span>
            {ROLES.map((r) => {
              const lit = on?.has(r.id);
              return (
                <span
                  key={r.id}
                  className="h-[27px] shrink-0 rounded-[6px] flex items-center px-1.5 text-[13px] font-bold tracking-[0.02em] whitespace-nowrap overflow-hidden"
                  style={{ fontFamily: SCENE_FONT, textShadow: "none", background: lit ? r.color : "#141414", border: `1.5px solid ${lit ? r.color : r.color + "59"}`, color: lit ? "#0d0d0d" : r.soft, boxShadow: lit ? `0 0 10px ${r.color}88` : "none" }}
                  title={lit ? `${r.label} is on this show` : `No one on ${r.label} yet`}
                >
                  {r.label}
                </span>
              );
            })}
          </div>

          {/* Sends */}
          <div className={`grid ${FAN_RSVP_OPEN ? "grid-cols-4" : "grid-cols-3"} gap-1.5`}>
            <Link to={`/gig/rooms?token=${s.share_token}`} aria-label={unread ? `Chat, ${unread} unread` : "Chat"} title="Chat" className="h-[40px] rounded-[9px] flex items-center justify-center relative hover:brightness-125" style={sendBtn(SEND.chat)}>
              <MessageCircle className="w-[18px] h-[18px]" />
              {unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-0.5 rounded-full bg-[#60A5FA] text-[#0d0d0d] text-[10px] font-bold flex items-center justify-center">{unread}</span>}
            </Link>
            {FAN_RSVP_OPEN && (
              <button type="button" aria-label="Fan page" title="Fan page" onClick={onFan} className="h-[40px] rounded-[9px] flex items-center justify-center hover:brightness-125" style={sendBtn(SEND.fan)}>
                <Ticket className="w-[18px] h-[18px]" />
              </button>
            )}
            <button type="button" aria-label="Share crew link" title="Share crew link" onClick={onShare} className="h-[40px] rounded-[9px] flex items-center justify-center hover:brightness-125" style={sendBtn(SEND.share)}>
              <Share2 className="w-[18px] h-[18px]" />
            </button>
            <button type="button" aria-label={photo ? "Change the strip photo" : "Add a strip photo"} title={photo ? "Change photo" : "Add photo"} onClick={onPhoto} disabled={busyPhoto} className="h-[40px] rounded-[9px] flex items-center justify-center text-white/80 disabled:opacity-50 hover:text-white" style={{ background: photo ? "rgba(13,13,13,0.85)" : "#1a1a1a", border: "1px solid #3a3a3a" }}>
              <Camera className="w-[17px] h-[17px]" />
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
