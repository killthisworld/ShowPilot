import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Lock, Printer, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { RECORD_KINDS, fmtDate, fmtDateTime, recordFileUrl } from "@/lib/eventBusiness";

// Renders a record snapshot ({ title, subtitle, sections }) - used for the
// live deal preview, the paperwork previews and filed records.
const txt = (v) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
// Snapshots are stored data; anything off-shape is shown as text, never trusted.
function cleanSections(snapshot) {
  const list = Array.isArray(snapshot?.sections) ? snapshot.sections : [];
  return list.filter((s) => s && typeof s === "object").map((s) => ({
    heading: txt(s.heading),
    rows: Array.isArray(s.rows) ? s.rows.map((r) => (Array.isArray(r) ? [txt(r[0]), txt(r[1])] : ["", txt(r)])) : [],
    list: Array.isArray(s.list) ? s.list.map(txt) : [],
    text: txt(s.text),
  }));
}

export function SnapshotView({ snapshot, dense = false }) {
  const sections = cleanSections(snapshot);
  if (!sections.length) return <p className="text-[14px] text-white/40">Nothing filled in yet.</p>;
  return (
    <div className={`flex flex-col ${dense ? "gap-3" : "gap-4"}`}>
      {sections.map((s, i) => (
        <section key={i} className="flex flex-col gap-1.5">
          <div className="text-[11px] tracking-[0.12em] text-white/50" style={{ fontFamily: SCENE_MONO }}>{String(s.heading || "").toUpperCase()}</div>
          {s.rows && s.rows.length > 0 && (
            <div className="rounded-[10px] border border-[#242424] divide-y divide-[#1f1f1f] overflow-hidden">
              {s.rows.map(([k, v], j) => (
                <div key={j} className="grid grid-cols-[minmax(110px,38%)_minmax(0,1fr)] gap-3 px-3 py-2 text-[15px] leading-snug">
                  <span className="text-white/55">{k}</span>
                  <span className="text-white break-words">{v}</span>
                </div>
              ))}
            </div>
          )}
          {s.list && s.list.length > 0 && (
            <ul className="flex flex-col gap-1 text-[15px] text-white/85">
              {s.list.map((x, j) => <li key={j} className="break-words">{/^Stage plot \d+: (https?:\/\/\S+)$/.test(x) ? <a className="underline text-white/80" href={x.split(": ")[1]} target="_blank" rel="noreferrer">{x.split(": ")[0]}</a> : x}</li>)}
            </ul>
          )}
          {s.text && <p className="text-[15px] leading-relaxed text-white/85 whitespace-pre-wrap">{s.text}</p>}
        </section>
      ))}
    </div>
  );
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Opens a clean printable page (print or save as PDF from the browser).
export function printRecord(record) {
  const snap = { ...(record.snapshot || {}), sections: cleanSections(record.snapshot) };
  const kind = RECORD_KINDS[record.kind]?.label || "Record";
  const meta = [
    `Version ${record.version || 1}`,
    record.filed_at ? `Filed ${fmtDateTime(record.filed_at)}${record.filed_by_name ? ` by ${record.filed_by_name}` : ""}` : "Not filed (preview)",
    record.party ? `With ${record.party}` : "",
    record.expires_on ? `Expires ${fmtDate(record.expires_on)}` : "",
    record.signed ? "Signed copy on file" : "",
  ].filter(Boolean).join(" · ");
  const body = (snap.sections || []).map((s) => `
    <h2>${esc(s.heading)}</h2>
    ${s.rows && s.rows.length ? `<table>${s.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}
    ${s.list && s.list.length ? `<ul>${s.list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${s.text ? `<p>${esc(s.text).replace(/\n/g, "<br>")}</p>` : ""}`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(record.title || kind)}</title>
  <style>
    body{font:14px/1.45 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;margin:40px;max-width:760px}
    h1{font-size:24px;margin:0 0 4px} .sub{color:#444;margin:0 0 4px} .meta{color:#666;font-size:12px;margin:0 0 20px}
    h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#555;margin:22px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
    table{border-collapse:collapse;width:100%} th{text-align:left;font-weight:600;width:36%;padding:5px 8px 5px 0;vertical-align:top;color:#333} td{padding:5px 0;vertical-align:top}
    tr+tr th,tr+tr td{border-top:1px solid #eee} ul{margin:0;padding-left:18px} p{margin:0}
    .sign{margin-top:44px;display:flex;gap:40px} .sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:12px;color:#444}
    @media print{body{margin:18mm}}
  </style></head><body>
  <h1>${esc(record.title || snap.title || kind)}</h1>
  <p class="sub">${esc(snap.subtitle || [record.event_name, fmtDate(record.event_date), record.venue_name].filter(Boolean).join(" · "))}</p>
  <p class="meta">${esc(meta)}</p>
  ${body}
  ${record.kind === "agreement" ? `<div class="sign"><div>Venue signature &amp; date</div><div>Artist / manager signature &amp; date</div></div>` : ""}
  <script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export function OpenFileButton({ record, className = "", children }) {
  const [busy, setBusy] = useState(false);
  if (!record?.file_path) return null;
  const open = async () => {
    setBusy(true);
    // Open the tab first (popup blockers), then point it at the signed link.
    const w = window.open("", "_blank");
    try {
      const url = await recordFileUrl(record.file_path);
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) {
      console.error(e);
      w?.close();
    }
    setBusy(false);
  };
  return (
    <button type="button" onClick={open} disabled={busy} className={className}>
      {children || <><FileText className="w-4 h-4" /> {busy ? "OPENING..." : (record.file_name || "OPEN FILE")}</>}
    </button>
  );
}

// A filed record in a centered box: what it says, who filed it and when, the file.
export function RecordModal({ record, onClose, versions = [] }) {
  const [shown, setShown] = useState(record);
  useEffect(() => setShown(record), [record]);
  useEffect(() => {
    if (!record) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [record, onClose]);
  if (!record || !shown) return null;
  const kind = RECORD_KINDS[shown.kind]?.label || "Record";
  const hasSnap = cleanSections(shown.snapshot).length > 0;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ fontFamily: SCENE_FONT }} role="dialog" aria-modal="true" aria-label={shown.title || kind}>
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-[720px] max-h-[90vh] flex flex-col bg-[#0d0d0d] text-white border border-[#2a2a2a] rounded-[18px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-[#1c1c1c]">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] tracking-[0.12em] text-white/50" style={{ fontFamily: SCENE_MONO }}>{kind.toUpperCase()} · VERSION {shown.version || 1}</div>
              <h2 className="mt-1 text-[24px] font-bold leading-tight">{shown.title || kind}</h2>
              <p className="mt-1 text-[14px] text-white/55">{[shown.event_name, fmtDate(shown.event_date), shown.venue_name].filter(Boolean).join(" · ")}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/55" style={{ fontFamily: SCENE_MONO }}>
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> FILED {fmtDateTime(shown.filed_at).toUpperCase()}{shown.filed_by_name ? ` · ${shown.filed_by_name.toUpperCase()}` : ""}</span>
            {shown.party && <span>WITH {shown.party.toUpperCase()}</span>}
            {shown.expires_on && <span>EXPIRES {fmtDate(shown.expires_on).toUpperCase()}</span>}
            {shown.signed && <span className="text-[#8CFF3D]">SIGNED COPY</span>}
          </div>
          {versions.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {versions.map((v) => (
                <button key={v.id} type="button" onClick={() => setShown(v)} className="px-2 py-1 rounded-md text-[12px] font-bold" style={v.id === shown.id ? { background: "#fff", color: "#0d0d0d" } : { border: "1px solid #2a2a2a", color: "rgba(255,255,255,0.65)" }}>
                  V{v.version} · {fmtDate(v.filed_at)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {shown.note && <p className="text-[15px] text-white/80 bg-[#141414] border border-[#232323] rounded-[10px] px-3 py-2">{shown.note}</p>}
          {hasSnap ? <SnapshotView snapshot={shown.snapshot} /> : !shown.file_path && <p className="text-[14px] text-white/40">This record is a file only.</p>}
        </div>
        <div className="px-5 py-3 border-t border-[#1c1c1c] flex flex-wrap gap-2">
          <OpenFileButton record={shown} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-[10px] text-[14px] font-bold tracking-[0.04em] bg-[#111] border border-[#2a2a2a] text-white/85 hover:text-white" />
          {hasSnap && (
            <button type="button" onClick={() => printRecord(shown)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-[10px] text-[14px] font-bold tracking-[0.04em] bg-[#111] border border-[#2a2a2a] text-white/85 hover:text-white">
              <Printer className="w-4 h-4" /> PRINT / SAVE PDF
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
