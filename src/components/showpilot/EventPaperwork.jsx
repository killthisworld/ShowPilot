import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, FileText, Lock, Printer, Upload } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { RecordModal, printRecord } from "@/components/showpilot/RecordView";
import {
  RECORD_KINDS, DEAL_STATUS, fileRecord, agreementSnapshot, riderSnapshot, advanceSnapshot,
  coiWarning, fmtDate,
} from "@/lib/eventBusiness";

// The event's paperwork, kept by the Venue: performance agreement, rider,
// advance confirmations and certificate of insurance. "File" saves a dated
// copy nobody can edit; filing again makes the next version and keeps the
// old one. The manager / artist side can read what's filed.
const G = "#8CFF3D";
const AMBER = "#FF6A00";
const labelCls = "text-[11px] tracking-[0.12em] text-white/50";
const inputCls = "w-full h-10 px-3 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none focus:border-white/40";
const btn = "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-bold tracking-[0.05em] disabled:opacity-40";

const latestOf = (records, kind) => records.filter((r) => r.kind === kind).sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;

export function paperworkState(records = []) {
  const kinds = ["agreement", "rider", "advance", "coi"];
  const n = kinds.filter((k) => records.some((r) => r.kind === k)).length;
  return n === 0 ? "empty" : n === kinds.length ? "done" : "partial";
}
export function paperworkSummary(records = [], eventDate) {
  const kinds = ["agreement", "rider", "advance", "coi"];
  const n = kinds.filter((k) => records.some((r) => r.kind === k)).length;
  const warn = coiWarning(records, eventDate);
  return [`${n} of 4 filed`, warn && warn.level !== "missing" ? warn.text : ""].filter(Boolean).join(" · ");
}

function Row({ title, sub, state, children, warn }) {
  const dot = state === "done" ? G : state === "partial" ? AMBER : "rgba(255,255,255,0.25)";
  return (
    <div className="rounded-[12px] border border-[#242424] bg-[#121212] p-3 flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold leading-tight">{title}</div>
          {sub && <div className="text-[13px] text-white/50 leading-snug mt-0.5">{sub}</div>}
          {warn && <div className="mt-1 flex items-center gap-1.5 text-[13px]" style={{ color: AMBER }}><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{warn}</div>}
        </div>
      </div>
      {children && <div className="flex flex-col gap-2 pl-[18px]">{children}</div>}
    </div>
  );
}

const filedLine = (r) => (r ? `V${r.version} filed ${fmtDate(r.filed_at)}${r.signed ? " · signed copy" : ""}${r.party ? ` · ${r.party}` : ""}${r.expires_on ? ` · expires ${fmtDate(r.expires_on)}` : ""}` : "Not filed yet");

export default function EventPaperwork({ gig, biz, onChanged, color = "#60A5FA" }) {
  const records = biz?.records || [];
  const deal = biz?.deal || null;
  const canFile = !!biz?.venue;
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({});
  const [view, setView] = useState(null);
  const [advNote, setAdvNote] = useState("");
  const [coi, setCoi] = useState({ party: "", expires: "", file: null });
  const signedRef = useRef(null);
  const riderRef = useRef(null);
  const coiRef = useRef(null);

  const latest = useMemo(() => ({
    agreement: latestOf(records, "agreement"),
    rider: latestOf(records, "rider"),
    advance: latestOf(records, "advance"),
    coi: latestOf(records, "coi"),
  }), [records]);
  const warn = coiWarning(records, gig.date);
  const party = (gig.manager_info || {}).contact_name || (gig.bands || [])[0]?.band_name || "";

  const run = async (key, fn, done = "Filed ✓") => {
    setBusy(key); setMsg((m) => ({ ...m, [key]: "" }));
    try { await fn(); await onChanged?.(); setMsg((m) => ({ ...m, [key]: done })); setTimeout(() => setMsg((m) => ({ ...m, [key]: "" })), 2500); }
    catch (e) { console.error(e); setMsg((m) => ({ ...m, [key]: `Couldn't file: ${e?.message || "try again"}` })); }
    setBusy("");
  };
  const preview = (kind, snapshot) => printRecord({ kind, title: RECORD_KINDS[kind].label, snapshot, event_name: gig.event_name || gig.band_name, event_date: gig.date, venue_name: gig.venue });
  const versionsOf = (kind) => records.filter((r) => r.kind === kind).sort((a, b) => (b.version || 0) - (a.version || 0));
  const viewBtn = (r) => r && (
    <button type="button" onClick={() => setView(r)} className={`${btn} bg-[#111] border border-[#2a2a2a] text-white/80 hover:text-white`}>
      <FileText className="w-3.5 h-3.5" /> VIEW V{r.version}
    </button>
  );
  const note = (key) => msg[key] && <span className={`text-[13px] ${msg[key].startsWith("Couldn't") ? "text-red-400" : ""}`} style={msg[key].startsWith("Couldn't") ? undefined : { color: G }}>{msg[key]}</span>;
  const primary = { background: color, color: "#0d0d0d" };
  const ghost = "bg-[#111] border border-[#2a2a2a] text-white/80 hover:text-white";

  const agreementSnap = () => agreementSnapshot(gig, deal);
  const filed = records.slice().sort((a, b) => String(b.filed_at).localeCompare(String(a.filed_at)));

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-[13px] text-white/45"><Lock className="w-3.5 h-3.5 shrink-0" /> Filing saves a dated copy that can't be edited. File again to make a new version. The old one stays. Only the venue, the manager / artist and the event owner see these.</p>

      <Row
        title="Performance agreement"
        sub={`${deal ? `Deal ${DEAL_STATUS[deal.status]?.label.toLowerCase()}` : "No deal yet"} · ${filedLine(latest.agreement)}`}
        state={latest.agreement?.signed ? "done" : latest.agreement ? "partial" : "empty"}
        warn={deal && deal.status !== "accepted" && canFile ? "The deal isn't accepted yet" : null}
      >
        <div className="flex flex-wrap gap-2">
          {canFile && (
            <button type="button" disabled={!!busy || !deal} onClick={() => run("agreement", () => fileRecord(gig.id, { kind: "agreement", title: "Performance agreement", snapshot: agreementSnap(), party }))} className={btn} style={primary}>
              {busy === "agreement" ? "FILING..." : "FILE AGREEMENT"}
            </button>
          )}
          {canFile && (
            <>
              <button type="button" disabled={!!busy || !deal} onClick={() => signedRef.current?.click()} className={`${btn} ${ghost}`}><Upload className="w-3.5 h-3.5" /> {busy === "signed" ? "UPLOADING..." : "UPLOAD SIGNED COPY"}</button>
              <input ref={signedRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (f) run("agreement", () => fileRecord(gig.id, { kind: "agreement", title: "Performance agreement (signed)", snapshot: agreementSnap(), file: f, signed: true, party }), "Signed copy filed ✓");
              }} />
            </>
          )}
          {deal && <button type="button" onClick={() => preview("agreement", agreementSnap())} className={`${btn} ${ghost}`}><Printer className="w-3.5 h-3.5" /> PRINT TO SIGN</button>}
          {viewBtn(latest.agreement)}
        </div>
        {!deal && <span className="text-[13px] text-white/45">Write the deal on the Deal page first.</span>}
        {note("agreement")}
      </Row>

      <Row title="Rider" sub={`Hospitality, house gear, who provides what and each act's tech rider · ${filedLine(latest.rider)}`} state={latest.rider ? "done" : "empty"}>
        <div className="flex flex-wrap gap-2">
          {canFile && (
            <button type="button" disabled={!!busy} onClick={() => run("rider", () => fileRecord(gig.id, { kind: "rider", title: "Rider", snapshot: riderSnapshot(gig), party }))} className={btn} style={primary}>
              {busy === "rider" ? "FILING..." : "FILE RIDER"}
            </button>
          )}
          {canFile && (
            <>
              <button type="button" disabled={!!busy} onClick={() => riderRef.current?.click()} className={`${btn} ${ghost}`}><Upload className="w-3.5 h-3.5" /> ATTACH ARTIST'S RIDER</button>
              <input ref={riderRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (f) run("rider", () => fileRecord(gig.id, { kind: "rider", title: "Rider (artist's file)", snapshot: riderSnapshot(gig), file: f, party }));
              }} />
            </>
          )}
          <button type="button" onClick={() => preview("rider", riderSnapshot(gig))} className={`${btn} ${ghost}`}><Printer className="w-3.5 h-3.5" /> SEE FULL RIDER</button>
          {viewBtn(latest.rider)}
        </div>
        {note("rider")}
      </Row>

      <Row title="Advance confirmations" sub={`Schedule, load-in, parking, guest list, travel and the advance checklist · ${filedLine(latest.advance)}`} state={latest.advance ? "done" : "empty"}>
        {canFile && (
          <label className="flex flex-col gap-1.5">
            <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>PASTE THE EMAIL OR MESSAGE THAT CONFIRMS IT (OPTIONAL)</span>
            <textarea value={advNote} onChange={(e) => setAdvNote(e.target.value)} rows={3} placeholder="e.g. 'Confirmed: load-in 4pm at the back dock, 2 parking spots, 6 on the guest list' - Sam, Oct 20" className="w-full px-3 py-2 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-[15px] placeholder:text-white/25 outline-none focus:border-white/40 resize-y" />
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {canFile && (
            <button type="button" disabled={!!busy} onClick={() => run("advance", async () => { await fileRecord(gig.id, { kind: "advance", title: "Advance confirmations", snapshot: advanceSnapshot(gig, deal), note: advNote, party }); setAdvNote(""); })} className={btn} style={primary}>
              {busy === "advance" ? "FILING..." : "FILE ADVANCE"}
            </button>
          )}
          <button type="button" onClick={() => preview("advance", advanceSnapshot(gig, deal))} className={`${btn} ${ghost}`}><Printer className="w-3.5 h-3.5" /> PREVIEW</button>
          {viewBtn(latest.advance)}
        </div>
        {note("advance")}
      </Row>

      <Row title="Certificate of insurance" sub={filedLine(latest.coi)} state={latest.coi && !warn ? "done" : latest.coi ? "partial" : "empty"} warn={warn?.text}>
        {canFile && (
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_170px] gap-2">
            <label className="flex flex-col gap-1.5 min-w-0">
              <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>FROM</span>
              <input value={coi.party} onChange={(e) => setCoi((c) => ({ ...c, party: e.target.value }))} placeholder={party || "Artist or company insured"} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5 min-w-0">
              <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>EXPIRES</span>
              <input type="date" value={coi.expires} onChange={(e) => setCoi((c) => ({ ...c, expires: e.target.value }))} className={`${inputCls} [color-scheme:dark]`} />
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {canFile && (
            <>
              <button type="button" onClick={() => coiRef.current?.click()} className={`${btn} ${ghost}`}><Upload className="w-3.5 h-3.5" /> {coi.file ? coi.file.name.slice(0, 28) : "CHOOSE FILE"}</button>
              <input ref={coiRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setCoi((c) => ({ ...c, file: f })); }} />
              <button type="button" disabled={!!busy || !coi.file || !coi.expires} onClick={() => run("coi", async () => {
                await fileRecord(gig.id, { kind: "coi", title: "Certificate of insurance", file: coi.file, party: coi.party || party, expiresOn: coi.expires, snapshot: { title: "Certificate of insurance", sections: [{ heading: "Certificate", rows: [["Insured", coi.party || party || "—"], ["Expires", fmtDate(coi.expires)]] }] } });
                setCoi({ party: "", expires: "", file: null });
              })} className={btn} style={primary}>
                {busy === "coi" ? "FILING..." : "FILE CERTIFICATE"}
              </button>
            </>
          )}
          {viewBtn(latest.coi)}
        </div>
        {canFile && (!coi.file || !coi.expires) && <span className="text-[13px] text-white/40">Choose the certificate file and its expiry date to file it.</span>}
        {note("coi")}
      </Row>

      {filed.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          <span className={labelCls} style={{ fontFamily: SCENE_MONO }}>FILED FOR THIS EVENT</span>
          <div className="rounded-[10px] border border-[#242424] divide-y divide-[#1f1f1f] overflow-hidden">
            {filed.map((r) => (
              <button key={r.id} type="button" onClick={() => setView(r)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03]">
                {r.signed ? <Check className="w-4 h-4 shrink-0" style={{ color: G }} /> : <FileText className="w-4 h-4 shrink-0 text-white/40" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold truncate">{r.title} <span className="text-white/40 font-normal">V{r.version}</span></span>
                  <span className="block text-[12px] text-white/45" style={{ fontFamily: SCENE_MONO }}>{fmtDate(r.filed_at).toUpperCase()}{r.filed_by_name ? ` · ${r.filed_by_name.toUpperCase()}` : ""}{r.file_name ? " · FILE" : ""}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-white/25 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
      {!canFile && !filed.length && <p className="text-[14px] text-white/45">Nothing filed yet. The venue files the agreement, rider, advance and insurance here.</p>}

      <RecordModal record={view} versions={view ? versionsOf(view.kind) : []} onClose={() => setView(null)} />
    </div>
  );
}
