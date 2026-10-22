import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, Ticket, Camera, Plus, Search, MoreHorizontal, Archive, Trash2, X, Share2, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO, sceneTitle } from "@/lib/sceneStyle";
import { eventTypeColor } from "@/lib/eventTypes";
import { uploadIconImage, saveMyIcon } from "@/lib/eventIcons";
import { localISO, addDaysISO } from "@/lib/needsMe";
import { shareLink } from "@/lib/share";
import useNeedsMe from "@/hooks/useNeedsMe";
import { clearNewShowDraft } from "@/hooks/usePersistedState";
import FanPageSheet from "@/components/showpilot/FanPageSheet";
import TechRail from "@/components/showpilot/TechRail";
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
  { id: "venue", label: "VENUE", short: "VENUE", color: "#60A5FA", soft: "#60A5FA" },
  { id: "manager", label: "MANAGER/ARTIST", short: "MGR/ARTIST", tiny: "MGR", color: "#EF4444", soft: "#F87171" },
  { id: "engineer", label: "AUDIO/LX", short: "AUDIO/LX", color: "#8CFF3D", soft: "#8CFF3D" },
];
// Roles as the database names them -> the three profile boxes.
const ROLE_BOX = { venue: "venue", manager: "manager", band: "manager", engineer: "engineer", lighting: "engineer" };
const SEND = { chat: "#60A5FA", fan: "#E879F9", share: "#8CFF3D" };


export default function TechConsoleDesk({
  shows, // already filtered by search / bank / dropdown filters
  pool, // every show that passes the dropdown filters (no bank, no search)
  loading,
  accent = "#8CFF3D",
  preferences,
  onPreferencesUpdate,
  search,
  setSearch,
  onOpen,
  onArchive,
  onDeleteRequest,
}) {
  const [progress, setProgress] = useState({});
  const [rolesByShow, setRolesByShow] = useState({});
  const [photoOverride, setPhotoOverride] = useState({});
  const [fanShow, setFanShow] = useState(null);
  const [busyPhoto, setBusyPhoto] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [toast, setToast] = useState("");
  const fileRef = useRef(null);
  const photoTarget = useRef(null);
  const { data: needs } = useNeedsMe();

  // Home is a look at the coming week: today and the six days after, moved
  // a week at a time with the arrows. Nothing that week = nothing on the
  // console. Event types (New / Frequent / Worked / Starred / Linked) and
  // filters live on the Calendar; a search still looks through everything.
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDays = useMemo(() => {
    const first = addDaysISO(weekOffset * 7); // the coming 7 days, starting today
    const base = new Date(first + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = localISO(d);
      return { key, d, shows: (pool || []).filter((x) => x.date === key) };
    });
  }, [weekOffset, pool]);
  const weekStart = weekDays[0].key;
  const weekEnd = weekDays[6].key;
  const weekPool = useMemo(
    () => (pool || []).filter((s) => s.date && s.date >= weekStart && s.date <= weekEnd),
    [pool, weekStart, weekEnd]
  );

  const strips = useMemo(() => {
    const list = search ? [...shows] : [...weekPool];
    return list.sort((a, b) => (!a.date ? 1 : !b.date ? -1 : a.date.localeCompare(b.date)));
  }, [shows, search, weekPool]);

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


  const unreadByToken = useMemo(() => {
    const map = {};
    (needs?.chats || []).forEach((c) => { map[c.share_token] = (map[c.share_token] || 0) + Number(c.unread || 0); });
    return map;
  }, [needs]);


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

  // The week's strips by day (a day with two shows flips between them).
  const [dayPick, setDayPick] = useState({});
  const stripsByDay = useMemo(() => {
    const map = {};
    strips.forEach((x) => { if (x.date) (map[x.date] = map[x.date] || []).push(x); });
    return map;
  }, [strips]);
  const renderStrip = (x, fluid) => (
    <Strip
      key={x.id || x.share_token}
      fluid={fluid}
      s={x}
      accent={accent}
      photo={photoOverride[x.id || x.share_token] || x.icon_url}
      pr={progress[x.id]}
      on={rolesByShow[x.id]}
      unread={Number(unreadByToken[x.share_token] || 0)}
      myTasks={Number(myTasksByToken[x.share_token] || 0)}
      busyPhoto={busyPhoto === (x.id || x.share_token)}
      menuOpen={menuFor === (x.id || x.share_token)}
      onMenu={(open) => setMenuFor(open ? x.id || x.share_token : null)}
      onOpen={onOpen}
      onFan={() => setFanShow(x)}
      onShare={() => share(x)}
      onPhoto={() => pickPhoto(x)}
      onArchive={() => { setMenuFor(null); onArchive(x); }}
      onDelete={() => { setMenuFor(null); onDeleteRequest(x); }}
    />
  );


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
          <Link to="/show/new" onClick={clearNewShowDraft} aria-label="New show" className="ml-auto h-[44px] px-3 xl:px-4 rounded-[10px] flex items-center gap-1.5 text-[15px] font-bold shrink-0 whitespace-nowrap" style={{ background: accent, color: "#0d0d0d" }}>
            <Plus className="w-4 h-4" strokeWidth={2.6} /><span className="hidden xl:inline">New show</span>
          </Link>
        </div>

        {/* The week: one column per day. The day box is the frame of that
            day's strip, so each fader is exactly as wide as its day. */}
        <div className="px-6 pt-3 pb-2 flex items-center gap-2.5">
          <h2 className="text-[18px] font-bold tracking-[0.08em]" style={{ fontFamily: SCENE_FONT }}>{search ? "SEARCH" : weekOffset === 0 ? "COMING WEEK" : weekOffset > 0 ? "LATER" : "EARLIER"}</h2>
          {!search && (
            <>
              <span className="text-[12px] text-white/55" style={{ fontFamily: SCENE_MONO }}>
                {weekDays[0].d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} – {weekDays[6].d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
              </span>
              <div className="ml-2 flex items-center gap-1.5">
                <button type="button" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week" className="w-8 h-8 rounded-lg bg-[#111] border border-[#262626] flex items-center justify-center text-white/70 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
                {weekOffset !== 0 && <button type="button" onClick={() => setWeekOffset(0)} className="h-8 px-2.5 rounded-lg bg-[#111] border border-[#262626] text-[12px] font-semibold text-white/75 hover:text-white">This week</button>}
                <button type="button" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week" className="w-8 h-8 rounded-lg bg-[#111] border border-[#262626] flex items-center justify-center text-white/70 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : search ? (
          // A search looks through every show: a plain row of strips.
          <div className="flex-1 min-h-0 mx-5 mb-[18px] rounded-[14px] bg-[#101010] border border-[#1d1d1d] p-3.5 pb-3 flex overflow-hidden">
            {strips.length === 0 ? (
              <p className="flex-1 self-center text-center text-white/40 text-[15px]">No shows match.</p>
            ) : (
              <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
                {strips.map((x) => renderStrip(x, false))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 px-5 pb-[18px] overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
            <div className="h-full grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(112px, 1fr))" }}>
              {weekDays.map((day) => {
                const isToday = day.key === today;
                const list = stripsByDay[day.key] || [];
                const idx = Math.min(dayPick[day.key] || 0, Math.max(0, list.length - 1));
                const shown = list[idx];
                const past = day.key < today;
                return (
                  <div key={day.key} className="min-h-0 min-w-0 flex flex-col gap-2" style={{ opacity: past && !list.length ? 0.5 : 1 }}>
                    {/* The day */}
                    <div className="h-[38px] shrink-0 flex items-center gap-1.5 px-2.5 rounded-[10px]" style={{ fontFamily: SCENE_MONO, background: isToday ? "#132009" : "#111", border: isToday ? `1.5px solid ${accent}` : "1px solid #1f1f1f", boxShadow: isToday ? "0 0 14px rgba(140,255,61,0.2)" : "none" }}>
                      <span className="text-[11px] tracking-[0.1em]" style={{ color: isToday ? accent : "#8f8f8f" }}>{day.d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</span>
                      <span className="text-[15px] font-semibold" style={{ color: isToday ? accent : "#e5e5e5" }}>{day.d.getDate()}</span>
                      {list.length > 1 ? (
                        <span className="ml-auto flex items-center gap-0.5 text-[11px] text-white/70">
                          <button type="button" aria-label="Previous show this day" onClick={() => setDayPick((m) => ({ ...m, [day.key]: (idx - 1 + list.length) % list.length }))} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10"><ChevronLeft className="w-3.5 h-3.5" /></button>
                          <span className="hidden xl:inline">{idx + 1}/{list.length}</span>
                          <button type="button" aria-label="Next show this day" onClick={() => setDayPick((m) => ({ ...m, [day.key]: (idx + 1) % list.length }))} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10"><ChevronRight className="w-3.5 h-3.5" /></button>
                        </span>
                      ) : isToday ? (
                        <span className="ml-auto text-[9px] tracking-[0.1em]" style={{ color: accent }}>TODAY</span>
                      ) : null}
                    </div>
                    {/* Its show's strip, a card of its own under the day (same width) */}
                    {shown ? (
                      <div className="flex-1 min-h-0 flex rounded-[10px] overflow-hidden" style={{ border: `1px solid ${eventTypeColor(shown.event_type) || (shown.is_owned === false ? "#F472B6" : "#2a2a2a")}`, boxShadow: "0 6px 14px rgba(0,0,0,0.35)" }}>
                        {renderStrip(shown, true)}
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 rounded-[10px] border border-dashed border-[#1c1c1c]" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
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

function Strip({ fluid, s, accent, photo, pr, on, unread, myTasks, busyPhoto, menuOpen, onMenu, onFan, onShare, onPhoto, onArchive, onDelete }) {
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
    <div onClick={openWeb} className={`${fluid ? "w-full min-w-0" : "w-[210px] shrink-0 rounded-[10px]"} h-full flex flex-col overflow-hidden relative isolate cursor-pointer hover:brightness-110 transition-[filter]`} style={{ background: "#171717", border: fluid ? "none" : `1px solid ${photo ? color : "#2a2a2a"}` }}>
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
          {!fluid && <span className="text-[12px] pr-6" style={{ fontFamily: SCENE_MONO, color }}>{d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() : "NO DATE"}</span>}
          <span className={`${fluid ? "text-[13px] xl:text-[17px] min-[1400px]:text-[18px] break-words pr-6 xl:pr-5" : "text-[18px] pr-5"} font-semibold leading-[1.15] line-clamp-2 w-full`}>{sceneTitle(s)}</span>
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
        <div className={`flex-1 min-w-0 flex flex-col gap-2.5 py-2.5 ${fluid ? "pl-2 pr-1.5" : "pl-2.5 pr-2"}`}>
          {/* Who's on */}
          <div className="flex flex-col gap-1.5" style={{ textShadow: ts }}>
            <span className="text-[10px] tracking-[0.12em] text-white/55" style={{ fontFamily: SCENE_MONO }}>WHO'S ON</span>
            {ROLES.map((r) => {
              const lit = on?.has(r.id);
              return (
                <span
                  key={r.id}
                  className={`h-[27px] shrink-0 rounded-[6px] flex items-center whitespace-nowrap overflow-hidden font-bold ${fluid ? "px-1 text-[12px] tracking-0" : "px-1.5 text-[13px] tracking-[0.02em]"}`}
                  style={{ fontFamily: SCENE_FONT, textShadow: "none", background: lit ? r.color : "#141414", border: `1.5px solid ${lit ? r.color : r.color + "59"}`, color: lit ? "#0d0d0d" : r.soft, boxShadow: lit ? `0 0 10px ${r.color}88` : "none" }}
                  title={lit ? `${r.label} is on this show` : `No one on ${r.label} yet`}
                >
                  {fluid ? (
                    <>
                      <span className="xl:hidden">{r.tiny || r.short}</span>
                      <span className="hidden xl:inline min-[1400px]:hidden">{r.short}</span>
                      <span className="hidden min-[1400px]:inline">{r.label}</span>
                    </>
                  ) : r.label}
                </span>
              );
            })}
          </div>

          {/* Your tasks -> the event's task page */}
          <Link
            to={`/gig/tasks?token=${s.share_token}`}
            aria-label={myTasks ? `${myTasks} open ${myTasks === 1 ? "task" : "tasks"} for you` : "No tasks for you"}
            className={`h-[44px] shrink-0 flex items-center gap-1.5 ${fluid ? "px-1.5" : "px-2"} rounded-[9px] hover:brightness-125`}
            style={myTasks
              ? { background: "#341c0b", border: "1.5px solid #FF6A00", color: "#FF6A00", boxShadow: "0 0 12px rgba(255,106,0,0.3)" }
              : { background: photo ? "rgba(13,13,13,0.85)" : "#151515", border: "1.5px solid #3a3a3a", color: "#a3a3a3" }}
          >
            <ClipboardList className="w-[18px] h-[18px] shrink-0" />
            {fluid ? (
              <span className="text-[14px] min-[1400px]:text-[15px] font-bold tracking-[0.02em] whitespace-nowrap" style={{ fontFamily: SCENE_FONT }}>
                <span className="min-[1400px]:hidden">{myTasks || 0}</span>
                <span className="hidden min-[1400px]:inline">{myTasks ? `${myTasks} ${myTasks === 1 ? "TASK" : "TASKS"}` : "NO TASKS"}</span>
              </span>
            ) : (
              <span className="text-[15px] font-bold tracking-[0.03em] whitespace-nowrap" style={{ fontFamily: SCENE_FONT }}>{myTasks ? `${myTasks} ${myTasks === 1 ? "TASK" : "TASKS"}` : "NO TASKS"}</span>
            )}
            <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0" />
          </Link>

          {/* Sends: a 2 x 2 square at the bottom */}
          <div className="mt-auto grid grid-cols-2 gap-1.5">
            <Link to={`/gig/rooms?token=${s.share_token}`} aria-label={unread ? `Chat, ${unread} unread` : "Chat"} title="Chat" className="aspect-square rounded-[9px] flex items-center justify-center relative hover:brightness-125" style={sendBtn(SEND.chat)}>
              <MessageCircle className="w-[20px] h-[20px] min-[1400px]:w-[22px] min-[1400px]:h-[22px]" />
              {unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-0.5 rounded-full bg-[#60A5FA] text-[#0d0d0d] text-[10px] font-bold flex items-center justify-center">{unread}</span>}
            </Link>
            {FAN_RSVP_OPEN && (
              <button type="button" aria-label="Fan page" title="Fan page" onClick={onFan} className="aspect-square rounded-[9px] flex items-center justify-center hover:brightness-125" style={sendBtn(SEND.fan)}>
                <Ticket className="w-[20px] h-[20px] min-[1400px]:w-[22px] min-[1400px]:h-[22px]" />
              </button>
            )}
            <button type="button" aria-label="Share crew link" title="Share crew link" onClick={onShare} className="aspect-square rounded-[9px] flex items-center justify-center hover:brightness-125" style={sendBtn(SEND.share)}>
              <Share2 className="w-[20px] h-[20px] min-[1400px]:w-[22px] min-[1400px]:h-[22px]" />
            </button>
            <button type="button" aria-label={photo ? "Change the strip photo" : "Add a strip photo"} title={photo ? "Change photo" : "Add photo"} onClick={onPhoto} disabled={busyPhoto} className="aspect-square rounded-[9px] flex items-center justify-center text-white/80 disabled:opacity-50 hover:text-white" style={{ background: photo ? "rgba(13,13,13,0.85)" : "#1a1a1a", border: "1px solid #3a3a3a" }}>
              <Camera className="w-[19px] h-[19px] min-[1400px]:w-[21px] min-[1400px]:h-[21px]" />
            </button>
          </div>
        </div>

        {/* Ready fader */}
        <div className={`${fluid ? "w-[34px]" : "w-[46px]"} shrink-0 flex flex-col items-center gap-1.5 pt-3 pb-2 border-l`} style={{ borderColor: line }} title="Profiles confirmed on this show">
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
