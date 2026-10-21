import React, { useEffect, useState } from "react";
import { ArrowLeft, Check, Pencil, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

const G = "#8CFF3D";
const AMBER = "#FF6A00";

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
const dueLabel = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "");

// Who holds a task, in words, from the viewer's point of view.
export function claimText(task, userId) {
  if (!task?.claimed_by) return null;
  if (userId && task.claimed_by === userId) return "You";
  return task.claimed_by_name || "Someone";
}

// The summary a bulletin board task opens: what needs doing (the owner's
// details), which profile it's for, who added it and when, the due date and
// who has claimed it. Back closes it; Claim hands it to you and takes you to
// that profile's Current tasks. Used by the event boards and the profile web.
export default function TaskSheet({
  task, color = G, label, userId, isOwner = false, canWork = false, signedIn = true,
  onClose, onClaim, onRelease, onDone, onSaveDetails, onSaveDue, onGoToCurrent,
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task?.details || "");
  const [dueEditing, setDueEditing] = useState(false);
  const [dueDraft, setDueDraft] = useState(task?.due_date || "");

  useEffect(() => { setDraft(task?.details || ""); setEditing(false); setErr(""); setDueEditing(false); setDueDraft(task?.due_date || ""); }, [task?.id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  if (!task) return null;
  const done = task.status === "done";
  const mine = !!userId && task.claimed_by === userId;
  const holder = claimText(task, userId);
  const takenByOther = !!task.claimed_by && !mine;
  const canEditDue = isOwner && !done && !!onSaveDue;

  const run = async (kind, fn) => {
    if (busy) return;
    setBusy(kind);
    setErr("");
    try { await fn(); } catch (e) {
      const m = String(e?.message || "");
      setErr(m.startsWith("Already claimed") || m.includes("already done") || m.includes("permission") ? m : "Couldn't save that. Try again.");
    }
    setBusy("");
  };

  const statusChip = done ? { text: "DONE", c: G } : task.claimed_by ? { text: mine ? "YOURS" : "CLAIMED", c: color } : { text: "OPEN", c: AMBER };
  const rows = [
    ["PROFILE", label || task.section],
    ["ADDED", [task.created_by_name, shortDate(task.created_at)].filter(Boolean).join(" · ") || "—"],
    // The owner can set, change or clear the due date right here.
    canEditDue
      ? ["DUE", dueEditing ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              autoFocus
              value={dueDraft}
              onChange={(e) => setDueDraft(e.target.value)}
              aria-label="Due date"
              className="h-9 bg-[#121212] border border-[#2a2a2a] rounded-lg px-2.5 text-white text-[14px] [color-scheme:dark] focus:outline-none focus:border-[#8CFF3D]/60"
            />
            <button type="button" disabled={!!busy || !dueDraft} onClick={() => run("due", async () => { await onSaveDue(dueDraft); setDueEditing(false); })} className="h-9 px-3 rounded-lg text-[13px] font-bold bg-[#8CFF3D] text-[#0d0d0d] disabled:opacity-50">{busy === "due" ? "Saving..." : "Set"}</button>
            <button type="button" disabled={!!busy} onClick={() => { setDueEditing(false); setDueDraft(task.due_date || ""); }} className="h-9 px-2 text-[13px] text-white/50 hover:text-white">Cancel</button>
          </div>
        ) : (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={task.due_date ? "" : "text-white/40"}>{task.due_date ? dueLabel(task.due_date) : "No due date"}</span>
            <button type="button" disabled={!!busy} onClick={() => { setDueDraft(task.due_date || ""); setDueEditing(true); }} className="flex items-center gap-1 text-[12px] font-semibold text-white/60 hover:text-white">
              <Pencil className="w-3.5 h-3.5" /> {task.due_date ? "Change" : "Set due date"}
            </button>
            {task.due_date && (
              <button type="button" disabled={!!busy} onClick={() => run("due", () => onSaveDue(null))} className="text-[12px] font-semibold text-white/45 hover:text-white">{busy === "due" ? "Clearing..." : "Clear"}</button>
            )}
          </span>
        )]
      : task.due_date ? ["DUE", dueLabel(task.due_date)] : null,
    done
      ? ["DONE", [shortDate(task.completed_at), holder && `claimed by ${holder}`].filter(Boolean).join(" · ") || "Done"]
      : ["CLAIMED", holder ? `${holder} · since ${shortDate(task.claimed_at)}` : "Nobody yet"],
  ].filter(Boolean);

  const btn = "h-11 px-4 rounded-[10px] text-[15px] font-bold tracking-[0.06em] flex items-center justify-center gap-1.5 disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4" style={{ fontFamily: SCENE_FONT }} role="dialog" aria-modal="true" aria-label={`Task: ${task.title}`}>
      <div className="absolute inset-0 bg-black/70" onClick={() => !busy && onClose?.()} />
      <div className="relative w-full sm:max-w-[460px] max-h-[90vh] overflow-y-auto bg-[#121212] border border-[#2a2a2a] rounded-t-[18px] sm:rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="h-1.5 w-full" style={{ background: color }} />
        <div className="px-5 pt-4 pb-5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-[0.1em] px-2 py-1 rounded uppercase" style={{ fontFamily: SCENE_MONO, color, background: color + "1f" }}>{label || task.section}</span>
            <span className="text-[11px] font-bold tracking-[0.1em] px-2 py-1 rounded" style={{ fontFamily: SCENE_MONO, color: statusChip.c, background: statusChip.c + "1a", border: `1px solid ${statusChip.c}55` }}>{statusChip.text}</span>
            <button type="button" onClick={() => !busy && onClose?.()} aria-label="Close" className="ml-auto p-1.5 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <h2 className={`mt-3 text-[24px] font-bold leading-tight text-white ${done ? "line-through decoration-white/40" : ""}`}>{task.title}</h2>

          <div className="mt-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] tracking-[0.14em] text-white/50" style={{ fontFamily: SCENE_MONO }}>WHAT NEEDS DOING</span>
              {isOwner && !editing && (
                <button type="button" onClick={() => setEditing(true)} className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-white/60 hover:text-white">
                  <Pencil className="w-3.5 h-3.5" /> {task.details ? "Edit" : "Add details"}
                </button>
              )}
            </div>
            {editing ? (
              <div className="mt-2">
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={2000}
                  rows={5}
                  placeholder={"What needs to be taken care of, step by step.\ne.g. Confirm load-in time with the venue\nSend the stage plot"}
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-[15px] leading-snug placeholder:text-white/25 focus:outline-none focus:border-[#8CFF3D]/60"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => { setEditing(false); setDraft(task.details || ""); }} className="px-3 py-1.5 text-[13px] text-white/50 hover:text-white">Cancel</button>
                  <button type="button" disabled={busy === "details"} onClick={() => run("details", async () => { await onSaveDetails?.(draft); setEditing(false); })} className="px-3.5 py-1.5 rounded-lg text-[13px] font-bold bg-[#8CFF3D] text-[#0d0d0d] disabled:opacity-50">{busy === "details" ? "Saving..." : "Save"}</button>
                </div>
              </div>
            ) : task.details ? (
              <p className="mt-1.5 text-[15.5px] leading-relaxed text-white/85 whitespace-pre-line">{task.details}</p>
            ) : (
              <p className="mt-1.5 text-[14px] leading-snug text-white/40">{isOwner ? "No details yet. Add what needs to be taken care of so whoever claims it knows the steps." : "The event owner hasn't added details yet. The title is the whole job for now."}</p>
            )}
          </div>

          <div className="mt-4 bg-[#0d0d0d] border border-[#1f1f1f] rounded-[10px] divide-y divide-[#1c1c1c]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-3 px-3.5 py-2.5">
                <span className="w-[74px] shrink-0 text-[10.5px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{k}</span>
                <span className="text-[14.5px] text-white/85 min-w-0">{v}</span>
              </div>
            ))}
          </div>

          {err && <p className="mt-3 text-[13px] text-red-400">{err}</p>}
          {!done && !task.claimed_by && !canWork && (
            <p className="mt-3 text-[13px] leading-snug text-white/45">{signedIn ? `Only people on the ${label || "profile"} can claim this task.` : "Sign in to claim this task."}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => !busy && onClose?.()} className={`${btn} flex-1 min-w-[110px] bg-[#1a1a1a] border border-[#2e2e2e] text-white/80 hover:text-white`}>
              <ArrowLeft className="w-4 h-4" /> BACK
            </button>
            {!done && !task.claimed_by && canWork && (
              <button type="button" disabled={!!busy} onClick={() => run("claim", () => onClaim?.())} className={`${btn} flex-[2] min-w-[150px] text-[#0d0d0d]`} style={{ background: color, boxShadow: `0 0 18px ${color}55` }}>
                {busy === "claim" ? "CLAIMING..." : "CLAIM TASK"}
              </button>
            )}
            {!done && mine && (
              <>
                <button type="button" disabled={!!busy} onClick={() => run("done", () => onDone?.())} className={`${btn} flex-[2] min-w-[150px] text-[#0d0d0d]`} style={{ background: G }}>
                  <Check className="w-4 h-4" strokeWidth={3} /> {busy === "done" ? "SAVING..." : "MARK DONE"}
                </button>
                {onGoToCurrent && (
                  <button type="button" disabled={!!busy} onClick={() => onGoToCurrent()} className={`${btn} w-full border text-[14px]`} style={{ color, borderColor: color + "66", background: color + "12" }}>
                    OPEN CURRENT TASKS
                  </button>
                )}
              </>
            )}
            {!done && takenByOther && (
              <span className={`${btn} flex-[2] min-w-[150px] border border-[#2a2a2a] text-white/50 font-semibold`}>Claimed by {holder}</span>
            )}
          </div>
          {!done && (mine || (takenByOther && isOwner)) && (
            <button type="button" disabled={!!busy} onClick={() => run("release", () => onRelease?.())} className="mt-3 text-[13px] text-white/45 hover:text-white underline underline-offset-2 disabled:opacity-50">
              {busy === "release" ? "Letting go..." : mine ? "Let go of this task" : `Release ${holder}'s claim`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
