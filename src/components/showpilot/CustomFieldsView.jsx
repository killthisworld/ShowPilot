import React, { useState } from "react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { fieldFilled, fieldText, newId } from "@/lib/templatePage";
import { uploadIconImage } from "@/lib/eventIcons";

// Fields a venue / manager added on their My Template page (job 297), as they
// show on an event: under a built-in page, or as a page of their own.
// Editable on the event by whoever can edit that profile; changes stay on
// this event (Save on the workspace keeps them).
const input = "w-full min-h-[44px] px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/30 outline-none focus:border-white/40";

function Value({ f, edit, onChange, color }) {
  const [busy, setBusy] = useState(false);
  if (!edit) {
    if (f.kind === "file" && f.value?.url) return <a href={f.value.url} target="_blank" rel="noreferrer" className="text-[15px] underline">{f.value.name || "Open file"}</a>;
    if (f.kind === "link" && f.value) return <a href={/^https?:/i.test(f.value) ? f.value : `https://${f.value}`} target="_blank" rel="noreferrer" className="text-[15px] underline break-all">{f.value}</a>;
    if (f.kind === "checklist") return <ul className="m-0 pl-5 text-[15px]">{(f.value || []).filter((i) => i?.text).map((i) => <li key={i.id || i.text}>{i.text}</li>)}</ul>;
    return <span className="text-[15px] whitespace-pre-wrap">{fieldText(f) || "—"}</span>;
  }
  if (f.kind === "yesno") {
    return (
      <div className="flex gap-2">
        {[[true, "Yes"], [false, "No"]].map(([v, t]) => (
          <button key={t} type="button" aria-pressed={f.value === v} onClick={() => onChange(f.value === v ? null : v)} className="flex-1 min-h-[44px] rounded-lg border text-[14px] font-semibold"
            style={f.value === v ? { borderColor: color, background: `${color}1f` } : { borderColor: "#2a2a2a", color: "rgba(255,255,255,0.7)" }}>{t}</button>
        ))}
      </div>
    );
  }
  if (f.kind === "checklist") {
    const list = Array.isArray(f.value) ? f.value : [];
    return (
      <div className="flex flex-col gap-1.5">
        {list.map((it, i) => <input key={it.id || i} aria-label={`${f.label} item ${i + 1}`} value={it.text || ""} onChange={(e) => onChange(list.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))} className={input} />)}
        <button type="button" onClick={() => onChange([...list, { id: newId(), text: "" }])} className="min-h-[40px] rounded-lg border border-dashed border-[#3a3a3a] text-[13.5px] font-semibold text-white/70">+ Add an item</button>
      </div>
    );
  }
  if (f.kind === "file") {
    return f.value?.url ? (
      <div className="flex items-center gap-2"><a href={f.value.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-[15px] underline">{f.value.name || "File"}</a><button type="button" onClick={() => onChange(null)} className="min-h-[40px] px-3 text-[13px] text-white/60">Remove</button></div>
    ) : (
      <label className="min-h-[44px] rounded-lg border border-dashed border-[#3a3a3a] flex items-center justify-center text-[14px] font-semibold text-white/70 cursor-pointer">
        {busy ? "Uploading…" : "Choose a photo or file"}
        <input type="file" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setBusy(true); try { onChange({ url: await uploadIconImage(file), name: file.name }); } catch (err) { console.error(err); } setBusy(false); }} />
      </label>
    );
  }
  const type = f.kind === "number" ? "number" : f.kind === "time" ? "time" : f.kind === "link" ? "url" : "text";
  return <input type={type} aria-label={f.label} value={f.value ?? ""} onChange={(e) => onChange(e.target.value)} className={input} />;
}

export default function CustomFieldsView({ fields = [], edit = false, color = "#60A5FA", onChange, heading = "" }) {
  const shown = edit ? fields : fields.filter(fieldFilled);
  if (!shown.length) return edit ? null : <p className="text-[14px] text-white/45 m-0">Nothing here yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {heading && <div className="text-[10.5px] tracking-[0.12em] text-white/55" style={{ fontFamily: SCENE_MONO }}>{heading}</div>}
      {shown.map((f) => (
        <div key={f.id} className="flex flex-col gap-1">
          <span className="text-[11px] tracking-[0.1em] text-white/55" style={{ fontFamily: SCENE_MONO }}>{String(f.label || "Field").toUpperCase()}</span>
          <Value f={f} edit={edit} color={color} onChange={(v) => onChange(fields.map((x) => (x.id === f.id ? { ...x, value: v } : x)))} />
        </div>
      ))}
    </div>
  );
}
