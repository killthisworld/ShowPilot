import React, { useState } from "react";
import { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import { savedOn } from "@/lib/namedTemplates";

// Named templates (job 434).
// TemplateChooser: the first screen of a web when there are templates to
// start from: each template (name, what's in it, when it was saved), then
// Start fresh.
//   items: [{ id, name, saved_at, line }]
export function TemplateChooser({ seed, icon: Icon, color, title, line, items, onPick, onFresh, onBack }) {
  return (
    <IntakeSent seed={seed} bare>
      {Icon && <Icon className="w-14 h-14 mx-auto mb-4" style={{ color }} />}
      <h2 className="text-[30px] font-bold mb-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{title}</h2>
      <p className="text-white/60 text-[15px] m-0">{line}</p>
      <div className="mt-6 flex flex-col gap-2.5 text-left">
        {items.map((t) => (
          <button key={t.id} type="button" onClick={() => onPick(t.id)} className="w-full min-h-[60px] rounded-[12px] px-4 py-2.5 flex flex-col items-start justify-center border-[1.5px]" style={{ borderColor: color, background: `${color}14` }}>
            <span className="text-[16px] font-bold" style={{ color }}>{t.name}</span>
            <span className="text-[12.5px] text-white/60">{[t.line, savedOn(t.saved_at) && `saved ${savedOn(t.saved_at)}`].filter(Boolean).join(" · ")}</span>
          </button>
        ))}
        <button type="button" onClick={onFresh} className="w-full min-h-[52px] rounded-[12px] border border-[#333] text-white font-bold text-[16px]">Start fresh</button>
        <button type="button" onClick={onBack} className="min-h-[44px] text-[14px] text-white/60">Back</button>
      </div>
    </IntakeSent>
  );
}

// SaveAsTemplate: under a web's Send button. A name and Save: an existing
// name updates that template, a new name makes a new one.
//   names: the template names there are now; current: the one in use.
export function SaveAsTemplate({ color, current = "", names = [], suggest = "", onSave, note = "" }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const val = name || current || suggest;
  const exists = names.some((n) => n.trim().toLowerCase() === val.trim().toLowerCase());
  const save = async () => {
    setBusy(true); setMsg("");
    try { setMsg(await onSave(val.trim())); setOpen(false); setName(""); }
    catch (e) { console.error(e); setMsg(e?.message && !/^[A-Z_]+/.test(e.message) ? e.message : "Couldn't save it. Try again."); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {note && !msg && <p className="m-0 text-center text-[12.5px] text-white/50">{note}</p>}
      {open ? (
        <div className="w-full flex flex-col gap-2 rounded-[12px] border border-[#2a2a2a] bg-[#111] p-3">
          <span className="text-[11px] tracking-[0.12em] text-white/55">TEMPLATE NAME</span>
          <div className="flex gap-2">
            <input autoFocus value={val} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) save(); }} placeholder="House, or the act and deal"
              className="flex-1 min-w-0 min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40" />
            <button type="button" disabled={busy || !val.trim()} onClick={save} className="shrink-0 min-h-[44px] px-4 rounded-lg font-bold text-[14px] disabled:opacity-50" style={{ background: color, color: "#0d0d0d" }}>{busy ? "Saving…" : exists ? "Update" : "Save"}</button>
          </div>
          <span className="text-[12px] text-white/50">{exists ? `Updates your "${val.trim()}" template.` : "Saves a new template. Use an existing name to update that one."}</span>
          <button type="button" onClick={() => setOpen(false)} className="self-start min-h-[36px] text-[13px] text-white/55">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => { setOpen(true); setMsg(""); }} className="min-h-[44px] text-[14px] font-semibold" style={{ color }}>
          {current ? `Save or update a template (now: ${current})` : "Save as a template"}
        </button>
      )}
      {msg && <p className="m-0 text-center text-[13px] text-white/70">{msg}</p>}
    </div>
  );
}
