import React, { useEffect, useState } from "react";
import { ChevronDown, Plus, Trash2, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

// "Additional services" in Settings > Customize (job 265), for audio
// engineers: their own services (e.g. "Video recording", "Livestream"), each
// asked as a Yes / No on intake links that include additional services, after
// the built-in multi-track question. Saved to user_preferences.extra_services
// ([{ id, label, question }]) with Save.
const newId = () => Math.random().toString(36).slice(2, 10);
export const serviceQuestion = (s) => (s?.question || "").trim() || `Interested in ${String(s?.label || "").trim().toLowerCase()}?`;

export default function ExtraServicesSettings({ preferences, onSaved }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(preferences?.extra_services || []);
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  useEffect(() => { setList(preferences?.extra_services || []); }, [preferences?.extra_services]);
  const dirty = JSON.stringify(list) !== JSON.stringify(preferences?.extra_services || []);

  const upd = (i, k, v) => { setList((l) => l.map((s, j) => (j === i ? { ...s, [k]: v } : s))); setState("idle"); };
  const add = () => { setList((l) => [...l, { id: newId(), label: "", question: "" }]); setState("idle"); };
  const remove = (i) => { setList((l) => l.filter((_, j) => j !== i)); setState("idle"); };
  const save = async () => {
    setState("saving");
    const clean = list.map((s) => ({ id: s.id || newId(), label: String(s.label || "").trim().slice(0, 80), question: String(s.question || "").trim().slice(0, 200) })).filter((s) => s.label).slice(0, 20);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase.from("user_preferences").upsert({ user_id: user.id, extra_services: clean }, { onConflict: "user_id" });
      if (error) throw error;
      setList(clean);
      setState("saved");
      onSaved?.();
    } catch (e) {
      console.error(e);
      setState("error");
    }
  };

  const inputCls = "w-full min-h-[40px] rounded-lg bg-[#0b0b0b] border border-[#262626] px-2.5 text-[14px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30";
  return (
    <div className="mb-4 rounded-lg border border-[#1f1f1f] bg-[#111]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
        <span className="text-[12px] font-semibold tracking-[0.1em] text-white/80" style={{ fontFamily: SCENE_MONO }}>ADDITIONAL SERVICES</span>
        <span className="ml-auto text-[10px] tracking-[0.08em] text-white/40" style={{ fontFamily: SCENE_MONO }}>{1 + (preferences?.extra_services || []).length}</span>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <p className="text-white/40 text-[11px] leading-snug">Asked as Yes / No on intake links that include additional services.</p>
          <div className="rounded-lg border border-[#1f1f1f] px-2.5 py-2 flex items-center gap-2">
            <span className="flex-1 text-[14px] text-white">Multi-track recording</span>
            <span className="text-[9px] tracking-[0.1em] text-white/35" style={{ fontFamily: SCENE_MONO }}>BUILT IN</span>
          </div>
          {list.map((s, i) => (
            <div key={s.id || i} className="rounded-lg border border-[#1f1f1f] p-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <input value={s.label || ""} onChange={(e) => upd(i, "label", e.target.value)} placeholder="Service, e.g. Video recording" aria-label="Service name" maxLength={80} className={inputCls} />
                <button type="button" onClick={() => remove(i)} aria-label={`Remove ${s.label || "service"}`} className="w-10 h-10 shrink-0 flex items-center justify-center text-white/35 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
              <input value={s.question || ""} onChange={(e) => upd(i, "question", e.target.value)} placeholder={s.label ? serviceQuestion(s) : "Question they see (optional)"} aria-label="Question" maxLength={200} className={`${inputCls} text-[13px]`} />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button type="button" onClick={add} disabled={list.length >= 20} className="min-h-[40px] px-3 rounded-lg border border-dashed border-[#333] text-white/70 text-[13px] font-semibold flex items-center gap-1.5 hover:border-white/40 disabled:opacity-40"><Plus className="w-4 h-4" />Add a service</button>
            {(dirty || state === "saved") && (
              <button type="button" onClick={save} disabled={state === "saving" || !dirty} className="ml-auto min-h-[40px] px-4 rounded-lg font-semibold text-[13px] flex items-center gap-1.5 disabled:opacity-70" style={{ background: "#8CFF3D", color: "#0d0d0d" }}>
                {state === "saved" && !dirty ? <><Check className="w-4 h-4" />Saved</> : state === "saving" ? "Saving…" : "Save"}
              </button>
            )}
          </div>
          {state === "error" && <p className="text-[12px] text-[#FF6B6B]">Couldn't save. Try again.</p>}
        </div>
      )}
    </div>
  );
}
