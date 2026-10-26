import React, { useMemo, useRef, useState } from "react";
import { eventTitle } from "@/lib/eventTitle";
import { Check, CheckCircle2, ChevronDown, UserPlus } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import useEventFeed from "@/lib/eventFeed";
import { nextNotNeeded } from "@/lib/inviteGroups";
import InviteSheet from "@/components/showpilot/InviteSheet";
import EventTypeIcon from "@/components/showpilot/EventTypeIcon";
import TaskSheet, { claimText } from "@/components/showpilot/TaskSheet";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { useAuth } from "@/lib/AuthContext";
import { WEB_LABELS } from "@/lib/eventRoles";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import {
  dueInfo, localISO, shortDate, vocab, SECTION_FOR_TYPE,
} from "@/lib/needsMe";

const G = "#8CFF3D";
const AMBER = "#FF6A00";
// Overdue / due today (job 73).
const RED = "#FF4545";

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
// be checked or done on the go. Only what's needed from YOU: requests and
// conflicts on your sections, tasks you've claimed or open ones on your
// sections, invites on your own events. Each event is a dropdown (nearest
// open). Updates and new messages live elsewhere (Chats tab); adding a task
// on the "+" button; the calendar on Calendar.
// Nothing here opens the event web: that's the desktop's job. Requests are
// confirmed in place, a task opens its summary box (Claim / Done / details)
// right here, and changes are acknowledged with Got it.
//
// `gigs` come from BandHome, which already loads them for the Calendar.
export default function NeedsMeHome({ preferences, gigs, gigsLoading = false }) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const accountType = preferences?.account_type;
  const style = getAccountTypeStyle(accountType);
  const accent = style.color;
  const words = vocab(accountType);
  // Only what's needed from you (job 73): your sections, your tasks, your invites.
  const feedOpts = useMemo(() => ({ mine: true, homeSection: SECTION_FOR_TYPE[accountType] || null }), [accountType]);
  const { groups, loading: feedLoading, patchTask, patchReq, reload: reloadFeed } = useEventFeed(gigs, userId, feedOpts);
  // Each event is a dropdown; the nearest one starts open.
  const [openEvents, setOpenEvents] = useState(null); // Set of share tokens, null = default
  const [openTask, setOpenTask] = useState(null); // { gig, perms, taskId }
  const [busy, setBusy] = useState(null);
  const [openInvite, setOpenInvite] = useState(null); // "<token>:<group>" of the invite row that's open
  const [undo, setUndo] = useState(null); // { token, task }
  const undoTimer = useRef(null);

  const todayISO = localISO();

  // The feed: each event's to-dos plus its recent changes, nearest event
  // first. An event with only changes still gets its own group.
  const feed = groups;
  const rowCount = feed.reduce((n, g) => n + g.rows.length, 0);
  const isOpen = (token, i) => (openEvents ? openEvents.has(token) : i === 0);
  const toggleEvent = (token, i) => setOpenEvents((cur) => {
    const next = new Set(cur || (feed[0] ? [feed[0].gig.share_token] : []));
    if (isOpen(token, i)) next.delete(token); else next.add(token);
    return next;
  });

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
  // Owner marks a profile Not needed on this event, or needed again (job 174).
  const setNotNeeded = (gig, perms, role, on) => run(`nn-${gig.id}-${role}`, async () => {
    const { error } = await supabase.from("shows").update({ not_needed_roles: nextNotNeeded(perms, role, on) }).eq("id", gig.id);
    if (error) throw error;
    await reloadFeed();
  });
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
  const loading = gigsLoading || feedLoading;
  const nothing = !loading && rowCount === 0;

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
          <span className="text-lg font-semibold truncate w-full">{eventTitle(g)}</span>
          {g.venue && <span className="text-xs text-white/70 truncate w-full" style={{ fontFamily: SCENE_MONO }}>{[g.venue, g.city].filter(Boolean).join(" · ").toUpperCase()}</span>}
        </div>
      ))}

      <div className="flex flex-col gap-2.5 px-5">
        {loading && (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: accent + "40", borderTopColor: accent }} /></div>
        )}

        {nothing && (
          <div className={`${card} p-5 flex flex-col items-center gap-2 text-center`}>
            <CheckCircle2 className="w-8 h-8" style={{ color: accent }} />
            <p className="m-0 text-base font-semibold text-white">Nothing needs you right now</p>
            <p className="m-0 text-sm text-white/55">Requests, conflicts, tasks and invites that need you on your {words.events.toLowerCase()} show up here.</p>
          </div>
        )}

        {/* The feed: every event's To do, nearest event first. */}
        {!loading && rowCount > 0 && (
          <div className="flex flex-col gap-2.5">
            {sectionLabel("TO DO", `${rowCount} OPEN`)}
            {feed.map(({ gig, rows, perms }, gi) => {
              const open = isOpen(gig.share_token, gi);
              const urgent = rows.filter((r) => r.kind === "conflict" || (r.kind === "task" && r.task.due_date && r.task.due_date <= todayISO)).length;
              return (
              <div key={gig.share_token} className="rounded-xl border border-[#242424] overflow-hidden">
                {/* Event header: photo, name, date, how many things need you;
                    tap to open or close this event's list (job 73). It never
                    opens the event web on a phone. */}
                <button type="button" onClick={() => toggleEvent(gig.share_token, gi)} aria-expanded={open}
                  className={`relative isolate overflow-hidden w-full flex items-center gap-3 px-3 py-2.5 text-left bg-[#161616] active:bg-[#1c1c1c] ${open ? "border-b border-[#242424]" : ""}`}>
                  {gig.icon_url && <img src={gig.icon_url} alt="" className="absolute inset-0 -z-10 w-full h-full object-cover opacity-25" />}
                  <span className="absolute inset-0 -z-10" style={{ background: "linear-gradient(90deg, rgba(22,22,22,0.92) 30%, rgba(22,22,22,0.55))" }} />
                  <EventTypeIcon type={gig.event_type || "Other"} imageUrl={gig.icon_url} size={36} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-white truncate">{eventTitle(gig)}</span>
                    <span className="block text-[10.5px] tracking-[0.08em] text-white/50 truncate" style={{ fontFamily: SCENE_MONO }}>
                      {[gig.date ? (gig.date === todayISO ? words.today : shortDate(gig.date)) : "NO DATE", gig.venue].filter(Boolean).join(" · ").toUpperCase()}
                    </span>
                  </span>
                  {urgent > 0 && <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: RED, boxShadow: `0 0 8px ${RED}` }} aria-label="Something urgent" />}
                  <span className="shrink-0 min-w-[26px] h-[26px] px-2 rounded-full flex items-center justify-center text-[12px] font-bold" style={{ fontFamily: SCENE_MONO, background: accent, color: "#0d0d0d" }}>{rows.length}</span>
                  <ChevronDown className={`w-5 h-5 shrink-0 text-white/60 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>

                {open && <div className="divide-y divide-[#1f1f1f]">
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
                    // Profiles on your event nobody's on yet, one row per pair
                    // (job 174): INVITE, or orange PENDING once the invites are
                    // out. Tap to open it: Invite each profile, or mark it
                    // Not needed (then it stops asking).
                    const c = SECTION_COLOR[r.role] || "#9A9A9A";
                    const g = r.group;
                    const pending = r.kind === "pending";
                    const expanded = openInvite === `${gig.share_token}:${g.key}`;
                    const names = g.open.map((m) => WEB_LABELS[m.role]).join(" · ");
                    return (
                      <div key={r.id}>
                        <button type="button" onClick={() => setOpenInvite(expanded ? null : `${gig.share_token}:${g.key}`)} aria-expanded={expanded} className={rowCls}>
                          <Pill style={pending ? { background: AMBER, color: "#0d0d0d" } : { background: "#2a2a2a", color: "#ddd" }}>{pending ? "PENDING" : "INVITE"}</Pill>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] text-white leading-snug">{pending ? `${g.label} invite sent` : `${g.label} has nobody yet`}</span>
                            {meta(pending ? AMBER : c, `${names.toUpperCase()}${pending ? " · WAITING TO ACCEPT" : g.members.length > 1 ? " · STILL NEEDED" : ""}`)}
                          </span>
                          <ChevronDown className={`w-5 h-5 shrink-0 text-white/60 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </button>
                        {expanded && (
                          <div className="px-3 pb-3 pt-1 bg-[#101010] flex flex-col gap-2">
                            {g.members.filter((m) => !m.claimed).map((m) => (
                              <div key={m.role} className="flex items-center gap-2">
                                <span className="flex-1 min-w-0">
                                  <span className="block text-[15px] truncate" style={{ color: m.notNeeded ? "rgba(255,255,255,0.4)" : "#fff" }}>{WEB_LABELS[m.role]}</span>
                                  <span className="block text-[10px] tracking-[0.08em]" style={{ fontFamily: SCENE_MONO, color: m.notNeeded ? "rgba(255,255,255,0.35)" : m.invited ? AMBER : SECTION_COLOR[m.role] }}>
                                    {m.notNeeded ? "NOT NEEDED" : m.invited ? "PENDING" : "NOBODY YET"}
                                  </span>
                                </span>
                                {!m.notNeeded && (
                                  <InviteSheet showId={gig.id} elevated preselect={m.invited ? null : m.role} onChanged={reloadFeed} trigger={
                                    <button type="button" className="h-10 px-3 shrink-0 flex items-center gap-1 rounded-lg text-[12px] font-bold tracking-[0.06em] border border-[#2a2a2a] text-white/85">
                                      <UserPlus className="w-4 h-4" /> {m.invited ? "INVITES" : "INVITE"}
                                    </button>
                                  } />
                                )}
                                <button type="button" disabled={busy === `nn-${gig.id}-${m.role}`} onClick={() => setNotNeeded(gig, perms, m.role, !m.notNeeded)}
                                  className="h-10 px-3 shrink-0 rounded-lg text-[12px] font-bold tracking-[0.06em] border border-[#2a2a2a] text-white/60 disabled:opacity-50">
                                  {m.notNeeded ? "NEEDED" : "NOT NEEDED"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>}
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
            shareToken={gig.share_token}
            onChanged={(d) => patchTask(gig.share_token, t.id, d)}
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
