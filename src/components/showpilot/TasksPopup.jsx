import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardList, Plus, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// The event's tasks in a box, opened from the clipboard icon in the page header
// (tech phones). Anyone with the event can read them; the owner adds them; the
// person a task is for claims it and marks it done. The database decides who's
// allowed, this just shows what it says.
const SECTIONS = [
  { value: "venue", label: "Venue", color: "#60A5FA" },
  { value: "manager", label: "Manager / Artist", color: "#EF4444" },
  { value: "engineer", label: "Audio / Lighting", color: "#8CFF3D" },
];
const sectionOf = (v) => SECTIONS.find((s) => s.value === v) || { label: v, color: "#9A9A9A" };

// The clipboard button that opens the box, with the open-task count.
export function TasksButton({ token, className = "" }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(null);
  useEffect(() => {
    if (!token) return;
    supabase.rpc("get_shared_gig", { p_token: token }).then(({ data }) => {
      if (data) setCount((data.tasks || []).filter((t) => t.status !== "done").length);
    });
  }, [token, open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Tasks${count ? `, ${count} open` : ""}`}
        className={`relative shrink-0 w-10 h-10 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] flex items-center justify-center text-white/75 hover:text-white ${className}`}>
        <ClipboardList className="w-[18px] h-[18px]" />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-[#0d0d0d]" style={{ background: "#FF6A00" }}>{count}</span>
        )}
      </button>
      {open && <TasksPopup token={token} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function TasksPopup({ token, onClose }) {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [userId, setUserId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("venue");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    const [g, p, u] = await Promise.all([
      supabase.rpc("get_shared_gig", { p_token: token }),
      supabase.rpc("get_gig_section_permissions", { p_token: token }),
      supabase.auth.getUser(),
    ]);
    setTasks(g.data?.tasks || []);
    setIsOwner(!!p.data?.is_owner);
    setUserId(u.data?.user?.id || null);
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (id, fn, rpc, args) => {
    setBusy(id); setError("");
    const { error: e } = await supabase.rpc(rpc, { p_token: token, p_task_id: id, ...args });
    if (e) setError(e.message?.replace(/^.*?: /, "") || "That didn't go through.");
    await load();
    setBusy(null);
  };
  const add = async () => {
    if (!title.trim()) return;
    setBusy("add"); setError("");
    const { error: e } = await supabase.rpc("add_gig_task", { p_token: token, p_section: section, p_title: title.trim() });
    if (e) setError("Couldn't add that task.");
    else { setTitle(""); setAdding(false); await load(); }
    setBusy(null);
  };

  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const list = showDone ? done : open;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/75" onClick={onClose} role="dialog" aria-modal="true" aria-label="Tasks" style={{ fontFamily: SCENE_FONT }}>
      <div className="w-full max-w-[420px] max-h-[88vh] flex flex-col bg-[#0d0d0d] border border-[#2a2a2a] rounded-[18px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <div className="text-[11.5px] tracking-[0.14em] uppercase text-[#FF6A00]" style={{ fontFamily: SCENE_MONO }}>This event</div>
            <div className="mt-1 text-[26px] leading-none uppercase text-white" style={{ fontWeight: 700, letterSpacing: "0.02em" }}>Tasks</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 rounded-full border border-[#2a2a2a] flex items-center justify-center text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-1.5 px-5 pb-2">
          {[{ id: false, label: `OPEN · ${open.length}` }, { id: true, label: `DONE · ${done.length}` }].map((t) => (
            <button key={String(t.id)} type="button" onClick={() => setShowDone(t.id)} className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold tracking-[0.1em]"
              style={{ fontFamily: SCENE_MONO, color: showDone === t.id ? "#0d0d0d" : "rgba(255,255,255,0.65)", background: showDone === t.id ? "#fff" : "#141414", border: `1px solid ${showDone === t.id ? "#fff" : "#2a2a2a"}` }}>{t.label}</button>
          ))}
        </div>

        <div className="px-5 pb-5 pt-1 overflow-y-auto space-y-2">
          {error && <p className="text-[13px] text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</p>}
          {loading && <p className="py-6 text-center text-[11.5px] tracking-[0.14em] uppercase text-white/40" style={{ fontFamily: SCENE_MONO }}>Loading…</p>}
          {!loading && list.length === 0 && (
            <div className="py-6 text-center">
              <div className="mx-auto w-11 h-11 rounded-full border border-[#2a2a2a] flex items-center justify-center text-[#FF6A00]"><ClipboardList className="w-5 h-5" /></div>
              <p className="mt-3 text-white text-sm font-semibold">{showDone ? "Nothing finished yet" : "Nothing to do right now"}</p>
            </div>
          )}
          {!loading && list.map((t) => {
            const sec = sectionOf(t.section);
            const mine = userId && t.claimed_by === userId;
            const expanded = openId === t.id;
            return (
              <div key={t.id} className="rounded-xl border border-[#2a2a2a] bg-[#141414]" style={{ borderLeft: `3px solid ${sec.color}` }}>
                <button type="button" onClick={() => setOpenId(expanded ? null : t.id)} className="w-full text-left px-3.5 py-3">
                  <span className="block text-white text-[15px] font-semibold leading-snug">{t.title}</span>
                  <span className="block mt-1 text-[11px] tracking-[0.08em] uppercase" style={{ fontFamily: SCENE_MONO, color: sec.color }}>
                    {sec.label}{t.claimed_by ? ` · ${mine ? "YOURS" : `CLAIMED${t.claimed_by_name ? ` BY ${t.claimed_by_name}` : ""}`}` : ""}
                  </span>
                </button>
                {expanded && (
                  <div className="px-3.5 pb-3 space-y-2.5">
                    {t.details && <p className="text-[14px] text-white/65 leading-snug whitespace-pre-wrap">{t.details}</p>}
                    {t.status !== "done" ? (
                      <div className="flex gap-2">
                        {!t.claimed_by && (
                          <button type="button" disabled={busy === t.id} onClick={() => run(t.id, null, "claim_gig_task", { p_claim: true })} className="flex-1 py-2 rounded-lg text-[13px] font-bold border border-[#2a2a2a] text-white/85 disabled:opacity-60">Claim</button>
                        )}
                        {mine && (
                          <button type="button" disabled={busy === t.id} onClick={() => run(t.id, null, "claim_gig_task", { p_claim: false })} className="flex-1 py-2 rounded-lg text-[13px] font-bold border border-[#2a2a2a] text-white/65 disabled:opacity-60">Let go</button>
                        )}
                        <button type="button" disabled={busy === t.id} onClick={() => run(t.id, null, "set_gig_task_status", { p_done: true })} className="flex-1 py-2 rounded-lg text-[13px] font-bold text-[#0d0d0d] disabled:opacity-60 flex items-center justify-center gap-1" style={{ background: "#8CFF3D" }}><Check className="w-4 h-4" /> Done</button>
                      </div>
                    ) : (
                      <button type="button" disabled={busy === t.id} onClick={() => run(t.id, null, "set_gig_task_status", { p_done: false })} className="w-full py-2 rounded-lg text-[13px] font-bold border border-[#2a2a2a] text-white/70 disabled:opacity-60">Reopen</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && isOwner && (adding ? (
            <div className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-3 space-y-2.5">
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="What needs doing?" className="w-full h-10 bg-[#0d0d0d] border border-[#262626] rounded-lg px-3 text-white text-[15px] placeholder:text-white/30 outline-none focus:border-white/30" />
              <div className="flex flex-wrap gap-1.5">
                {SECTIONS.map((s) => (
                  <button key={s.value} type="button" onClick={() => setSection(s.value)} className="text-[11px] font-semibold px-2.5 py-1 rounded-full border"
                    style={section === s.value ? { color: s.color, background: s.color + "22", borderColor: s.color + "66" } : { color: "rgba(255,255,255,0.45)", borderColor: "#262626" }}>{s.label}</button>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setAdding(false); setTitle(""); }} className="px-3 py-1.5 text-[13px] text-white/50">Cancel</button>
                <button type="button" onClick={add} disabled={!title.trim() || busy === "add"} className="px-4 py-1.5 rounded-lg text-[13px] font-bold text-[#0d0d0d] disabled:opacity-50" style={{ background: "#8CFF3D" }}>{busy === "add" ? "Adding..." : "Add"}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-[#2a2a2a] text-[13px] font-semibold text-white/60 hover:text-white"><Plus className="w-4 h-4" /> Add a task</button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
