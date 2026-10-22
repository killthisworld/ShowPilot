import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO, sceneTitle } from "@/lib/sceneStyle";
import { eventTypeColor } from "@/lib/eventTypes";
import { chatHref, chatTitle, dueInfo, localISO, readSeenChanges, rememberSeenChange, timeAgo, shortDate } from "@/lib/needsMe";
import { shareLink } from "@/lib/share";
import useNeedsMe from "@/hooks/useNeedsMe";
import { clearNewShowDraft } from "@/hooks/usePersistedState";
import FanPageSheet from "@/components/showpilot/FanPageSheet";
import TechRail from "@/components/showpilot/TechRail";
import { FAN_RSVP_OPEN } from "@/lib/hiddenProfiles";

// Lighting tech desktop (1024px+): one numbered TO DO list of the tasks,
// event updates and unread chats from your shows, worked like a cue list.
// NOW is the lit row; GO does it and moves to the next (task: mark done,
// update: got it, chat: open it); BACK steps back (and reopens it if you
// just did it); LATER sends it to the end of the list.
// Top to bottom: NOW + counts, filters, the list with SEND (for the NOW
// item's show) and SHOWS beside it, then progress and BACK / LATER / GO.
// Mockup: "Lighting tech desktop · build version" on the Company Phone
// Layout canvas. The phone layout (Home.jsx) is untouched.

const TYPE = {
  TASK: { label: "TASK", color: "#FF6A00" },
  UPDATE: { label: "UPDATE", color: "#60A5FA" },
  CHAT: { label: "CHAT", color: "#E879F9" },
};
const VIEWS = [
  { id: "all", label: "ALL", color: "#8CFF3D" },
  { id: "TASK", label: "TASKS", color: "#FF6A00" },
  { id: "UPDATE", label: "UPDATES", color: "#60A5FA" },
  { id: "CHAT", label: "CHATS", color: "#E879F9" },
];

function changeText(c) {
  if (c.kind === "task_done") return `${c.by_name || "Someone"} finished: ${c.task_title || "a task"}`;
  if (c.kind === "event_updated") return "Event details changed";
  if (c.kind === "section_updated") return `${(c.by_name || "Someone").split(" ")[0]} updated ${c.section === "engineer" ? "Audio / Lighting" : c.section === "manager" ? "Manager / Artist" : c.section === "venue" ? "Venue" : "the event"}`;
  return c.task_title || "Something changed";
}

export default function LightingDesk({ shows, accent = "#8CFF3D", preferences, onPreferencesUpdate, onOpenShow }) {
  const navigate = useNavigate();
  const { data: needs, loading } = useNeedsMe();
  const [view, setView] = useState("all");
  const [search, setSearch] = useState("");
  const [curId, setCurId] = useState(null);
  const [done, setDone] = useState({}); // id -> true, this visit
  const [laterIds, setLaterIds] = useState([]); // pushed to the end, in order
  const [busy, setBusy] = useState(false);
  const [fanShow, setFanShow] = useState(null);
  const [progress, setProgress] = useState({});
  const [toast, setToast] = useState("");
  const [seen] = useState(readSeenChanges);

  const flash = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  };

  // --- Build the list once per fetch; items stay put when they're done so
  // the list reads like a cue list with cleared cues dimmed. ---
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!needs) return;
    const today = localISO();
    const tasks = (needs.tasks || []).map((t) => {
      const due = dueInfo(t.due_date);
      return {
        id: "t:" + t.id, kind: "TASK", raw: t, what: t.title, event: t.event_title || "Event",
        show_id: t.show_id, share_token: t.share_token,
        when: !due ? (t.event_date ? `show ${shortDate(t.event_date)}` : "")
          : due.label === "OVERDUE" ? "overdue" : due.label === "DUE TODAY" ? "today" : due.label === "DUE TOMORROW" ? "tomorrow" : shortDate(t.due_date),
        urgent: !!due?.urgent, sortKey: t.due_date && t.due_date <= today ? 0 : 3,
      };
    });
    const chats = (needs.chats || []).filter((c) => Number(c.unread) > 0).map((c) => ({
      id: "c:" + c.id, kind: "CHAT", raw: c,
      what: `${c.last_sender_name || chatTitle(c)}: ${c.last_body || "New message"}`,
      event: c.event_title || "Event", show_id: c.show_id, share_token: c.share_token,
      when: timeAgo(c.last_at), urgent: false, sortKey: 1,
    }));
    const updates = (needs.changes || []).filter((c) => !seen.has(c.key)).map((c) => ({
      id: "u:" + c.key, kind: "UPDATE", raw: c, what: changeText(c),
      event: c.event_title || "Event", show_id: c.show_id, share_token: c.share_token,
      when: timeAgo(c.at), urgent: false, sortKey: 2,
    }));
    // Due-now tasks first, then chats waiting on you, then updates, then the
    // rest of the tasks (already in due-date order from the server).
    const next = [...tasks, ...chats, ...updates].map((x, i) => ({ ...x, i })).sort((a, b) => a.sortKey - b.sortKey || a.i - b.i);
    setItems((prev) => {
      // Keep what was cleared this visit in place (it drops out of the
      // server's list once done).
      const keep = prev.filter((p) => done[p.id] && !next.some((n) => n.id === p.id));
      return [...next, ...keep];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needs]);

  const ordered = useMemo(() => {
    const later = laterIds.map((id) => items.find((x) => x.id === id)).filter(Boolean);
    return [...items.filter((x) => !laterIds.includes(x.id)), ...later];
  }, [items, laterIds]);

  const open = ordered.filter((x) => !done[x.id]);
  const cur = ordered.find((x) => x.id === curId && !done[x.id]) || open[0] || null;
  const curIdx = cur ? open.indexOf(cur) : -1;
  const next = curIdx >= 0 ? open[curIdx + 1] || null : null;

  const q = search.trim().toLowerCase();
  const shown = ordered.filter((x) => (view === "all" || x.kind === view) && (!q || x.what.toLowerCase().includes(q) || x.event.toLowerCase().includes(q)));
  const counts = { all: ordered.length, TASK: 0, UPDATE: 0, CHAT: 0 };
  ordered.forEach((x) => { counts[x.kind] += 1; });

  const today = localISO();
  const dueCount = (needs?.tasks || []).filter((t) => t.due_date && t.due_date <= today && !done["t:" + t.id]).length;
  const newCount = open.filter((x) => x.kind !== "TASK").length;

  // --- The show the NOW item belongs to (for SEND). ---
  const curShow = useMemo(() => {
    if (!cur) return null;
    return (shows || []).find((s) => s.id === cur.show_id || (s.share_token && s.share_token === cur.share_token)) || null;
  }, [cur, shows]);

  // --- SHOWS: upcoming, soonest first ---
  const upcoming = useMemo(() => {
    const t = localISO();
    return (shows || []).filter((s) => s.date && s.date >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [shows]);
  const upIds = upcoming.map((s) => s.id).filter(Boolean).join(",");
  useEffect(() => {
    if (!upIds) return undefined;
    let alive = true;
    supabase.rpc("get_gigs_home_progress", { p_show_ids: upIds.split(",") }).then(({ data, error }) => {
      if (!alive || error || !data) return;
      const map = {};
      data.forEach((r) => { map[r.show_id] = r; });
      setProgress(map);
    });
    return () => { alive = false; };
  }, [upIds]);

  // --- GO / BACK / LATER ---
  const advanceFrom = (id, doneMap) => {
    const rest = ordered.filter((x) => !doneMap[x.id]);
    const after = ordered.slice(ordered.findIndex((x) => x.id === id) + 1).find((x) => !doneMap[x.id]);
    setCurId((after || rest[0] || {}).id || null);
  };

  const go = async () => {
    if (!cur || busy) return;
    if (cur.kind === "CHAT") {
      setDone((d) => ({ ...d, [cur.id]: true }));
      navigate(chatHref(cur.raw));
      return;
    }
    if (cur.kind === "TASK") {
      setBusy(true);
      const { error } = await supabase.rpc("set_gig_task_status", { p_token: cur.share_token, p_task_id: cur.raw.id, p_done: true });
      setBusy(false);
      if (error) {
        console.error(error);
        flash("Couldn't mark it done. Try again.");
        return;
      }
    } else {
      rememberSeenChange(cur.raw.key);
    }
    const d = { ...done, [cur.id]: true };
    setDone(d);
    advanceFrom(cur.id, d);
  };

  const back = async () => {
    if (busy) return;
    const i = cur ? ordered.indexOf(cur) : ordered.length;
    const prev = ordered[i - 1];
    if (!prev) return;
    if (done[prev.id]) {
      // Step back onto something you just did: reopen it.
      if (prev.kind === "TASK") {
        setBusy(true);
        const { error } = await supabase.rpc("set_gig_task_status", { p_token: prev.share_token, p_task_id: prev.raw.id, p_done: false });
        setBusy(false);
        if (error) {
          console.error(error);
          flash("Couldn't reopen it. Try again.");
          return;
        }
      }
      setDone((d) => { const n = { ...d }; delete n[prev.id]; return n; });
    }
    setCurId(prev.id);
  };

  const later = () => {
    if (!cur) return;
    const nextUp = next || open.find((x) => x.id !== cur.id);
    setLaterIds((ids) => [...ids.filter((id) => id !== cur.id), cur.id]);
    if (nextUp) setCurId(nextUp.id);
  };

  const shareCrew = async () => {
    if (!cur) return;
    const url = `${window.location.origin}/gig/shared?token=${cur.share_token}`;
    const r = await shareLink({ url, title: cur.event, text: `${cur.event} on ShowPilot` });
    if (r === "copied") flash("Crew link copied");
    else if (r === "failed") flash("Couldn't share the link");
  };

  const doneCount = ordered.length - open.length;
  const goHint = !cur ? "" : cur.kind === "TASK" ? "MARK DONE, NEXT" : cur.kind === "CHAT" ? "OPEN CHAT" : "GOT IT, NEXT";

  const sends = cur ? [
    { label: "Event chat", color: "#E879F9", to: `/gig/rooms?token=${cur.share_token}` },
    { label: "Open web", color: "#8CFF3D", to: `/gig/web?token=${cur.share_token}` },
    { label: "Show details", color: "#60A5FA", onClick: () => (curShow ? onOpenShow(curShow) : navigate(`/gig/web?token=${cur.share_token}`)) },
    ...(FAN_RSVP_OPEN ? [{ label: "Fan page", color: "#F2FF00", onClick: () => setFanShow(curShow || { id: cur.show_id, share_token: cur.share_token, is_owned: false }) }] : []),
    { label: "Share crew link", color: "#c6ccd2", onClick: shareCrew, wide: true },
  ] : [];

  const panel = "rounded-lg bg-[#131518] border border-[#24272c] overflow-hidden flex flex-col";
  const panelHead = "h-9 shrink-0 flex items-center gap-2.5 px-3 bg-[#181b1f] border-b border-[#24272c]";

  return (
    <div className="fixed inset-0 flex bg-[#0b0c0e] text-[#eef0f2] overflow-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <TechRail accent={accent} preferences={preferences} onPreferencesUpdate={onPreferencesUpdate} />

      <div className="flex-1 min-w-0 flex flex-col gap-2.5 px-5 pt-3.5 pb-4">
        {/* NOW + counts */}
        <div className="h-14 shrink-0 flex items-stretch gap-2.5">
          <h1 className="w-[150px] shrink-0 flex items-center text-[26px] font-bold" style={{ fontFamily: SCENE_FONT }}>Show<span style={{ color: accent }}>Pilot</span></h1>
          <div className="flex-1 min-w-0 flex items-center gap-3 px-4 rounded-lg" style={{ background: "#0f1a0a", border: `1.5px solid ${accent}` }}>
            <span className="text-[15px] font-bold tracking-[0.1em]" style={{ fontFamily: SCENE_FONT, color: accent }}>NOW</span>
            <span className="text-[16px] font-semibold truncate">{cur ? cur.what : loading ? "Loading…" : "All caught up"}</span>
            {cur && (
              <span className="ml-auto text-[13px] text-[#c6ccd2] whitespace-nowrap">
                {cur.event}{cur.when ? " · " : ""}<span style={{ color: cur.urgent ? "#FF6A00" : undefined }}>{cur.when}</span>
              </span>
            )}
          </div>
          <span className="w-[112px] shrink-0 flex items-center gap-2 px-3 rounded-lg" style={dueCount ? { background: "#341c0b", border: "1.5px solid #FF6A00", color: "#FF6A00" } : { background: "#131518", border: "1.5px solid #2a2e34", color: "#8a929b" }}>
            <span className="text-[22px] font-semibold" style={{ fontFamily: SCENE_MONO }}>{dueCount}</span>
            <span className="text-[14px] font-bold tracking-[0.06em]" style={{ fontFamily: SCENE_FONT }}>DUE</span>
          </span>
          <span className="w-[112px] shrink-0 flex items-center gap-2 px-3 rounded-lg" style={newCount ? { background: "#0d1520", border: "1.5px solid #60A5FA", color: "#60A5FA" } : { background: "#131518", border: "1.5px solid #2a2e34", color: "#8a929b" }}>
            <span className="text-[22px] font-semibold" style={{ fontFamily: SCENE_MONO }}>{newCount}</span>
            <span className="text-[14px] font-bold tracking-[0.06em]" style={{ fontFamily: SCENE_FONT }}>NEW</span>
          </span>
          <Link to="/show/new" onClick={clearNewShowDraft} className="shrink-0 px-4 rounded-lg flex items-center gap-1.5 text-[15px] font-bold" style={{ background: accent, color: "#0b0c0e" }}>
            <Plus className="w-4 h-4" strokeWidth={2.6} /> New show
          </Link>
        </div>

        {/* Filters */}
        <div className="h-11 shrink-0 flex items-stretch gap-2">
          {VIEWS.map((v) => {
            const on = view === v.id;
            return (
              <button key={v.id} type="button" onClick={() => setView(v.id)} aria-pressed={on} className="px-4 flex items-center gap-2 rounded-md" style={{ background: on ? v.color : v.color + "1f", border: `1.5px solid ${on ? v.color : v.color + "66"}`, color: on ? "#0b0c0e" : v.color }}>
                <span className="text-[17px] font-bold tracking-[0.06em]" style={{ fontFamily: SCENE_FONT }}>{v.label}</span>
                <span className="text-[11px] opacity-85" style={{ fontFamily: SCENE_MONO }}>{counts[v.id]}</span>
              </button>
            );
          })}
          <label className="ml-auto w-[240px] xl:w-[320px] flex items-center gap-2 px-3 rounded-md bg-[#131518] border border-[#24272c] text-[#7d8590] focus-within:border-[#3a4048]">
            <Search className="w-4 h-4" />
            <input type="search" aria-label="Search the list" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks, shows, people" className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-[#eef0f2] placeholder:text-[#7d8590]" />
            {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="text-white/50 hover:text-white"><X className="w-4 h-4" /></button>}
          </label>
        </div>

        {/* TO DO + side panels */}
        <div className="flex-1 min-h-0 flex gap-2.5">
          <div className={`flex-1 min-w-0 ${panel}`}>
            <div className={panelHead}>
              <span className="text-[17px] font-bold tracking-[0.08em]" style={{ fontFamily: SCENE_FONT }}>TO DO</span>
              <span className="text-[12px] text-[#9aa3ad] truncate hidden xl:inline">Tasks, updates and chats from your shows. Click a row to make it NOW.</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
              {loading && !needs ? (
                <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" /></div>
              ) : shown.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                  <p className="text-[16px] font-semibold">{ordered.length ? "Nothing here matches." : "All caught up."}</p>
                  <p className="text-[13px] text-[#9aa3ad]">{ordered.length ? "Try another filter or search." : "New tasks, updates and chats from your shows land here."}</p>
                </div>
              ) : (
                shown.map((x) => {
                  const isDone = !!done[x.id];
                  const isCur = cur && x.id === cur.id;
                  const isNext = next && x.id === next.id;
                  const num = ordered.indexOf(x) + 1;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => !isDone && setCurId(x.id)}
                      aria-current={isCur ? "true" : undefined}
                      className="w-full grid items-center h-[44px] pl-[9px] pr-3 text-left text-[14px] border-b border-[#1d2024] hover:bg-white/[0.03]"
                      style={{ gridTemplateColumns: "36px 80px minmax(0,2fr) minmax(0,1fr) 92px 52px", background: isCur ? "#0f1a0a" : "transparent", borderLeft: `3px solid ${isCur ? accent : isNext ? "#22D3EE" : "transparent"}`, opacity: isDone ? 0.5 : 1 }}
                    >
                      <span className="font-semibold" style={{ fontFamily: SCENE_MONO, color: isCur ? accent : isNext ? "#22D3EE" : "#9aa3ad" }}>{num}</span>
                      <span><span className="text-[12px] font-bold tracking-[0.08em] px-1.5 py-0.5 rounded" style={{ fontFamily: SCENE_FONT, background: TYPE[x.kind].color, color: "#0b0c0e" }}>{TYPE[x.kind].label}</span></span>
                      <span className="font-semibold truncate pr-3" style={{ textDecoration: isDone ? "line-through" : "none" }}>{x.what}</span>
                      <span className="flex items-center gap-1.5 min-w-0 pr-3 text-[#c6ccd2]">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: eventTypeColor(((shows || []).find((s) => s.id === x.show_id) || {}).event_type) || "#8CFF3D" }} />
                        <span className="truncate">{x.event}</span>
                      </span>
                      <span className="text-[12px] truncate" style={{ fontFamily: SCENE_MONO, color: !isDone && x.urgent ? "#FF6A00" : "#c6ccd2" }}>{isDone ? (x.kind === "TASK" ? "done" : x.kind === "CHAT" ? "read" : "seen") : x.when}</span>
                      <span className="text-[12px] font-bold tracking-[0.08em] text-right" style={{ fontFamily: SCENE_FONT, color: isDone ? "#9aa3ad" : isCur ? accent : "#22D3EE" }}>{isDone ? "DONE" : isCur ? "NOW" : isNext ? "NEXT" : ""}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="w-[260px] xl:w-[300px] shrink-0 flex flex-col gap-2.5">
            <div className={panel}>
              <div className={panelHead}>
                <span className="text-[17px] font-bold tracking-[0.08em]" style={{ fontFamily: SCENE_FONT }}>SEND</span>
                <span className="text-[12px] text-[#9aa3ad] truncate">{cur ? `for ${cur.event}` : "pick an item"}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-2">
                {cur ? sends.map((m) => {
                  const cls = `h-11 flex items-center gap-2 px-2.5 rounded-md bg-[#181b1f] border-[1.5px] border-[#2a2e34] hover:border-[#4a5058] text-left text-[13px] font-semibold ${m.wide ? "col-span-2" : ""}`;
                  const dot = <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.color }} />;
                  return m.to
                    ? <Link key={m.label} to={m.to} className={cls}>{dot}{m.label}</Link>
                    : <button key={m.label} type="button" onClick={m.onClick} className={cls}>{dot}{m.label}</button>;
                }) : <p className="col-span-2 text-[13px] text-[#9aa3ad] px-1 py-3">Nothing on the list right now.</p>}
              </div>
            </div>

            <div className={`flex-1 min-h-0 ${panel}`}>
              <div className={panelHead}>
                <span className="text-[17px] font-bold tracking-[0.08em]" style={{ fontFamily: SCENE_FONT }}>SHOWS</span>
                <span className="text-[12px] text-[#9aa3ad]">coming up</span>
                <Link to="/calendar" className="ml-auto text-[12px] font-semibold" style={{ color: accent }}>All shows</Link>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
                {upcoming.length === 0 ? (
                  <p className="text-[13px] text-[#9aa3ad] px-3 py-4">No upcoming shows. <Link to="/show/new" onClick={clearNewShowDraft} style={{ color: accent }}>Add one</Link></p>
                ) : upcoming.map((s) => {
                  const color = eventTypeColor(s.event_type) || (s.is_owned === false ? "#F472B6" : accent);
                  const openTasks = Number(progress[s.id]?.open_tasks || 0);
                  return (
                    <button key={s.id || s.share_token} type="button" onClick={() => onOpenShow(s)} className="w-full h-[50px] flex items-center gap-2.5 px-3 border-b border-[#1d2024] text-left hover:bg-white/[0.03]">
                      <span className="w-1 self-stretch my-2 rounded-sm shrink-0" style={{ background: color }} />
                      <span className="w-[52px] shrink-0 text-[11px]" style={{ fontFamily: SCENE_MONO, color }}>{shortDate(s.date).toUpperCase()}</span>
                      <span className="flex-1 min-w-0 flex flex-col">
                        <span className="text-[14px] font-semibold truncate">{sceneTitle(s)}</span>
                        <span className="text-[12px] text-[#9aa3ad] truncate">{s.venue || "No venue yet"}</span>
                      </span>
                      <span className="text-[11px] shrink-0" style={{ fontFamily: SCENE_MONO, color: openTasks ? "#FF6A00" : "#8CFF3D" }}>{openTasks ? `${openTasks} open` : "clear"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Progress + BACK / LATER / GO */}
        <div className="h-[84px] shrink-0 flex items-stretch gap-3 px-3 py-2.5 rounded-lg bg-[#101215] border border-[#24272c]">
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
            <div className="text-[13px] text-[#9aa3ad] truncate">
              <b style={{ color: accent }}>{doneCount} of {ordered.length} done</b>
              {next ? <> · next: {next.what}</> : ordered.length && !open.length ? " · nothing left" : ""}
            </div>
            <div className="flex gap-[3px]" aria-hidden="true">
              {ordered.slice(0, 40).map((x) => (
                <span key={x.id} className="flex-1 h-3.5 rounded-sm" style={{ background: done[x.id] ? accent : cur && x.id === cur.id ? "#FF6A00" : "#262a30" }} />
              ))}
              {ordered.length === 0 && <span className="flex-1 h-3.5 rounded-sm bg-[#262a30]" />}
            </div>
          </div>
          <button type="button" onClick={back} disabled={busy || !ordered.length} className="w-[110px] rounded-lg bg-[#1d2126] border-[1.5px] border-[#3a4048] text-[19px] font-bold tracking-[0.08em] hover:border-[#5a6068] disabled:opacity-40" style={{ fontFamily: SCENE_FONT }}>BACK</button>
          <button type="button" onClick={later} disabled={busy || !cur || open.length < 2} className="w-[110px] rounded-lg bg-[#1d2126] border-[1.5px] border-[#3a4048] text-[19px] font-bold tracking-[0.08em] hover:border-[#5a6068] disabled:opacity-40" style={{ fontFamily: SCENE_FONT }}>LATER</button>
          <button type="button" onClick={go} disabled={busy || !cur} className="w-[180px] rounded-lg flex flex-col items-center justify-center disabled:opacity-40" style={{ background: accent, color: "#0b0c0e", boxShadow: cur ? `0 0 18px ${accent}66` : "none" }}>
            <span className="text-[30px] font-bold tracking-[0.12em] leading-none" style={{ fontFamily: SCENE_FONT }}>GO</span>
            {goHint && <span className="text-[11px] font-bold tracking-[0.04em]">{goHint}</span>}
          </button>
        </div>
      </div>

      {toast && <div role="status" className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 rounded-lg bg-[#1f1f1f] border border-[#333] text-sm text-white">{toast}</div>}
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
