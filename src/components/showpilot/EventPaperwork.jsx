import React, { useRef, useState } from "react";
import { ChevronDown, FileText, Trash2, Upload } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { RecordModal } from "@/components/showpilot/RecordView";
import EventDeal from "@/components/showpilot/EventDeal";
import { DEAL_STATUS, fileRecord, deleteRecord, recordFileUrl, fmtDate } from "@/lib/eventBusiness";

// The event's paperwork (job 116): one simple section per kind of document,
// each with an upload button and its documents underneath. The deal lives
// here too (its terms open under the Deal section). The venue side, the
// manager / artist side and the event owner can upload; the venue side, the
// owner or whoever uploaded a document can delete it. Crew never see this.
const G = "#8CFF3D";
const AMBER = "#FF6A00";
const ACCEPT = "application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt";

export const PAPERWORK_SECTIONS = [
  { kind: "deal", label: "Deal" },
  { kind: "agreement", label: "Performance agreement" },
  { kind: "rider", label: "Rider" },
  { kind: "advance", label: "Advance" },
  { kind: "coi", label: "Insurance" },
  { kind: "other", label: "Other" },
];
const CORE = ["agreement", "rider", "advance", "coi"];

export function paperworkState(records = [], deal = null) {
  const n = CORE.filter((k) => records.some((r) => r.kind === k)).length;
  if (!records.length && !deal) return "empty";
  return n === CORE.length && deal?.status === "accepted" ? "done" : "partial";
}
export function paperworkSummary(records = [], deal = null) {
  const docs = records.length ? `${records.length} document${records.length === 1 ? "" : "s"}` : "No documents";
  const st = deal ? DEAL_STATUS[deal.status]?.label : "";
  return [st ? `Deal ${st.toLowerCase()}` : "", docs].filter(Boolean).join(" · ");
}

function DocRow({ r, canDelete, onOpen, onDelete, busy }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <button type="button" onClick={() => onOpen(r)} className="min-w-0 flex-1 flex items-center gap-2.5 text-left">
        <FileText className="w-4 h-4 shrink-0 text-white/45" />
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold truncate hover:underline">{r.file_name || r.title}</span>
          <span className="block text-[12px] text-white/45" style={{ fontFamily: SCENE_MONO }}>{fmtDate(r.filed_at).toUpperCase()}{r.filed_by_name ? ` · ${r.filed_by_name.toUpperCase()}` : ""}</span>
        </span>
      </button>
      {canDelete && (confirm ? (
        <span className="flex items-center gap-1.5 shrink-0">
          <button type="button" disabled={busy} onClick={() => onDelete(r)} className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-red-500/90 text-white disabled:opacity-50">{busy ? "DELETING..." : "DELETE"}</button>
          <button type="button" disabled={busy} onClick={() => setConfirm(false)} className="px-2 py-1.5 text-[12px] font-bold text-white/50">KEEP</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} aria-label={`Delete ${r.file_name || r.title}`} className="p-1.5 rounded-lg text-white/35 hover:text-red-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
      ))}
    </div>
  );
}

export default function EventPaperwork({ gig, biz, onChanged, color = "#60A5FA", userId = null }) {
  const records = biz?.records || [];
  const deal = biz?.deal || null;
  const canUpload = !!biz?.can_view;
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({});
  const [view, setView] = useState(null);
  const [dealOpen, setDealOpen] = useState(false);
  const inputs = useRef({});

  const say = (kind, text) => { setMsg((m) => ({ ...m, [kind]: text })); if (!text.startsWith("Couldn't")) setTimeout(() => setMsg((m) => ({ ...m, [kind]: "" })), 2500); };
  const upload = async (kind, label, files) => {
    if (!files.length) return;
    setBusy(`up:${kind}`); say(kind, "");
    try {
      for (const f of files) await fileRecord(gig.id, { kind, title: label, file: f });
      await onChanged?.();
      say(kind, files.length > 1 ? `${files.length} uploaded ✓` : "Uploaded ✓");
    } catch (e) {
      console.error(e);
      say(kind, `Couldn't upload: ${e?.message || "try again"}`);
    }
    setBusy("");
  };
  const remove = async (r) => {
    setBusy(`del:${r.id}`); say(r.kind, "");
    try { await deleteRecord(r); await onChanged?.(); say(r.kind, "Deleted"); }
    catch (e) { console.error(e); say(r.kind, `Couldn't delete: ${e?.message || "try again"}`); }
    setBusy("");
  };
  // A file opens straight away; an older record with no file opens its summary.
  const open = async (r) => {
    if (!r.file_path) { setView(r); return; }
    const w = window.open("", "_blank");
    try { const url = await recordFileUrl(r.file_path); if (w) w.location.href = url; else window.location.href = url; }
    catch (e) { console.error(e); w?.close(); setView(r); }
  };
  const canDelete = (r) => !!biz?.venue || !!biz?.is_owner || (!!userId && r.filed_by === userId);

  return (
    <div className="flex flex-col gap-3">
      {PAPERWORK_SECTIONS.map(({ kind, label }) => {
        const docs = records.filter((r) => r.kind === kind).sort((a, b) => String(b.filed_at).localeCompare(String(a.filed_at)));
        const m = msg[kind];
        const st = kind === "deal" && deal ? DEAL_STATUS[deal.status] : null;
        return (
          <section key={kind} className="rounded-[12px] border border-[#242424] bg-[#121212] overflow-hidden">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: docs.length || (kind === "deal" && deal?.status === "accepted") ? G : "rgba(255,255,255,0.22)" }} />
              <h3 className="min-w-0 flex-1 text-[16px] font-semibold leading-tight truncate">
                {label}{docs.length > 0 && <span className="ml-1.5 text-[13px] font-normal text-white/40">{docs.length}</span>}
              </h3>
              {canUpload && (
                <>
                  <button type="button" disabled={!!busy} onClick={() => inputs.current[kind]?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold tracking-[0.05em] disabled:opacity-40" style={{ background: color, color: "#0d0d0d" }}>
                    <Upload className="w-3.5 h-3.5" /> {busy === `up:${kind}` ? "UPLOADING..." : "UPLOAD"}
                  </button>
                  <input ref={(el) => { inputs.current[kind] = el; }} type="file" multiple accept={ACCEPT} className="hidden" aria-label={`Upload ${label}`}
                    onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ""; upload(kind, label, fs); }} />
                </>
              )}
            </div>

            {kind === "deal" && (
              <div className="px-3 pb-2.5">
                <button type="button" onClick={() => setDealOpen((v) => !v)} aria-expanded={dealOpen} className="flex items-center gap-2 text-[13px] font-semibold text-white/65 hover:text-white">
                  <ChevronDown className="w-4 h-4 transition-transform" style={{ transform: dealOpen ? "rotate(180deg)" : undefined }} />
                  Deal terms
                  {st && !dealOpen && <span className="text-[10.5px] font-bold tracking-[0.1em] px-1.5 py-0.5 rounded" style={{ fontFamily: SCENE_MONO, color: "#0d0d0d", background: deal.status === "accepted" ? G : deal.status === "changes_requested" ? AMBER : deal.status === "draft" ? "#9A9A9A" : color }}>{st.label}</span>}
                </button>
                {dealOpen && <div className="mt-3"><EventDeal gig={gig} biz={biz} onChanged={onChanged} color={color} compact /></div>}
              </div>
            )}

            {docs.length > 0 && (
              <div className="border-t border-[#1f1f1f] divide-y divide-[#1f1f1f]">
                {docs.map((r) => <DocRow key={r.id} r={r} canDelete={canDelete(r)} onOpen={open} onDelete={remove} busy={busy === `del:${r.id}`} />)}
              </div>
            )}
            {m && <p className={`px-3 pb-2.5 text-[13px] ${m.startsWith("Couldn't") ? "text-red-400" : ""}`} style={m.startsWith("Couldn't") ? undefined : { color: G }}>{m}</p>}
          </section>
        );
      })}

      <RecordModal record={view} onClose={() => setView(null)} />
    </div>
  );
}
