import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bookmark, Check, FileText, Paperclip, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

const G = "#8CFF3D";
const AMBER = "#FF6A00";
const MAX_FILE_MB = 25;

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
const dueLabel = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "");
const kb = (n) => (!n ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const newId = () => Math.random().toString(36).slice(2, 10);

// What a task can ask for (gig_tasks.kind); the event owner picks it.
export const TASK_KINDS = [
  ["plain", "Just do it", "Mark it done, with an optional note"],
  ["upload", "Upload files", "Stage plot, rider, W-9, contract..."],
  ["answer", "Answer questions", "Times, yes / no, numbers"],
  ["checklist", "Checklist", "Items to check off"],
];
const QUESTION_TYPES = [["text", "Text"], ["yesno", "Yes / No"], ["time", "Time"], ["date", "Date"], ["number", "Number"]];

// Who holds a task, in words, from the viewer's point of view.
export function claimText(task, userId) {
  if (!task?.claimed_by) return null;
  if (userId && task.claimed_by === userId) return "You";
  return task.claimed_by_name || "Someone";
}

// Messages from the task functions worth showing as they are.
const SHOWN_ERRORS = ["Already claimed", "already done", "permission", "Add at least one", "Answer every question", "Check off every item", "Only the event owner"];

// The window a bulletin board task opens: what needs doing, which profile
// it's for, who added it, the due date and who has it, plus a "Do it here"
// area that depends on the task's kind (upload files / answer questions /
// checklist / just a note) with Submit & mark done, and Claim & save for
// later (claimed tasks wait in My tasks). With `shareToken` it loads the
// task's full details (kind, what it asks, what was handed in) and does the
// submit / setup itself, passing the updated task to `onChanged`. Used by the
// event boards, the profile web and Needs me.
export default function TaskSheet({
  task: taskIn, color = G, label, userId, isOwner = false, canWork = false, signedIn = true,
  shareToken = null, onChanged,
  onClose, onClaim, onRelease, onDone, onSaveDetails, onSaveDue, onGoToCurrent,
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [full, setFull] = useState(null); // get_gig_task result
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(taskIn?.details || "");
  const [dueEditing, setDueEditing] = useState(false);
  const [dueDraft, setDueDraft] = useState(taskIn?.due_date || "");
  const [files, setFiles] = useState([]); // [{ key, name, size, type, url?, uploading?, error? }]
  const [answers, setAnswers] = useState({});
  const [checks, setChecks] = useState({});
  const [note, setNote] = useState("");
  const [setup, setSetup] = useState(null); // owner editing: { kind, questions, items }
  const [toast, setToast] = useState("");
  const fileRef = useRef(null);
  const toastTimer = useRef(null);

  const taskId = taskIn?.id;
  useEffect(() => {
    setDraft(taskIn?.details || ""); setEditing(false); setErr(""); setDueEditing(false); setDueDraft(taskIn?.due_date || "");
    setFiles([]); setAnswers({}); setChecks({}); setNote(""); setSetup(null); setFull(null); setToast("");
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!shareToken || !taskId) return undefined;
    let live = true;
    supabase.rpc("get_gig_task", { p_token: shareToken, p_task_id: taskId }).then(({ data, error }) => {
      if (live && !error && data) setFull(data);
    });
    return () => { live = false; };
  }, [shareToken, taskId]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  if (!taskIn) return null;
  // The board's copy and the full details: whichever changed last wins
  // (a claim / due date set from the board after this window loaded, or a
  // submit / setup done in here).
  const fullNewer = full && (!taskIn.updated_at || !full.updated_at || full.updated_at >= taskIn.updated_at);
  const task = !full ? taskIn : fullNewer ? { ...taskIn, ...full } : { ...full, ...taskIn };
  const kind = task.kind || "plain";
  const spec = task.spec || {};
  const questions = Array.isArray(spec.questions) ? spec.questions : [];
  const items = Array.isArray(spec.items) ? spec.items : [];
  const done = task.status === "done";
  const mine = !!userId && task.claimed_by === userId;
  const holder = claimText(task, userId);
  const takenByOther = !!task.claimed_by && !mine;
  const canEditDue = isOwner && !done && !!onSaveDue;
  const canSubmit = !!shareToken && canWork && !done && (!takenByOther || isOwner);
  const submission = full?.submission || null;

  const flash = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2600); };
  const apply = (data) => {
    if (!data) return;
    setFull((f) => ({ ...(f || {}), ...data }));
    onChanged?.(data);
  };
  const run = async (what, fn) => {
    if (busy) return;
    setBusy(what);
    setErr("");
    try { await fn(); } catch (e) {
      const m = String(e?.message || "");
      setErr(SHOWN_ERRORS.some((s) => m.includes(s)) ? m : "Couldn't save that. Try again.");
    }
    setBusy("");
  };

  // ---- Do it here ----
  const addFiles = async (list) => {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    const rows = picked.map((f) => ({ key: newId(), name: f.name, size: f.size, type: f.type, file: f, uploading: true }));
    setFiles((cur) => [...cur, ...rows]);
    for (const r of rows) {
      let patch;
      if (r.size > MAX_FILE_MB * 1024 * 1024) {
        patch = { uploading: false, error: `Over ${MAX_FILE_MB} MB` };
      } else {
        try {
          const safe = r.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
          const path = `${userId || "anon"}/task-files/${task.id}/${Date.now()}_${safe}`;
          const { error } = await supabase.storage.from("input-files").upload(path, r.file, { contentType: r.type || undefined });
          if (error) throw error;
          patch = { uploading: false, url: supabase.storage.from("input-files").getPublicUrl(path).data.publicUrl };
        } catch (e) {
          console.error(e);
          patch = { uploading: false, error: "Upload failed" };
        }
      }
      setFiles((cur) => cur.map((x) => (x.key === r.key ? { ...x, ...patch, file: undefined } : x)));
    }
  };
  const readyFiles = files.filter((f) => f.url);
  const stillUploading = files.some((f) => f.uploading);
  const missing =
    kind === "upload" ? (readyFiles.length ? "" : "Add at least one file")
      : kind === "answer" ? (questions.some((q) => !String(answers[q.id] ?? "").trim()) ? "Answer every question" : "")
        : kind === "checklist" ? (items.some((i) => !checks[i.id]) ? "Check off every item" : "")
          : "";
  const submit = () => run("submit", async () => {
    const { data, error } = await supabase.rpc("submit_gig_task", {
      p_token: shareToken,
      p_task_id: task.id,
      p_submission: {
        files: readyFiles.map(({ name, url, size, type }) => ({ name, url, size, type })),
        answers, checks, note,
      },
    });
    if (error) throw error;
    // The submission comes back with who / when; show it right away.
    apply({ ...data, submitted_by_name: "You" });
    setFiles([]); setNote("");
    flash("Done. Handed in.");
  });
  const claimAndSave = () => run("claim", async () => {
    await onClaim?.();
    flash("Claimed. Saved to My tasks.");
  });

  // ---- Owner: what the task asks for ----
  const openSetup = () => setSetup({
    kind,
    questions: questions.length ? questions.map((q) => ({ ...q })) : [{ id: newId(), label: "", type: "text" }],
    items: items.length ? items.map((i) => ({ ...i })) : [{ id: newId(), text: "" }],
  });
  const saveSetup = () => run("setup", async () => {
    const s = setup;
    const p_spec = s.kind === "answer" ? { questions: s.questions } : s.kind === "checklist" ? { items: s.items } : {};
    const { data, error } = await supabase.rpc("set_gig_task_setup", { p_token: shareToken, p_task_id: task.id, p_kind: s.kind, p_spec });
    if (error) throw error;
    apply(data);
    setSetup(null);
  });

  const statusChip = done ? { text: "DONE", c: G } : task.claimed_by ? { text: mine ? "YOURS · SAVED" : "CLAIMED", c: color } : { text: "OPEN", c: AMBER };
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
      ? ["DONE", [shortDate(task.completed_at), holder && `by ${holder}`].filter(Boolean).join(" · ") || "Done"]
      : ["CLAIMED", holder ? `${holder} · since ${shortDate(task.claimed_at)}` : "Nobody yet"],
  ].filter(Boolean);

  const btn = "h-11 px-4 rounded-[10px] text-[15px] font-bold tracking-[0.06em] flex items-center justify-center gap-1.5 disabled:opacity-50";
  const mono = { fontFamily: SCENE_MONO };
  const inputCls = "w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 text-white text-[15px] placeholder:text-white/30 focus:outline-none";
  const kindName = (TASK_KINDS.find(([k]) => k === kind) || TASK_KINDS[0])[1];
  const questionLabel = (id) => questions.find((q) => q.id === id)?.label || id;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4" style={{ fontFamily: SCENE_FONT }} role="dialog" aria-modal="true" aria-label={`Task: ${task.title}`}>
      <div className="absolute inset-0 bg-black/70" onClick={() => !busy && onClose?.()} />
      <div className="relative w-full sm:max-w-[540px] max-h-[92vh] overflow-y-auto bg-[#121212] border border-[#2a2a2a] rounded-t-[18px] sm:rounded-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="h-1.5 w-full" style={{ background: color }} />
        <div className="px-5 pt-4 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold tracking-[0.1em] px-2 py-1 rounded uppercase" style={{ ...mono, color, background: color + "1f" }}>{label || task.section}</span>
            <span className="text-[11px] font-bold tracking-[0.1em] px-2 py-1 rounded" style={{ ...mono, color: statusChip.c, background: statusChip.c + "1a", border: `1px solid ${statusChip.c}55` }}>{statusChip.text}</span>
            {kind !== "plain" && <span className="text-[11px] tracking-[0.1em] px-2 py-1 rounded text-white/60 bg-white/[0.06] uppercase" style={mono}>{kindName}</span>}
            <button type="button" onClick={() => !busy && onClose?.()} aria-label="Close" className="ml-auto p-1.5 text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <h2 className={`mt-3 text-[24px] font-bold leading-tight text-white ${done ? "line-through decoration-white/40" : ""}`}>{task.title}</h2>

          <div className="mt-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] tracking-[0.14em] text-white/50" style={mono}>WHAT NEEDS DOING</span>
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

          {/* Owner: what the task asks for. */}
          {isOwner && shareToken && !done && (
            setup ? (
              <div className="mt-4 bg-[#0d0d0d] border border-[#2a2a2a] rounded-[12px] p-3.5 space-y-3">
                <span className="text-[11px] tracking-[0.14em] text-white/50" style={mono}>WHAT THIS TASK ASKS FOR</span>
                <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Task type">
                  {TASK_KINDS.map(([k, name, hint]) => {
                    const on = setup.kind === k;
                    return (
                      <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setSetup((s) => ({ ...s, kind: k }))} className="text-left rounded-lg px-3 py-2 border min-h-[54px]" style={on ? { borderColor: color, background: color + "14" } : { borderColor: "#2a2a2a" }}>
                        <span className="block text-[14px] font-semibold" style={{ color: on ? color : "#e5e5e5" }}>{name}</span>
                        <span className="block text-[11.5px] text-white/45 leading-snug">{hint}</span>
                      </button>
                    );
                  })}
                </div>
                {setup.kind === "answer" && (
                  <div className="space-y-2">
                    {setup.questions.map((q, i) => (
                      <div key={q.id} className="flex gap-1.5">
                        <input value={q.label} onChange={(e) => setSetup((s) => ({ ...s, questions: s.questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} placeholder={`Question ${i + 1}, e.g. Load-in time`} aria-label={`Question ${i + 1}`} maxLength={200} className={`${inputCls} h-10 flex-1 min-w-0`} />
                        <select value={q.type} onChange={(e) => setSetup((s) => ({ ...s, questions: s.questions.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) }))} aria-label={`Answer type for question ${i + 1}`} className="h-10 bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-2 text-white text-[14px]">
                          {QUESTION_TYPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                        </select>
                        <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => setSetup((s) => ({ ...s, questions: s.questions.filter((_, j) => j !== i) }))} className="w-10 h-10 shrink-0 flex items-center justify-center text-white/40 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setSetup((s) => ({ ...s, questions: [...s.questions, { id: newId(), label: "", type: "text" }] }))} className="flex items-center gap-1 text-[13px] font-semibold" style={{ color }}><Plus className="w-4 h-4" /> Add a question</button>
                  </div>
                )}
                {setup.kind === "checklist" && (
                  <div className="space-y-2">
                    {setup.items.map((it, i) => (
                      <div key={it.id} className="flex gap-1.5">
                        <input value={it.text} onChange={(e) => setSetup((s) => ({ ...s, items: s.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} placeholder={`Item ${i + 1}, e.g. Read the power notes`} aria-label={`Item ${i + 1}`} maxLength={200} className={`${inputCls} h-10 flex-1 min-w-0`} />
                        <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => setSetup((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }))} className="w-10 h-10 shrink-0 flex items-center justify-center text-white/40 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setSetup((s) => ({ ...s, items: [...s.items, { id: newId(), text: "" }] }))} className="flex items-center gap-1 text-[13px] font-semibold" style={{ color }}><Plus className="w-4 h-4" /> Add an item</button>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setSetup(null)} className="px-3 py-1.5 text-[13px] text-white/50 hover:text-white">Cancel</button>
                  <button type="button" disabled={busy === "setup"} onClick={saveSetup} className="px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-[#0d0d0d] disabled:opacity-50" style={{ background: color }}>{busy === "setup" ? "Saving..." : "Save"}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={openSetup} className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-white/60 hover:text-white">
                <Pencil className="w-3.5 h-3.5" /> {kind === "plain" ? "Ask for files, answers or a checklist" : `Change what this task asks for (${kindName})`}
              </button>
            )
          )}

          <div className="mt-4 bg-[#0d0d0d] border border-[#1f1f1f] rounded-[10px] divide-y divide-[#1c1c1c]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-3 px-3.5 py-2.5">
                <span className="w-[74px] shrink-0 text-[10.5px] tracking-[0.12em] text-white/45" style={mono}>{k}</span>
                <span className="text-[14.5px] text-white/85 min-w-0">{v}</span>
              </div>
            ))}
          </div>

          {/* What was handed in. */}
          {submission && (
            <div className="mt-4 rounded-[12px] border p-3.5 space-y-2" style={{ borderColor: G + "55", background: G + "0d" }}>
              <span className="text-[11px] tracking-[0.14em]" style={{ ...mono, color: G }}>HANDED IN{full?.submitted_by_name ? ` BY ${String(full.submitted_by_name).toUpperCase()}` : ""}{submission.submitted_at ? ` · ${shortDate(submission.submitted_at).toUpperCase()}` : ""}</span>
              {(submission.files || []).map((f) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[14.5px] text-white hover:underline">
                  <FileText className="w-4 h-4 shrink-0 text-white/60" /> <span className="truncate">{f.name}</span> <span className="text-[11px] text-white/40" style={mono}>{kb(f.size)}</span>
                </a>
              ))}
              {Object.entries(submission.answers || {}).map(([id, v]) => (
                <div key={id} className="text-[14.5px]"><span className="text-white/55">{questionLabel(id)}: </span><span className="text-white">{v === "yes" ? "Yes" : v === "no" ? "No" : v}</span></div>
              ))}
              {items.length > 0 && Object.keys(submission.checks || {}).length > 0 && (
                <div className="text-[14px] text-white/70">{items.filter((i) => submission.checks?.[i.id]).length} of {items.length} checked</div>
              )}
              {submission.note && <p className="text-[14px] text-white/80 whitespace-pre-line">{submission.note}</p>}
            </div>
          )}
          {!submission && full?.has_submission && (
            <p className="mt-3 text-[13px] text-white/45">Handed in. Only people on the event can see what was sent.</p>
          )}

          {/* Do it here. */}
          {canSubmit && (
            <div className="mt-4 rounded-[14px] border p-3.5 space-y-3" style={{ borderColor: color + "66", background: "#161616" }}>
              <span className="text-[16px] font-bold tracking-[0.08em]" style={{ color }}>DO IT HERE</span>
              {kind === "upload" && (
                <>
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-[84px] rounded-[12px] border-[1.5px] border-dashed flex flex-col items-center justify-center gap-1 text-white" style={{ borderColor: color + "66", background: color + "12" }}>
                    <Upload className="w-5 h-5" style={{ color }} />
                    <span className="text-[14.5px] font-semibold">Add files</span>
                    <span className="text-[12px] text-white/50">From your phone or computer, or take a photo · up to {MAX_FILE_MB} MB</span>
                  </button>
                  {files.map((f) => (
                    <div key={f.key} className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] border border-[#2a2a2a] bg-[#121212]">
                      <Paperclip className="w-4 h-4 shrink-0 text-white/60" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold text-white truncate">{f.name}</span>
                        <span className="block text-[11px]" style={{ ...mono, color: f.error ? "#f87171" : "rgba(255,255,255,0.45)" }}>{f.error || (f.uploading ? "UPLOADING..." : `${kb(f.size)} · READY`)}</span>
                      </span>
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))} className="w-9 h-9 flex items-center justify-center text-white/45 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </>
              )}
              {kind === "answer" && questions.map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <label htmlFor={`q-${q.id}`} className="block text-[11px] tracking-[0.12em] text-white/55 uppercase" style={mono}>{q.label}</label>
                  {q.type === "yesno" ? (
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={q.label}>
                      {[["yes", "Yes"], ["no", "No"]].map(([v, n]) => {
                        const on = answers[q.id] === v;
                        return <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))} className="h-11 rounded-[10px] border text-[14px] font-semibold" style={on ? { borderColor: color, background: color + "1a", color } : { borderColor: "#2a2a2a", color: "rgba(255,255,255,0.7)" }}>{n}</button>;
                      })}
                    </div>
                  ) : (
                    <input id={`q-${q.id}`} type={q.type === "number" ? "number" : q.type === "date" ? "date" : q.type === "time" ? "time" : "text"} value={answers[q.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} maxLength={500} className={`${inputCls} h-11 [color-scheme:dark]`} />
                  )}
                </div>
              ))}
              {kind === "checklist" && items.map((it) => (
                <label key={it.id} className="flex items-center gap-3 min-h-[44px] text-[15px] text-white/90">
                  <input type="checkbox" checked={!!checks[it.id]} onChange={(e) => setChecks((c) => ({ ...c, [it.id]: e.target.checked }))} className="w-5 h-5 shrink-0" style={{ accentColor: color }} />
                  {it.text}
                </label>
              ))}
              <div className="space-y-1.5">
                <label htmlFor="task-note" className="block text-[11px] tracking-[0.12em] text-white/55" style={mono}>NOTE{kind === "plain" ? "" : " (OPTIONAL)"}</label>
                <textarea id="task-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder={kind === "plain" ? "Anything they should know (optional)" : "e.g. Drummer brings his own kick mic"} className={`${inputCls} py-2.5 resize-none`} />
              </div>
            </div>
          )}

          {err && <p className="mt-3 text-[13px] text-red-400">{err}</p>}
          {!done && !task.claimed_by && !canWork && (
            <p className="mt-3 text-[13px] leading-snug text-white/45">{signedIn ? `Only people on the ${label || "profile"} can do this task.` : "Sign in to do this task."}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {canSubmit ? (
              <button type="button" disabled={!!busy || stillUploading || !!missing} title={missing || undefined} onClick={submit} className={`${btn} w-full text-[#0d0d0d]`} style={{ background: color, boxShadow: `0 0 18px ${color}55` }}>
                <Check className="w-4 h-4" strokeWidth={3} /> {busy === "submit" ? "SENDING..." : stillUploading ? "UPLOADING..." : "SUBMIT & MARK DONE"}
              </button>
            ) : (!done && mine && (
              <button type="button" disabled={!!busy} onClick={() => run("done", () => onDone?.())} className={`${btn} w-full text-[#0d0d0d]`} style={{ background: G }}>
                <Check className="w-4 h-4" strokeWidth={3} /> {busy === "done" ? "SAVING..." : "MARK DONE"}
              </button>
            ))}
            {canSubmit && missing && !stillUploading && <p className="w-full -mt-1 text-[12.5px] text-white/45 text-center">{missing} to submit.</p>}
            {!done && !task.claimed_by && canWork && (
              <button type="button" disabled={!!busy} onClick={claimAndSave} className={`${btn} flex-[2] min-w-[180px] border text-white`} style={{ borderColor: "#3a3a3a", background: "transparent" }}>
                <Bookmark className="w-4 h-4" /> {busy === "claim" ? "CLAIMING..." : "CLAIM & SAVE FOR LATER"}
              </button>
            )}
            <button type="button" onClick={() => !busy && onClose?.()} className={`${btn} flex-1 min-w-[110px] bg-[#1a1a1a] border border-[#2e2e2e] text-white/80 hover:text-white`}>
              <ArrowLeft className="w-4 h-4" /> BACK
            </button>
            {!done && mine && onGoToCurrent && (
              <button type="button" disabled={!!busy} onClick={() => onGoToCurrent()} className={`${btn} w-full border text-[14px]`} style={{ color, borderColor: color + "66", background: color + "12" }}>
                OPEN MY TASKS
              </button>
            )}
            {!done && takenByOther && !isOwner && (
              <span className={`${btn} flex-[2] min-w-[150px] border border-[#2a2a2a] text-white/50 font-semibold`}>Claimed by {holder}</span>
            )}
          </div>
          {!done && (mine || (takenByOther && isOwner)) && (
            <button type="button" disabled={!!busy} onClick={() => run("release", () => onRelease?.())} className="mt-3 text-[13px] text-white/45 hover:text-white underline underline-offset-2 disabled:opacity-50">
              {busy === "release" ? "Letting go..." : mine ? "Let go of this task" : `Release ${holder}'s claim`}
            </button>
          )}
          {toast && <div role="status" className="mt-3 px-3 py-2.5 rounded-[10px] bg-[#1d1d1d] border border-[#333] text-[14px] text-white flex items-center gap-2"><Check className="w-4 h-4" style={{ color: G }} /> {toast}</div>}
        </div>
      </div>
    </div>
  );
}

