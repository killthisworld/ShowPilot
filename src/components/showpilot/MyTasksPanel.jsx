import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronRight, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { localISO, addDaysISO } from "@/lib/needsMe";
import { patchNeedsMe } from "@/hooks/useNeedsMe";

// Shared copy of the tech console's My tasks panel (job 144), used by the
// company desktop Home. `top` is the height of the page's top bar.
// My tasks: every open task in your sections across all your events (the
// same list that feeds the strips' task counts), grouped by when it's due.
// Tick one off right here, or click it to open that event's task page.
export default function MyTasksPanel({ tasks, onClose, top = 68 }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const today = localISO();
  const weekEnd = addDaysISO(6);
  const groups = [
    { key: "now", label: "OVERDUE / TODAY", color: "#FF6A00", items: tasks.filter((t) => t.due_date && t.due_date <= today) },
    { key: "week", label: "THIS WEEK", color: "#60A5FA", items: tasks.filter((t) => t.due_date && t.due_date > today && t.due_date <= weekEnd) },
    { key: "later", label: "LATER", color: "#a3a3a3", items: tasks.filter((t) => !t.due_date || t.due_date > weekEnd) },
  ];
  const dueLabel = (t) => {
    if (!t.due_date) return "NO DUE DATE";
    if (t.due_date === today) return "TODAY";
    const d = new Date(t.due_date + "T00:00:00");
    const txt = d.toLocaleDateString("en-US", t.due_date <= weekEnd ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric" }).toUpperCase();
    return t.due_date < today ? `WAS DUE ${txt}` : txt;
  };
  const done = async (t) => {
    setBusy(t.id); setErr("");
    const { error } = await supabase.rpc("set_gig_task_status", { p_token: t.share_token, p_task_id: t.id, p_done: true });
    if (error) setErr("Couldn't mark that done. Try again.");
    else patchNeedsMe((d) => ({ ...d, tasks: (d.tasks || []).filter((x) => x.id !== t.id) }));
    setBusy(null);
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 left-[84px] z-[60] bg-black/55" style={{ top }} onClick={onClose} aria-hidden="true" />
      <aside aria-label="My tasks" className="fixed right-0 bottom-0 z-[61] w-[440px] max-w-[90vw] flex flex-col bg-[#121212] border-l border-[#262626]" style={{ top, boxShadow: "-18px 0 40px rgba(0,0,0,0.55)" }}>
        <div className="flex items-center gap-2.5 px-[18px] pt-4 pb-2.5 shrink-0">
          <h2 className="text-[24px] font-bold" style={{ fontFamily: SCENE_FONT }}>My tasks</h2>
          <span className="text-[11px] text-white/55" style={{ fontFamily: SCENE_MONO }}>{tasks.length} OPEN</span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto w-8 h-8 rounded-lg border border-[#333] flex items-center justify-center text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        {err && <p className="mx-[18px] mb-2 text-[13px] text-red-400">{err}</p>}
        <div className="flex-1 min-h-0 overflow-y-auto px-[18px] pb-5 flex flex-col gap-4" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
          {tasks.length === 0 && <p className="text-white/45 text-[15px] pt-8 text-center">Nothing on your list.</p>}
          {groups.filter((g) => g.items.length).map((g) => (
            <section key={g.key} className="flex flex-col gap-1.5">
              <span className="text-[11px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: g.color }}>{g.label} · {g.items.length}</span>
              {g.items.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5 px-3 py-2.5 rounded-[9px] bg-[#181818] border border-[#262626] hover:border-[#3a3a3a]" style={{ borderLeft: `3px solid ${g.color}` }}>
                  <button type="button" onClick={() => done(t)} disabled={busy === t.id} aria-label={`Mark "${t.title}" done`} title="Done" className="w-[22px] h-[22px] mt-px shrink-0 rounded-md flex items-center justify-center hover:brightness-125 disabled:opacity-50" style={{ border: `2px solid ${g.color}`, color: g.color }}>
                    {busy === t.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button type="button" onClick={() => navigate(`/gig/tasks?token=${t.share_token}`)} className="flex-1 min-w-0 text-left flex flex-col gap-[3px]">
                    <span className="text-[14px] font-semibold leading-snug">{t.title}</span>
                    <span className="text-[10.5px] text-white/60 truncate" style={{ fontFamily: SCENE_MONO }}>{(t.event_title || "Event").toUpperCase()} · {dueLabel(t)}</span>
                  </button>
                  <ChevronRight className="w-4 h-4 mt-1 shrink-0 text-white/35" />
                </div>
              ))}
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
