import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Clock, Reply, CheckCircle2, RefreshCw } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import useNeedsMe, { patchNeedsMe } from "@/hooks/useNeedsMe";
import TicketCard from "@/components/showpilot/TicketCard";
import { eventTypeColor } from "@/lib/eventTypes";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import {
  BLAZE, dueInfo, localISO, addDaysISO, shortDate, timeAgo, chatHref, chatTitle,
  readSeenChanges, rememberSeenChange, sectionMeta, vocab, openQuickAdd,
} from "@/lib/needsMe";

const BLUE = "#60A5FA";
// Count tiles (job 73): due now = red, new messages = Show Pilot green,
// changed = yellow.
const RED = "#FF4545";
const NEW_GREEN = "#8CFF3D";
const CHANGED_YELLOW = "#FACC15";
const TASKS_SHOWN = 5;

// The company phone home: straight to what needs you. Tasks due on your
// sections, chats with unread messages, things that changed on your events,
// and this week's events with their progress. Every item opens where you can
// act on it. Mockups: "Needs me · Manager" / "Needs me · Venue" on the
// Company Phone Layout design canvas.
//
// `gigs` and `progressByShow` come from BandHome, which already loads them
// for the Events list, so this screen doesn't fetch them a second time.
export default function NeedsMeHome({ preferences, onPreferencesUpdate, gigs, progressByShow, gigsLoading, onOpenGig }) {
  const navigate = useNavigate();
  const accountType = preferences?.account_type;
  const style = getAccountTypeStyle(accountType);
  const accent = style.color;
  const words = vocab(accountType);
  const { data, loading, failed, reload } = useNeedsMe();
  const [seen, setSeen] = useState(() => readSeenChanges());
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [undoTask, setUndoTask] = useState(null);
  const undoTimer = useRef(null);
  const tasksRef = useRef(null);
  const chatsRef = useRef(null);
  const changesRef = useRef(null);

  const todayISO = localISO();
  const tasks = data?.tasks || [];
  const dueNow = tasks.filter((t) => t.due_date && t.due_date <= todayISO);
  const unreadChats = (data?.chats || []).filter((c) => c.unread > 0);
  const unreadTotal = unreadChats.reduce((n, c) => n + Number(c.unread || 0), 0);
  const changes = (data?.changes || []).filter((c) => !seen.has(c.key));
  const shownTasks = showAllTasks ? tasks : tasks.slice(0, TASKS_SHOWN);

  // Today's / tonight's event(s), for the card at the top.
  const todays = useMemo(() => (gigs || []).filter((g) => g.date === todayISO), [gigs, todayISO]);

  // This week's events (next 7 days). If the week is empty, the next two
  // coming up, so progress is always one glance away.
  const weekGigs = useMemo(() => {
    const end = addDaysISO(6);
    const upcoming = (gigs || []).filter((g) => g.date && g.date >= todayISO).sort((a, b) => a.date.localeCompare(b.date));
    const inWeek = upcoming.filter((g) => g.date <= end);
    return (inWeek.length ? inWeek : upcoming.slice(0, 2)).slice(0, 4);
  }, [gigs, todayISO]);
  const weekIsEmpty = useMemo(() => !(gigs || []).some((g) => g.date && g.date >= todayISO && g.date <= addDaysISO(6)), [gigs, todayISO]);

  const openByToken = (shareToken) => {
    const g = (gigs || []).find((x) => x.share_token === shareToken);
    onOpenGig(g || { share_token: shareToken });
  };

  const markDone = async (task) => {
    patchNeedsMe((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== task.id) }));
    clearTimeout(undoTimer.current);
    setUndoTask(task);
    undoTimer.current = setTimeout(() => setUndoTask(null), 5000);
    const { error } = await supabase.rpc("set_gig_task_status", { p_token: task.share_token, p_task_id: task.id, p_done: true });
    if (error) {
      console.error(error);
      setUndoTask(null);
      reload();
    }
  };
  const undoDone = async () => {
    const task = undoTask;
    if (!task) return;
    setUndoTask(null);
    clearTimeout(undoTimer.current);
    const { error } = await supabase.rpc("set_gig_task_status", { p_token: task.share_token, p_task_id: task.id, p_done: false });
    if (error) console.error(error);
    reload();
  };

  const gotIt = (change) => {
    rememberSeenChange(change.key);
    setSeen((s) => new Set([...s, change.key]));
  };

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const dateLine = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const tint = (c) => c + "1c";
  const sectionLabel = (txt) => (
    <div className="text-sm font-bold tracking-[0.08em] text-white/55 px-0.5" style={{ fontFamily: SCENE_FONT }}>{txt}</div>
  );
  const card = "rounded-xl bg-[#151515] border border-[#262626]";
  const nothing = !loading && !failed && tasks.length === 0 && unreadChats.length === 0 && changes.length === 0;

  return (
    <div className="max-w-lg mx-auto pb-6" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-[22px] pb-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[34px] font-bold tracking-[0.04em] leading-none text-white" style={{ fontFamily: SCENE_FONT }}>NEEDS ME</h1>
          <div className="flex items-center gap-1.5 text-[13px] text-white/60">
            <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
            <span>{dateLine} · {style.label}</span>
          </div>
        </div>
      </div>

      {/* Today / Tonight */}
      {todays.map((g) => (
        <button
          key={g.share_token || g.id}
          onClick={() => onOpenGig(g)}
          className="mx-5 mb-3 w-[calc(100%-40px)] flex flex-col gap-2 p-3.5 rounded-[14px] text-left text-white"
          style={{ background: tint(accent), border: `1.5px solid ${accent}`, boxShadow: `0 0 18px ${accent}40` }}
        >
          <span className="flex justify-between w-full text-[13px] font-bold tracking-[0.08em]" style={{ fontFamily: SCENE_FONT, color: accent }}>
            <span>{words.today.toUpperCase()}</span>
            {g.event_time && <span>{g.event_time.toUpperCase()}</span>}
          </span>
          <span className="text-lg font-semibold truncate w-full">{g.event_name || g.band_name || "Untitled"}</span>
          {g.venue && <span className="text-xs text-white/70 truncate w-full" style={{ fontFamily: SCENE_MONO }}>{[g.venue, g.city].filter(Boolean).join(" · ").toUpperCase()}</span>}
        </button>
      ))}

      {/* Count tiles */}
      <div className="grid grid-cols-3 gap-2 px-5 pb-3.5">
        {[
          { n: dueNow.length, label: "DUE NOW", color: RED, bg: tint(RED), ref: tasksRef },
          { n: unreadTotal, label: "NEW", color: NEW_GREEN, bg: tint(NEW_GREEN), ref: chatsRef },
          { n: changes.length, label: "CHANGED", color: CHANGED_YELLOW, bg: tint(CHANGED_YELLOW), ref: changesRef },
        ].map((t) => (
          <button
            key={t.label}
            onClick={() => scrollTo(t.ref)}
            className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl text-left"
            style={{ background: t.bg, border: `1.5px solid ${t.color}`, color: t.color }}
          >
            <span className="text-2xl font-semibold leading-none" style={{ fontFamily: SCENE_MONO }}>{loading ? "–" : t.n}</span>
            <span className="text-[13px] font-bold tracking-[0.06em]" style={{ fontFamily: SCENE_FONT }}>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 px-5">
        {loading && (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
        )}

        {failed && (
          <div className={`${card} p-4 flex items-center gap-3`}>
            <p className="flex-1 m-0 text-sm text-white/70">Couldn't load your tasks and chats just now.</p>
            <button onClick={reload} className="h-11 px-3.5 rounded-[10px] bg-[#1f1f1f] text-white text-[13px] font-semibold flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {nothing && (
          <div className={`${card} p-5 flex flex-col items-center gap-2 text-center`}>
            <CheckCircle2 className="w-8 h-8" style={{ color: accent }} />
            <p className="m-0 text-base font-semibold text-white">Nothing needs you right now</p>
            <p className="m-0 text-sm text-white/55">New tasks, unread chats and changes on your {words.events.toLowerCase()} show up here.</p>
            <button onClick={openQuickAdd} className="mt-1 h-11 px-4 rounded-[10px] text-sm font-bold" style={{ background: accent, color: "#0d0d0d" }}>Add a task</button>
          </div>
        )}

        {/* Tasks */}
        {tasks.length > 0 && (
          <div ref={tasksRef} className="flex flex-col gap-2.5 scroll-mt-4">
            {sectionLabel(`TASKS · ${tasks.length}`)}
            {shownTasks.map((t) => {
              const due = dueInfo(t.due_date);
              // Due today or overdue matches the red DUE NOW tile.
              const urgent = !!due?.urgent;
              const metaColor = urgent ? RED : "rgba(255,255,255,0.55)";
              return (
                <div key={t.id} className={`${card} flex items-center gap-3 p-3`}>
                  <button
                    onClick={() => markDone(t)}
                    aria-label={`Mark "${t.title}" done`}
                    className="w-11 h-11 shrink-0 rounded-full bg-transparent flex items-center justify-center"
                    style={{ border: `2px solid ${urgent ? RED : "#4a4a4a"}`, color: urgent ? RED : "#8a8a8a" }}
                  >
                    <Check className="w-5 h-5" strokeWidth={2.5} />
                  </button>
                  <button onClick={() => openByToken(t.share_token)} className="flex-1 min-w-0 flex flex-col gap-[3px] text-left">
                    <span className="text-[15px] font-semibold text-white leading-snug">{t.title}</span>
                    <span className="text-[11px] truncate" style={{ fontFamily: SCENE_MONO, color: metaColor }}>
                      {[t.event_title, t.event_date ? shortDate(t.event_date) : null, due?.label].filter(Boolean).join(" · ").toUpperCase()}
                    </span>
                  </button>
                </div>
              );
            })}
            {tasks.length > TASKS_SHOWN && (
              <button onClick={() => setShowAllTasks((v) => !v)} className="h-11 rounded-xl border border-[#262626] text-sm font-semibold text-white/70">
                {showAllTasks ? "Show fewer" : `Show all ${tasks.length} tasks`}
              </button>
            )}
          </div>
        )}

        {/* Unread chats */}
        {unreadChats.length > 0 && (
          <div ref={chatsRef} className="flex flex-col gap-2.5 pt-1.5 scroll-mt-4">
            {sectionLabel(`NEW · ${unreadTotal}`)}
            {unreadChats.slice(0, 5).map((c) => {
              const color = c.kind === "direct" ? BLUE : c.kind === "general_room" ? "#9CA3AF" : sectionMeta(c.section).color;
              const title = chatTitle(c);
              return (
                <div key={c.id} className={`${card} flex items-center gap-3 p-3`}>
                  <span className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center font-bold text-[15px]" style={{ background: tint(color), border: `2px solid ${color}`, color }}>
                    {title.charAt(0).toUpperCase()}
                  </span>
                  <button onClick={() => navigate(chatHref(c))} className="flex-1 min-w-0 flex flex-col gap-[3px] text-left">
                    <span className="text-[15px] font-semibold text-white truncate">{c.last_body}</span>
                    <span className="text-xs text-white/55 truncate">
                      {[c.last_sender_name, c.kind === "direct" ? null : title, c.event_title].filter(Boolean).join(" · ")} · {c.unread} new
                    </span>
                  </button>
                  <button onClick={() => navigate(chatHref(c))} aria-label={`Reply in ${title}`} className="w-11 h-11 shrink-0 rounded-[10px] bg-[#1f1f1f] text-white flex items-center justify-center">
                    <Reply className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Changes */}
        {changes.length > 0 && (
          <div ref={changesRef} className="flex flex-col gap-2.5 pt-1.5 scroll-mt-4">
            {sectionLabel("CHANGED")}
            {changes.slice(0, 5).map((c) => {
              const isTask = c.kind === "task_done";
              return (
                <div key={c.key} className={`${card} flex items-center gap-3 p-3`}>
                  <span className="w-11 h-11 shrink-0 rounded-[10px] flex items-center justify-center" style={{ background: isTask ? "#0f1d08" : "#0d1a2a", color: isTask ? "#8CFF3D" : BLUE }}>
                    {isTask ? <CheckCircle2 className="w-[22px] h-[22px]" /> : <Clock className="w-[22px] h-[22px]" />}
                  </span>
                  <button onClick={() => openByToken(c.share_token)} className="flex-1 min-w-0 flex flex-col gap-[3px] text-left">
                    <span className="text-[15px] font-semibold text-white leading-snug">
                      {isTask ? `Done: ${c.task_title}` : `${c.event_title || "An event"} was updated`}
                    </span>
                    <span className="text-xs text-white/55 truncate">
                      {[isTask ? (c.by_name || sectionMeta(c.section).label) : null, isTask ? c.event_title : (c.event_date ? shortDate(c.event_date) : null), timeAgo(c.at)].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  <button onClick={() => gotIt(c)} className="h-11 px-3.5 shrink-0 rounded-[10px] bg-[#1f1f1f] text-white text-[13px] font-semibold">Got it</button>
                </div>
              );
            })}
          </div>
        )}

        {/* This week */}
        {!gigsLoading && weekGigs.length > 0 && (
          <div className="flex flex-col gap-2 pt-1.5">
            {sectionLabel(weekIsEmpty ? "COMING UP" : "THIS WEEK")}
            <div className="grid grid-cols-2 gap-2">
              {weekGigs.map((g) => {
                const pr = progressByShow?.[g.id];
                const pct = pr && pr.total_roles ? Math.round((pr.confirmed_roles / pr.total_roles) * 100) : null;
                const open = pr?.open_tasks || 0;
                return (
                  <TicketCard
                    key={g.share_token || g.id}
                    color={eventTypeColor(g.event_type) || accent}
                    date={g.date}
                    photo={g.icon_url}
                    compact
                    stubWidth={44}
                    notch={6}
                    shadow={false}
                    onClick={() => onOpenGig(g)}
                    ariaLabel={`Open ${g.event_name || g.band_name || "event"}`}
                  >
                    <span className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-sm font-semibold text-white truncate w-full">{g.event_name || g.band_name || "Untitled"}</span>
                      <span className="text-[10px] text-white/55 truncate w-full" style={{ fontFamily: SCENE_MONO }}>{(g.venue || "No venue yet").toUpperCase()}</span>
                      <span className="relative w-full h-1.5 rounded-[3px] bg-[#262626] overflow-hidden">
                        <span className="absolute left-0 top-0 bottom-0 rounded-[3px]" style={{ width: `${pct ?? 0}%`, background: accent }} />
                      </span>
                      <span className="text-[10px]" style={{ fontFamily: SCENE_MONO, color: open ? BLAZE : "#8CFF3D" }}>
                        {pct == null ? " " : open ? `${open} TASK${open === 1 ? "" : "S"} OPEN` : "ALL CLEAR"}
                      </span>
                    </span>
                  </TicketCard>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Undo bar after marking a task done */}
      {undoTask && (
        <div className="fixed left-4 right-4 bottom-[104px] z-50 max-w-lg mx-auto flex items-center gap-3 px-4 h-12 rounded-xl bg-[#222] border border-[#333] shadow-xl">
          <span className="flex-1 min-w-0 text-sm text-white truncate">Done: {undoTask.title}</span>
          <button onClick={undoDone} className="h-11 px-2 text-sm font-bold" style={{ color: accent }}>Undo</button>
        </div>
      )}
    </div>
  );
}
