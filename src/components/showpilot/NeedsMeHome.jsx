import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Clock, Reply, CheckCircle2, UserPlus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import useNeedsMe from "@/hooks/useNeedsMe";
import useEventFeed from "@/lib/eventFeed";
import InviteSheet from "@/components/showpilot/InviteSheet";
import EventTypeIcon from "@/components/showpilot/EventTypeIcon";
import TaskSheet, { claimText } from "@/components/showpilot/TaskSheet";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { useAuth } from "@/lib/AuthContext";
import { WEB_LABELS } from "@/lib/eventRoles";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import {
  dueInfo, localISO, shortDate, timeAgo, chatHref, chatTitle,
  readSeenChanges, rememberSeenChange, sectionMeta, vocab, visibleChats,
} from "@/lib/needsMe";

const BLUE = "#60A5FA";
const G = "#8CFF3D";
const AMBER = "#FF6A00";
// Count tiles (job 73): due now = red, new messages = Show Pilot green,
// changed = yellow.
const RED = "#FF4545";
const CHANGED_YELLOW = "#FACC15";

// Section / profile colors and names, as on the event Board.
const SECTION_COLOR = { venue: "#60A5FA", manager: "#F87171", band: "#F87171", engineer: "#8CFF3D", lighting: "#8CFF3D" };
const SECTION_LABEL = { venue: "Venue", manager: "Manager", engineer: "Audio / Lighting" };

const Pill = ({ children, style }) => (
  <span className="shrink-0 w-[76px] text-center text-[10px] font-bold tracking-[0.1em] py-[4px] rounded" style={{ fontFamily: SCENE_MONO, ...style }}>{children}</span>
);

// The company phone's home (job 73): straight to what needs you, across
// every event you're part of. The main feed is one To do list - the desktop
// event Board's rows (conflicts, requests, open tasks, profiles with nobody
// on them) - grouped by event, each with the event's photo, so anything can
// be checked or done on the go. Then new messages and recent changes.
// Adding a task lives on the "+" button; the calendar lives on Calendar.
// Nothing here opens the event web: that's the desktop's job. Requests are
// confirmed in place, a task opens its summary box (Claim / Done / details)
// right here, and changes are acknowledged with Got it.
//
// `gigs` come from BandHome, which already loads them for the Calendar.
export default function NeedsMeHome({ preferences, gigs, gigsLoading = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id || null;
  const accountType = preferences?.account_type;
  const style = getAccountTypeStyle(accountType);
  const accent = style.color;
  const words = vocab(accountType);
  const { data, loading: chatsLoading } = useNeedsMe();
  const { groups, loading: feedLoading, patchTask, patchReq } = useEventFeed(gigs, userId);
  const [openTask, setOpenTask] = useState(null); // { gig, perms, taskId }
  const [seen, setSeen] = useState(() => readSeenChanges());
  const [busy, setBusy] = useState(null);
  const [undo, setUndo] = useState(null); // { token, task }
  const undoTimer = useRef(null);
  const feedRef = useRef(null);
  const chatsRef = useRef(null);
  const changesRef = useRef(null);

  const todayISO = localISO();
  const unreadChats = visibleChats(data?.chats).filter((c) => c.unread > 0);
  const unreadTotal = unreadChats.reduce((n, c) => n + Number(c.unread || 0), 0);
  const changes = (data?.changes || []).filter((c) => !seen.has(c.key));
  const rowCount = groups.reduce((n, g) => n + g.rows.length, 0);
  const dueNow = groups.reduce((n, g) => n + g.rows.filter((r) => r.kind === "task" && r.task.due_date && r.task.due_date <= todayISO).length, 0);

  // Today's / tonight's event(s), for the card at the top.
  const todays = useMemo(() => (gigs || []).filter((g) => g.date === todayISO), [gigs, todayISO]);

  // Confirm a request, or mark a conflict sorted (status -> confirmed), or
  // flag a request as a conflict. The row leaves the feed once confirmed.
  const setReqStatus = (gig, r, status) => run(`r-${r.id}`, async () => {
    const { data: next, error } = await supabase.rpc("update_show_requirement", { p_token: gig.share_token, p_requirement_id: r.id, p_status: status });
    if (error) throw error;
    patchReq(gig.share_token, r.id, next || { status });
  });

  const run = async (id, fn) => {
    if (busy) return;
    setBusy(id);
    try { await fn(); } catch (err) { console.error(err); }
    setBusy(null);
  };
  const claim = (gig, t) => run(t.id, async () => {
    const { data: next, error } = await supabase.rpc("claim_gig_task", { p_token: gig.share_token, p_task_id: t.id, p_claim: true });
    if (error) throw error;
    patchTask(gig.share_token, t.id, next || { claimed_by: userId, claimed_by_name: "You" });
  });
  const done = (gig, t) => run(t.id, async () => {
    const { error } = await supabase.rpc("set_gig_task_status", { p_token: gig.share_token, p_task_id: t.id, p_done: true });
    if (error) throw error;
    patchTask(gig.share_token, t.id, { status: "done" });
    clearTimeout(undoTimer.current);
    setUndo({ token: gig.share_token, task: t });
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  });
  const taskRpc = async (gig, t, fn, args) => {
    const { data: next, error } = await supabase.rpc(fn, { p_token: gig.share_token, p_task_id: t.id, ...args });
    if (error) throw error;
    patchTask(gig.share_token, t.id, next || {});
  };
  const undoDone = async () => {
    const u = undo;
    if (!u) return;
    setUndo(null);
    clearTimeout(undoTimer.current);
    const { error } = await supabase.rpc("set_gig_task_status", { p_token: u.token, p_task_id: u.task.id, p_done: false });
    if (error) { console.error(error); return; }
    patchTask(u.token, u.task.id, { status: u.task.status || "open" });
  };

  const gotIt = (change) => {
    rememberSeenChange(change.key);
    setSeen((s) => new Set([...s, change.key]));
  };

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const dateLine = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const tint = (c) => c + "1c";
  const sectionLabel = (txt, right) => (
    <div className="flex items-center text-sm font-bold tracking-[0.08em] text-white/55 px-0.5" style={{ fontFamily: SCENE_FONT }}>
      {txt}{right && <span className="ml-auto text-[11px] tracking-[0.1em] text-white/35" style={{ fontFamily: SCENE_MONO }}>{right}</span>}
    </div>
  );
  const card = "rounded-xl bg-[#151515] border border-[#262626]";
  const meta = (color, text) => (
    <span className="block text-[10.5px] tracking-[0.08em] mt-0.5 break-words" style={{ fontFamily: SCENE_MONO, color }}>{text}</span>
  );
  const rowCls = "w-full flex items-center gap-3 px-3 py-3 text-left bg-[#121212] active:bg-[#1a1a1a]";
  // Wait for Home to load your events too, so the empty "Nothing needs you"
  // card never flashes before the feed arrives.
  const loading = gigsLoading || feedLoading || chatsLoading;
  const nothing = !loading && rowCount === 0 && unreadChats.length === 0 && changes.length === 0;

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
        <div
          key={g.share_token || g.id}
          className="mx-5 mb-3 w-[calc(100%-40px)] relative isolate overflow-hidden flex flex-col gap-2 p-3.5 rounded-[14px] text-left text-white"
          style={{ background: tint(accent), border: `1.5px solid ${accent}`, boxShadow: `0 0 18px ${accent}40` }}
        >
          {g.icon_url && <img src={g.icon_url} alt="" className="absolute inset-0 -z-10 w-full h-full object-cover opacity-30" />}
          <span className="flex justify-between w-full text-[13px] font-bold tracking-[0.08em]" style={{ fontFamily: SCENE_FONT, color: accent }}>
            <span>{words.today.toUpperCase()}</span>
            {g.event_time && <span>{g.event_time.toUpperCase()}</span>}
          </span>
          <span className="text-lg font-semibold truncate w-full">{g.event_name || g.band_name || "Untitled"}</span>
          {g.venue && <span className="text-xs text-white/70 truncate w-full" style={{ fontFamily: SCENE_MONO }}>{[g.venue, g.city].filter(Boolean).join(" · ").toUpperCase()}</span>}
        </div>
      ))}

      {/* Count tiles */}
      <div className="grid grid-cols-3 gap-2 px-5 pb-3.5">
        {[
          { n: dueNow, label: "DUE NOW", color: RED, ref: feedRef },
          { n: unreadTotal, label: "NEW", color: G, ref: chatsRef },
          { n: changes.length, label: "CHANGED", color: CHANGED_YELLOW, ref: changesRef },
        ].map((t) => (
          <button
            key={t.label}
            onClick={() => scrollTo(t.ref)}
            className="flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl text-left"
            style={{ background: tint(t.color), border: `1.5px solid ${t.color}`, color: t.color }}
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

        {nothing && (
          <div className={`${card} p-5 flex flex-col items-center gap-2 text-center`}>
            <CheckCircle2 className="w-8 h-8" style={{ color: accent }} />
            <p className="m-0 text-base font-semibold text-white">Nothing needs you right now</p>
            <p className="m-0 text-sm text-white/55">Conflicts, requests, tasks, new messages and changes on your {words.events.toLowerCase()} show up here.</p>
          </div>
        )}

        {/* The feed: every event's To do, nearest event first. */}
        {!feedLoading && rowCount > 0 && (
          <div ref={feedRef} className="flex flex-col gap-2.5 scroll-mt-4">
            {sectionLabel("TO DO", `${rowCount} OPEN`)}
            {groups.map(({ gig, rows }) => (
              <div key={gig.share_token} className="rounded-xl border border-[#242424] overflow-hidden">
                {/* Event header: its photo, name and date (on a phone the full
                    event lives on desktop, so this doesn't open the web). */}
                <div className="relative isolate overflow-hidden w-full flex items-center gap-3 px-3 py-2.5 text-left bg-[#161616] border-b border-[#242424]">
                  {gig.icon_url && <img src={gig.icon_url} alt="" className="absolute inset-0 -z-10 w-full h-full object-cover opacity-25" />}
                  <span className="absolute inset-0 -z-10" style={{ background: "linear-gradient(90deg, rgba(22,22,22,0.92) 30%, rgba(22,22,22,0.55))" }} />
                  <EventTypeIcon type={gig.event_type || "Other"} imageUrl={gig.icon_url} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-white truncate">{gig.event_name || gig.band_name || "Untitled"}</span>
                    <span className="block text-[10.5px] tracking-[0.08em] text-white/50 truncate" style={{ fontFamily: SCENE_MONO }}>
                      {[gig.date ? (gig.date === todayISO ? words.today : shortDate(gig.date)) : "NO DATE", gig.venue].filter(Boolean).join(" · ").toUpperCase()}
                    </span>
                  </span>
                </div>

                <div className="divide-y divide-[#1f1f1f]">
                  {rows.map((r) => {
                    if (r.kind === "conflict" || r.kind === "request") {
                      const c = SECTION_COLOR[r.section] || "#9A9A9A";
                      const conflict = r.kind === "conflict";
                      return (
                        <div key={r.id} className={rowCls}>
                          <Pill style={conflict ? { background: AMBER, color: "#0d0d0d" } : { background: "#fff", color: "#0d0d0d" }}>{conflict ? "CONFLICT" : "REQUEST"}</Pill>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] text-white leading-snug">{r.req.name}{r.req.value ? ` · ${r.req.value}` : ""}</span>
                            {meta(c, `${(SECTION_LABEL[r.section] || r.section).toUpperCase()} · REQUESTS`)}
                          </span>
                          {r.canWork && (
                            <span className="shrink-0 flex flex-col items-stretch gap-1.5">
                              <button type="button" disabled={busy === r.id} onClick={() => setReqStatus(gig, r.req, "confirmed")} className="h-9 px-3 flex items-center justify-center gap-1 rounded-lg text-[11px] font-bold tracking-[0.06em] disabled:opacity-50" style={{ background: G, color: "#0d0d0d" }}>
                                <Check className="w-3.5 h-3.5" /> {conflict ? "SORTED" : "CONFIRM"}
                              </button>
                              {!conflict && (
                                <button type="button" disabled={busy === r.id} onClick={() => setReqStatus(gig, r.req, "conflict")} className="h-9 px-3 rounded-lg text-[11px] font-bold tracking-[0.06em] border disabled:opacity-50" style={{ borderColor: AMBER + "88", color: AMBER }}>CAN'T</button>
                              )}
                            </span>
                          )}
                        </div>
                      );
                    }
                    if (r.kind === "task") {
                      const t = r.task;
                      const c = SECTION_COLOR[r.section] || "#9A9A9A";
                      const mine = !!userId && t.claimed_by === userId;
                      const due = dueInfo(t.due_date);
                      const who = t.claimed_by ? (mine ? "YOURS" : `CLAIMED · ${String(claimText(t, userId) || "").toUpperCase()}`) : "OPEN";
                      return (
                        <div key={r.id} role="button" tabIndex={0} onClick={() => setOpenTask({ token: gig.share_token, taskId: t.id })}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenTask({ token: gig.share_token, taskId: t.id }); } }}
                          className={`${rowCls} cursor-pointer`}>
                          <Pill style={{ background: "#3b2a12", color: "#FF9A3D", border: `1px solid ${AMBER}66` }}>TASK</Pill>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] text-white leading-snug">{t.title}</span>
                            {meta(c, `${(SECTION_LABEL[r.section] || r.section).toUpperCase()} · ${who}`)}
                            {due && meta(due.urgent ? RED : "rgba(255,255,255,0.5)", due.label)}
                          </span>
                          {r.canWork && (
                            <span className="shrink-0 flex flex-col items-stretch gap-1.5">
                              {!t.claimed_by && (
                                <button type="button" disabled={busy === t.id} onClick={(e) => { e.stopPropagation(); claim(gig, t); }} className="h-9 px-3 rounded-lg text-[11px] font-bold tracking-[0.06em] border border-[#2a2a2a] text-white/80 disabled:opacity-50">CLAIM</button>
                              )}
                              <button type="button" disabled={busy === t.id} onClick={(e) => { e.stopPropagation(); done(gig, t); }} className="h-9 px-3 flex items-center justify-center gap-1 rounded-lg text-[11px] font-bold tracking-[0.06em] disabled:opacity-50" style={{ background: G, color: "#0d0d0d" }}>
                                <Check className="w-3.5 h-3.5" /> DONE
                              </button>
                            </span>
                          )}
                        </div>
                      );
                    }
                    // Invite: a profile on your event nobody's on yet.
                    const c = SECTION_COLOR[r.role] || "#9A9A9A";
                    const label = WEB_LABELS[r.role] || r.role;
                    return (
                      <InviteSheet key={r.id} showId={gig.id} elevated preselect={r.role} trigger={
                        <button type="button" className={rowCls}>
                          <Pill style={{ background: "#2a2a2a", color: "#ddd" }}>INVITE</Pill>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] text-white leading-snug">{label} has nobody yet</span>
                            {meta(c, label.toUpperCase())}
                          </span>
                          <span className="shrink-0 h-9 flex items-center gap-1 px-3 rounded-lg text-[11px] font-bold tracking-[0.06em] border border-[#2a2a2a] text-white/80"><UserPlus className="w-3.5 h-3.5" /> INVITE</span>
                        </button>
                      } />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* New messages */}
        {unreadChats.length > 0 && (
          <div ref={chatsRef} className="flex flex-col gap-2.5 pt-1.5 scroll-mt-4">
            {sectionLabel(`NEW · ${unreadTotal}`)}
            {unreadChats.slice(0, 5).map((c) => {
              const color = c.kind === "direct" ? BLUE : c.kind === "general_room" ? "#9CA3AF" : sectionMeta(c.section).color;
              const title = chatTitle(c);
              const photo = (gigs || []).find((g) => g.share_token === c.share_token)?.icon_url;
              return (
                <div key={c.id} className={`${card} flex items-center gap-3 p-3`}>
                  <span className="w-11 h-11 shrink-0 rounded-full overflow-hidden flex items-center justify-center font-bold text-[15px]" style={{ background: tint(color), border: `2px solid ${color}`, color }}>
                    {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : title.charAt(0).toUpperCase()}
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
                  <span className="w-11 h-11 shrink-0 rounded-[10px] flex items-center justify-center" style={{ background: isTask ? "#0f1d08" : "#0d1a2a", color: isTask ? G : BLUE }}>
                    {isTask ? <CheckCircle2 className="w-[22px] h-[22px]" /> : <Clock className="w-[22px] h-[22px]" />}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col gap-[3px] text-left">
                    <span className="text-[15px] font-semibold text-white leading-snug">
                      {isTask ? `Done: ${c.task_title}` : `${c.event_title || "An event"} was updated`}
                    </span>
                    <span className="text-xs text-white/55 truncate">
                      {[isTask ? (c.by_name || sectionMeta(c.section).label) : null, isTask ? c.event_title : (c.event_date ? shortDate(c.event_date) : null), timeAgo(c.at)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <button onClick={() => gotIt(c)} className="h-11 px-3.5 shrink-0 rounded-[10px] bg-[#1f1f1f] text-white text-[13px] font-semibold">Got it</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* A task's summary box, right here (no event web on a phone). */}
      {(() => {
        if (!openTask) return null;
        const grp = groups.find((g) => g.gig.share_token === openTask.token);
        const t = grp && (grp.gig.tasks || []).find((x) => x.id === openTask.taskId);
        if (!t) return null;
        const gig = grp.gig;
        const row = grp.rows.find((x) => x.kind === "task" && x.task.id === t.id);
        const isOwner = !!grp.perms?.is_owner;
        return (
          <TaskSheet
            task={t}
            color={SECTION_COLOR[t.section] || G}
            label={SECTION_LABEL[t.section] || t.section}
            userId={userId}
            isOwner={isOwner}
            canWork={!!row?.canWork}
            signedIn={!!userId}
            onClose={() => setOpenTask(null)}
            onClaim={() => taskRpc(gig, t, "claim_gig_task", { p_claim: true })}
            onRelease={() => taskRpc(gig, t, "claim_gig_task", { p_claim: false })}
            onDone={async () => { await taskRpc(gig, t, "set_gig_task_status", { p_done: true }); setOpenTask(null); }}
            onSaveDetails={isOwner ? (details) => taskRpc(gig, t, "set_gig_task_details", { p_details: details }) : undefined}
            onSaveDue={isOwner ? (due) => taskRpc(gig, t, "set_gig_task_due_date", { p_due_date: due || null }) : undefined}
          />
        );
      })()}

      {/* Undo bar after marking a task done */}
      {undo && (
        <div className="fixed left-4 right-4 bottom-[104px] z-50 max-w-lg mx-auto flex items-center gap-3 px-4 h-12 rounded-xl bg-[#222] border border-[#333] shadow-xl">
          <span className="flex-1 min-w-0 text-sm text-white truncate">Done: {undo.task.title}</span>
          <button onClick={undoDone} className="h-11 px-2 text-sm font-bold" style={{ color: accent }}>Undo</button>
        </div>
      )}
    </div>
  );
}
