import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardList, MessageCircle, Plus, Search, X, Box, Camera, ListMusic } from "lucide-react";
import { cropImage } from "@/lib/cropImage";
import { uploadIconImage, saveMyIcon } from "@/lib/eventIcons";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO, sceneTitle } from "@/lib/sceneStyle";
import { localISO, addDaysISO, visibleChats } from "@/lib/needsMe";
import useNeedsMe from "@/hooks/useNeedsMe";
import { clearNewShowDraft } from "@/hooks/usePersistedState";
import TechRail from "@/components/showpilot/TechRail";
import useRigThumbs from "@/components/showpilot/RigThumbs";

// The LD's desk (job 383), laid out like a grandMA3: the week's shows are
// executors in a playback bank - a label screen (date, show, venue), the
// keys above the fader (who's on, your tasks, chat), the fader (how ready
// the show is) and GO (open the show). RIG THE STAGE opens the 3D stages.
// Desktop: one screen with the rail; phone: the same executors to swipe,
// then everything after this week as a cue list.

export const MA = {
  bg: "#0b0b0b", panel: "#161616", key: "#232323", keyLine: "#363636",
  // Job 407: the lighting tech is green, like the audio tech (was amber).
  amber: "#8CFF3D", amberDim: "#2f4d1f", cyan: "#3DD6F5", text: "#e8e8e8",
};
const ROLES = [
  { id: "venue", label: "VEN", color: "#60A5FA" },
  { id: "manager", label: "MGR", color: "#EF4444" },
  { id: "engineer", label: "LX", color: "#8CFF3D" },
];
const ROLE_BOX = { venue: "venue", manager: "manager", band: "manager", engineer: "engineer", lighting: "engineer" };
const monoStyle = { fontFamily: SCENE_MONO };

// Progress, who's on, your tasks and unread chats for the shows on the desk.
export function useDeskInfo(shows) {
  const { data: needs } = useNeedsMe();
  const [progress, setProgress] = useState({});
  const [roles, setRoles] = useState({});
  const ids = useMemo(() => (shows || []).map((s) => s.id).filter(Boolean).join(","), [shows]);
  useEffect(() => {
    const list = ids ? ids.split(",") : [];
    if (!list.length) return undefined;
    let alive = true;
    supabase.rpc("get_gigs_home_progress", { p_show_ids: list }).then(({ data, error }) => {
      if (!alive || error || !data) return;
      const map = {};
      data.forEach((r) => { map[r.show_id] = r; });
      setProgress(map);
    });
    const owned = (shows || []).filter((s) => s.is_owned !== false).map((s) => s.id);
    if (owned.length) {
      supabase.from("gig_invites").select("show_id, invited_role, status").in("show_id", owned).eq("status", "accepted").then(({ data, error }) => {
        if (!alive || error) return;
        const map = {};
        owned.forEach((id) => { map[id] = new Set(["engineer"]); });
        (data || []).forEach((r) => { if (ROLE_BOX[r.invited_role] && map[r.show_id]) map[r.show_id].add(ROLE_BOX[r.invited_role]); });
        setRoles((m) => ({ ...m, ...map }));
      });
    }
    (shows || []).filter((s) => s.is_owned === false && s.share_token).forEach((s) => {
      supabase.rpc("get_gig_section_permissions", { p_token: s.share_token }).then(({ data, error }) => {
        if (!alive || error || !data) return;
        const set = new Set();
        [...(data.claimed_roles || []), ...(data.my_roles || [])].forEach((r) => ROLE_BOX[r] && set.add(ROLE_BOX[r]));
        setRoles((m) => ({ ...m, [s.id]: set }));
      });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const tasks = useMemo(() => {
    const map = {};
    (needs?.tasks || []).forEach((t) => { map[t.share_token] = (map[t.share_token] || 0) + 1; });
    return map;
  }, [needs]);
  const unread = useMemo(() => {
    const map = {};
    visibleChats(needs?.chats).forEach((c) => { map[c.share_token] = (map[c.share_token] || 0) + Number(c.unread || 0); });
    return map;
  }, [needs]);
  return { progress, roles, tasks, unread };
}

// The event photo on the desk (job 451, like the audio tech's strips): pick
// one with the camera key; owners change the event's own photo, anyone else
// sets their personal one.
function usePhotoPicker() {
  const fileRef = useRef(null);
  const target = useRef(null);
  const [override, setOverride] = useState({});
  const [busy, setBusy] = useState(null);
  const pick = (s) => { target.current = s; fileRef.current?.click(); };
  const onFile = async (e) => {
    const picked = e.target.files?.[0];
    const s = target.current;
    e.target.value = "";
    const file = picked && s ? await cropImage(picked, { aspectW: 1, aspectH: 1 }) : null;
    if (!file || !s) return;
    const key = s.id || s.share_token;
    setBusy(key);
    try {
      const url = await uploadIconImage(file);
      if (s.is_owned !== false) {
        const { error } = await supabase.from("shows").update({ icon_url: url }).eq("id", s.id);
        if (error) throw error;
      } else {
        await saveMyIcon(s.id, url);
      }
      setOverride((m) => ({ ...m, [key]: url }));
    } catch (err) {
      console.error(err);
      window.alert("Couldn't change the photo. Try again.");
    }
    setBusy(null);
  };
  const input = <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />;
  const photoOf = (s) => (s ? override[s.id || s.share_token] || s.icon_url || "" : "");
  return { pick, input, photoOf, busyOf: (s) => !!s && busy === (s.id || s.share_token) };
}

// One executor: the show's 3D stage on top (job 453), its title and venue,
// who's on, keys, fader, GO. With an event photo it sits behind the whole
// executor, as on the audio tech's strips (job 451).
export function Executor({ n, s, info, onGo, compact = false, empty = false, dayLabel = "", photo = "", onPhoto = null, busyPhoto = false, thumb = "" }) {
  const navigate = useNavigate();
  if (empty || !s) {
    return (
      <div className="h-full min-h-0 rounded-[6px] border flex flex-col" style={{ background: "#101010", borderColor: "#1e1e1e" }}>
        <div className="m-1.5 rounded-[4px] aspect-square" style={{ background: "#070707", border: "1px solid #1c1c1c" }} />
        <div className="flex-1" />
      </div>
    );
  }
  const pr = info.progress[s.id];
  const pct = pr && pr.total_roles ? Math.round((pr.confirmed_roles / pr.total_roles) * 100) : 0;
  const on = info.roles[s.id];
  const myTasks = Number(info.tasks[s.share_token] || 0);
  const unread = Number(info.unread[s.share_token] || 0);
  const d = s.date ? new Date(s.date + "T00:00:00") : null;
  const keyBase = "rounded-[4px] border flex items-center justify-center gap-1 font-bold";
  const ts = photo ? "0 1px 3px rgba(0,0,0,0.9)" : "none";
  const idleKey = photo ? { background: "rgba(20,20,20,0.85)", borderColor: "rgba(255,255,255,0.18)", color: "#e0e0e0" } : { background: MA.key, borderColor: MA.keyLine, color: "#bdbdbd" };
  return (
    // The whole executor opens the show (job 454), except its own keys; a
    // green outline on hover, like the stage square.
    <div onClick={(e) => { if (!e.target.closest("a, button, input, label")) onGo(s); }} title="Open the show"
      className="group/ex h-full min-h-0 rounded-[6px] border flex flex-col relative isolate overflow-hidden cursor-pointer" style={{ background: MA.panel, borderColor: photo ? MA.amber : "#262626" }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 rounded-[6px] opacity-0 group-hover/ex:opacity-100 transition-opacity" style={{ boxShadow: `inset 0 0 0 2px ${MA.amber}` }} />
      {photo && (
        <>
          <div aria-hidden="true" className="absolute inset-0 -z-30 bg-black" />
          {/* The photo turned sideways to fill the tall executor, as on the
              audio tech's strips. */}
          <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden" style={{ containerType: "size" }}>
            <img src={photo} alt="" className="absolute max-w-none" style={{ top: "50%", left: "50%", width: "100cqh", height: "100cqw", objectFit: "cover", transform: "translate(-50%, -50%) rotate(90deg)" }} />
          </div>
          <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55))" }} />
        </>
      )}
      {/* The show's 3D stage at the top (job 453): its picture, tap to open
          it on the event. A linked show opens its event web. */}
      {(() => {
        const own = s.is_owned !== false && !!s.id;
        const rigged = (s.lighting_rig?.items || []).length > 0;
        return (
          <button type="button" onClick={() => onGo(s, own ? "stage" : undefined)} aria-label={`3D stage for ${sceneTitle(s)}`} title={own ? "Open the 3D stage" : "Open the show"}
            className="m-1.5 mb-0 relative rounded-[4px] overflow-hidden aspect-square shrink-0 group"
            style={{ background: "#050505", border: `1px solid ${photo ? "rgba(140,255,61,0.55)" : MA.amberDim}`, boxShadow: "inset 0 0 14px rgba(140,255,61,0.08)" }}>
            {thumb ? (
              <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ color: MA.amber }}>
                <Box className="w-6 h-6" />
                <span className="text-[10px] tracking-[0.14em] font-bold" style={monoStyle}>{rigged ? "3D STAGE" : "RIG THE STAGE"}</span>
              </span>
            )}
            <span aria-hidden="true" className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: `inset 0 0 0 2px ${MA.amber}` }} />
          </button>
        );
      })()}
      {/* Title and venue */}
      <button type="button" onClick={() => onGo(s)} title="Open the show" className="mx-1.5 mt-1 mb-1 px-1 py-1 text-left flex flex-col gap-0.5 overflow-hidden shrink-0" style={{ textShadow: ts }}>
        {/* The date only where no day header sits above it (job 407). */}
        {!dayLabel && (
          <span className="text-[10px]" style={{ ...monoStyle, color: MA.amber }}>{d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase() : "NO DATE"}</span>
        )}
        <span className="text-[14px] font-bold leading-tight line-clamp-2" style={{ color: "#effbe6" }}>{sceneTitle(s)}</span>
        <span className="text-[11.5px] truncate" style={{ color: photo ? "rgba(240,250,230,0.85)" : "rgba(225,245,210,0.6)" }}>{s.venue || "No venue yet"}</span>
      </button>
      {/* Who's on: three LEDs */}
      <div className="mx-1.5 grid grid-cols-3 gap-1">
        {ROLES.map((r) => {
          const lit = on?.has(r.id);
          return (
            <span key={r.id} title={lit ? `${r.label} on` : `No ${r.label} yet`} className="h-6 rounded-[3px] flex items-center justify-center text-[10px] font-bold"
              style={{ ...monoStyle, background: lit ? r.color : "#0f0f0f", color: lit ? "#0d0d0d" : r.color + "aa", border: `1px solid ${lit ? r.color : r.color + "44"}`, boxShadow: lit ? `0 0 8px ${r.color}77` : "none" }}>{r.label}</span>
          );
        })}
      </div>
      {/* Keys: tasks, chat, the cue sheet (job 453), the photo */}
      <div className="mx-1.5 mt-1 grid grid-flow-col auto-cols-fr gap-1">
        <Link to={`/gig/tasks?token=${s.share_token}`} aria-label={myTasks ? `${myTasks} tasks for you` : "Tasks"} title="Tasks" className={keyBase + " h-9 text-[12px]"}
          style={myTasks ? { background: "#1a2e0e", borderColor: MA.amber, color: MA.amber } : idleKey}>
          <ClipboardList className="w-3.5 h-3.5" />{myTasks || ""}
        </Link>
        <Link to={`/gig/rooms?token=${s.share_token}`} aria-label={unread ? `Chat, ${unread} unread` : "Chat"} title="Chat" className={keyBase + " h-9 text-[12px]"}
          style={unread ? { background: "#0d2a31", borderColor: MA.cyan, color: MA.cyan } : idleKey}>
          <MessageCircle className="w-3.5 h-3.5" />{unread || ""}
        </Link>
        {s.is_owned !== false && s.id && (
          <button type="button" onClick={() => onGo(s, "cues")} aria-label={`Cue sheet for ${sceneTitle(s)}`} title="Cue sheet"
            className={keyBase + " h-9 text-[12px]"} style={{ ...idleKey, color: MA.amber, borderColor: photo ? "rgba(140,255,61,0.5)" : MA.amberDim }}>
            <ListMusic className="w-3.5 h-3.5" />
          </button>
        )}
        {onPhoto && (
          <button type="button" onClick={() => onPhoto(s)} disabled={busyPhoto} aria-label={photo ? "Change photo" : "Add photo"} title={photo ? "Change photo" : "Add photo"}
            className={keyBase + " h-9 text-[12px] disabled:opacity-50"} style={idleKey}>
            <Camera className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {/* Fader: how ready the show is */}
      <div className="flex-1 min-h-[90px] flex items-stretch justify-center gap-5 px-2 py-2" title="Profiles confirmed on this show">
        <div className="w-1.5 rounded bg-[#0a0a0a] relative overflow-hidden" aria-hidden="true">
          <div className="absolute left-0 right-0 bottom-0" style={{ height: `${pct}%`, background: MA.amber }} />
        </div>
        <div className="w-2 rounded bg-[#050505] border border-[#2a2a2a] relative" aria-hidden="true">
          <div className="absolute -left-[9px] w-[26px] h-[20px] rounded-[3px]" style={{ bottom: `calc((100% - 20px) * ${pct / 100})`, background: "linear-gradient(#5a5a5a, #2a2a2a)", border: "1px solid #777", boxShadow: "0 2px 6px rgba(0,0,0,0.7)" }}>
            <div className="absolute left-1 right-1 top-1/2 h-px" style={{ background: MA.amber }} />
          </div>
        </div>
        <span className="self-end text-[11px] tabular-nums" style={{ ...monoStyle, color: pct ? MA.amber : photo ? "#cfcfcf" : "#666", textShadow: ts }} aria-label={`${pct}% ready`}>{pct}%</span>
      </div>
      {/* GO */}
      <button type="button" onClick={() => onGo(s)} aria-label={`Go: open ${sceneTitle(s)}`}
        className="m-1.5 mt-0 h-11 rounded-[4px] text-[16px] font-black tracking-[0.2em]" style={{ background: MA.amber, color: "#111" }}>GO</button>
    </div>
  );
}

export function RigTheStageKey({ className = "" }) {
  return (
    <Link to="/rig" className={`h-10 px-3.5 rounded-[5px] border flex items-center gap-2 text-[13.5px] font-bold tracking-[0.06em] whitespace-nowrap ${className}`}
      style={{ ...monoStyle, background: "#13200b", borderColor: MA.amber, color: MA.amber, boxShadow: "0 0 12px rgba(140,255,61,0.18)" }}>
      <Box className="w-4 h-4" />RIG THE STAGE
    </Link>
  );
}

export default function LightingDesk({ shows, preferences, onPreferencesUpdate, onOpenShow }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const today = localISO();
  const weekDays = useMemo(() => {
    const base = new Date(addDaysISO(weekOffset * 7) + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = localISO(d);
      return { key, d, shows: (shows || []).filter((x) => x.date === key) };
    });
  }, [weekOffset, shows]);
  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return (shows || []).filter((s) => [sceneTitle(s), s.venue, s.band_name].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  }, [search, shows]);
  const onDesk = useMemo(() => found || weekDays.flatMap((d) => d.shows), [found, weekDays]);
  const info = useDeskInfo(onDesk);
  const [dayPick, setDayPick] = useState({});
  const photos = usePhotoPicker();
  // Each show's 3D stage as a picture (job 453), drawn once and kept.
  const [thumbs, thumbDrawer] = useRigThumbs(onDesk.map((s) => ({ id: s.id, rig: s.lighting_rig, updated_at: s.updated_at })));

  return (
    <div className="fixed inset-0 flex overflow-hidden" style={{ background: MA.bg, color: MA.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      <TechRail accent={MA.amber} preferences={preferences} onPreferencesUpdate={onPreferencesUpdate} />
      {photos.input}
      {thumbDrawer}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Title bar */}
        <div className="h-[60px] shrink-0 flex items-center gap-3 px-5 border-b" style={{ borderColor: "#1f1f1f", background: "#0f0f0f" }}>
          <label className="flex-1 min-w-[150px] max-w-[300px] flex items-center gap-2 h-10 px-3 rounded-[5px] border text-[#8a8a8a]" style={{ background: "#121212", borderColor: "#2a2a2a" }}>
            <Search className="w-4 h-4 shrink-0" />
            <input type="search" aria-label="Search shows" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shows" className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-white placeholder:text-[#777]" />
            {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X className="w-4 h-4" /></button>}
          </label>
          <RigTheStageKey className="ml-auto" />
          <Link to="/show/new" onClick={clearNewShowDraft} className="h-10 px-3.5 rounded-[5px] flex items-center gap-1.5 text-[14px] font-bold" style={{ background: MA.amber, color: "#111" }}>
            <Plus className="w-4 h-4" strokeWidth={2.6} />New show
          </Link>
        </div>
        {/* Bank header */}
        <div className="px-5 pt-3 pb-2 flex items-center gap-2.5">
          <span className="text-[12px] tracking-[0.2em] font-bold" style={{ ...monoStyle, color: MA.amber }}>{found ? "SEARCH" : weekOffset === 0 ? "PLAYBACK · THIS WEEK" : weekOffset > 0 ? "PLAYBACK · LATER" : "PLAYBACK · EARLIER"}</span>
          {!found && (
            <>
              <span className="text-[11.5px] text-white/50" style={monoStyle}>
                {weekDays[0].d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()} – {weekDays[6].d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
              </span>
              <div className="ml-2 flex items-center gap-1.5">
                <button type="button" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week" className="w-8 h-8 rounded-[4px] border flex items-center justify-center text-white/70" style={{ background: MA.key, borderColor: MA.keyLine }}><ChevronLeft className="w-4 h-4" /></button>
                {weekOffset !== 0 && <button type="button" onClick={() => setWeekOffset(0)} className="h-8 px-2.5 rounded-[4px] border text-[11.5px] font-bold text-white/75" style={{ ...monoStyle, background: MA.key, borderColor: MA.keyLine }}>THIS WEEK</button>}
                <button type="button" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week" className="w-8 h-8 rounded-[4px] border flex items-center justify-center text-white/70" style={{ background: MA.key, borderColor: MA.keyLine }}><ChevronRight className="w-4 h-4" /></button>
              </div>
            </>
          )}
        </div>
        {/* The executors */}
        <div className="flex-1 min-h-0 px-5 pb-4 overflow-x-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
          {found ? (
            found.length ? (
              <div className="h-full flex gap-2">{found.map((s, i) => <div key={s.id || s.share_token} className="w-[170px] shrink-0 h-full"><Executor n={i + 1} s={s} info={info} onGo={onOpenShow} photo={photos.photoOf(s)} onPhoto={photos.pick} busyPhoto={photos.busyOf(s)} thumb={thumbs[s.id] || ""} /></div>)}</div>
            ) : <p className="text-white/40 text-[14px] pt-10 text-center">No shows match.</p>
          ) : (
            <div className="h-full grid gap-2" style={{ gridTemplateColumns: "repeat(7, minmax(128px, 1fr))" }}>
              {weekDays.map((day, i) => {
                const list = day.shows;
                const idx = Math.min(dayPick[day.key] || 0, Math.max(0, list.length - 1));
                const isToday = day.key === today;
                const label = day.d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }).toUpperCase();
                return (
                  <div key={day.key} className="min-h-0 min-w-0 flex flex-col gap-1.5">
                    <div className="h-8 shrink-0 flex items-center px-2 rounded-[4px] border text-[11px]" style={{ ...monoStyle, background: isToday ? "#16240d" : "#121212", borderColor: isToday ? MA.amber : "#222", color: isToday ? MA.amber : "#9a9a9a" }}>
                      {label}{isToday && <span className="ml-1.5 text-[9px]">TODAY</span>}
                      {list.length > 1 && (
                        <span className="ml-auto flex items-center">
                          <button type="button" aria-label="Previous show this day" onClick={() => setDayPick((m) => ({ ...m, [day.key]: (idx - 1 + list.length) % list.length }))} className="w-5 h-5 flex items-center justify-center"><ChevronLeft className="w-3.5 h-3.5" /></button>
                          {idx + 1}/{list.length}
                          <button type="button" aria-label="Next show this day" onClick={() => setDayPick((m) => ({ ...m, [day.key]: (idx + 1) % list.length }))} className="w-5 h-5 flex items-center justify-center"><ChevronRight className="w-3.5 h-3.5" /></button>
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-h-0">
                      <Executor n={i + 1} s={list[idx]} empty={!list.length} info={info} onGo={onOpenShow} dayLabel={label} photo={photos.photoOf(list[idx])} onPhoto={photos.pick} busyPhoto={photos.busyOf(list[idx])} thumb={(list[idx] && thumbs[list[idx].id]) || ""} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Phone (job 383): the same playback bank, swiped sideways - this week's
// shows as executors, with RIG THE STAGE above them.
export function PhoneExecutors({ shows, onOpenShow }) {
  const week = useMemo(() => {
    const from = localISO();
    const to = addDaysISO(6);
    return (shows || []).filter((s) => s.date && s.date >= from && s.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [shows]);
  const info = useDeskInfo(week);
  return (
    <div className="rounded-[10px] border p-2.5 flex flex-col gap-2.5" style={{ background: MA.bg, borderColor: "#242424" }}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] tracking-[0.2em] font-bold" style={{ ...monoStyle, color: MA.amber }}>PLAYBACK · THIS WEEK</span>
        <RigTheStageKey className="ml-auto !h-9 !px-2.5 !text-[12px]" />
      </div>
      {week.length === 0 ? (
        <p className="text-white/40 text-[13px] py-3">No shows this week. Rig a stage for the next one.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x" style={{ scrollbarWidth: "none" }}>
          {week.map((s, i) => (
            <div key={s.id || s.share_token} className="shrink-0 w-[148px] h-[330px] snap-start">
              <Executor n={i + 1} s={s} info={info} onGo={onOpenShow} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
