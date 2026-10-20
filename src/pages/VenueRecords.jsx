import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertTriangle, Check, Download, FileText, Lock, Search } from "lucide-react";
import { useGoBack } from "@/lib/navHistory";
import useIsDesktop from "@/hooks/useIsDesktop";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { RecordModal } from "@/components/showpilot/RecordView";
import { RECORD_KINDS, listVenueRecords, fmtDate, daysLeft } from "@/lib/eventBusiness";

// The venue's business records (job 104): every agreement, rider, advance
// confirmation and certificate of insurance filed on its events, newest
// first. Search, filter by type, open any version, export a spreadsheet.
// Records are dated copies that can't be edited.
const C = ACCOUNT_TYPE_STYLES.venue.color;
const AMBER = "#FF6A00";
const G = "#8CFF3D";
const FILTERS = [["all", "All"], ["agreement", "Agreements"], ["rider", "Riders"], ["advance", "Advance"], ["coi", "Insurance"], ["other", "Other"]];

// Cells come from other people (band names, notes), so anything a
// spreadsheet would run as a formula is prefixed with ' first.
const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function VenueRecords() {
  const goBack = useGoBack("/");
  const desktop = useIsDesktop();
  const [records, setRecords] = useState(null);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState(null);

  useEffect(() => {
    listVenueRecords().then(setRecords).catch((e) => { console.error(e); setErr("Couldn't load your records."); setRecords([]); });
  }, []);

  const all = records || [];
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => (kind === "all" || r.kind === kind) && (!needle || [r.title, r.event_name, r.venue_name, r.party, r.note, r.filed_by_name].some((x) => String(x || "").toLowerCase().includes(needle))));
  }, [all, kind, q]);

  // Insurance to chase: the newest certificate per event that has run out
  // or runs out within 30 days.
  const coiAlerts = useMemo(() => {
    const byShow = {};
    all.filter((r) => r.kind === "coi" && r.expires_on).forEach((r) => {
      const k = r.show_id || r.id;
      if (!byShow[k] || String(r.expires_on) > String(byShow[k].expires_on)) byShow[k] = r;
    });
    return Object.values(byShow).map((r) => ({ r, left: daysLeft(r.expires_on) })).filter((x) => x.left !== null && x.left <= 30).sort((a, b) => a.left - b.left);
  }, [all]);

  const versionsOf = (r) => all.filter((x) => x.kind === r.kind && (x.show_id || null) === (r.show_id || null)).sort((a, b) => (b.version || 0) - (a.version || 0));
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, k === "all" ? all.length : all.filter((r) => r.kind === k).length])), [all]);

  const exportCsv = () => {
    const head = ["Filed", "Type", "Title", "Version", "Event", "Event date", "Venue", "With", "Signed", "Expires", "File", "Filed by", "Note"];
    const rows = list.map((r) => [r.filed_at ? new Date(r.filed_at).toISOString() : "", RECORD_KINDS[r.kind]?.label || r.kind, r.title, r.version, r.event_name, r.event_date, r.venue_name, r.party, r.signed ? "yes" : "", r.expires_on, r.file_name, r.filed_by_name, r.note]);
    const csv = [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `showpilot-records-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const badge = (r) => (
    <span className="text-[10.5px] font-bold tracking-[0.08em] px-1.5 py-0.5 rounded shrink-0" style={{ fontFamily: SCENE_MONO, color: "rgba(255,255,255,0.75)", border: "1px solid #2e2e2e" }}>
      {RECORD_KINDS[r.kind]?.short || "RECORD"}
    </span>
  );
  const expiry = (r) => {
    if (!r.expires_on) return null;
    const left = daysLeft(r.expires_on);
    const c = left < 0 ? "#F87171" : left <= 30 ? AMBER : "rgba(255,255,255,0.5)";
    return <span style={{ color: c }}>{left < 0 ? "Expired " : "Expires "}{fmtDate(r.expires_on)}</span>;
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white pb-20" style={{ fontFamily: SCENE_FONT }}>
      <div className="sticky top-0 z-30 bg-[#0d0d0d]/95 backdrop-blur border-b border-[#1a1a1a]">
        <div className={`mx-auto px-4 py-3 flex items-center gap-3 ${desktop ? "max-w-[1180px]" : "max-w-lg"}`}>
          <button type="button" onClick={() => goBack()} aria-label="Back" className="p-1 -ml-1 text-white/60 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-bold leading-none">Records</h1>
            <p className="mt-1 text-[14px] text-white/50 truncate">Agreements, riders, advance confirmations and insurance filed on your events.</p>
          </div>
          {desktop && (
            <button type="button" onClick={exportCsv} disabled={!list.length} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold tracking-[0.05em] bg-[#111] border border-[#2a2a2a] text-white/80 hover:text-white disabled:opacity-40">
              <Download className="w-4 h-4" /> EXPORT CSV
            </button>
          )}
        </div>
      </div>

      <div className={`mx-auto px-4 pt-4 flex flex-col gap-4 ${desktop ? "max-w-[1180px]" : "max-w-lg"}`}>
        <p className="flex items-center gap-1.5 text-[13px] text-white/45"><Lock className="w-3.5 h-3.5 shrink-0" /> Each record is a dated copy that can't be edited. Filing again from the event adds a new version.</p>

        {coiAlerts.length > 0 && (
          <div className="rounded-[12px] p-3 flex flex-col gap-2" style={{ border: `1px solid ${AMBER}66`, background: `${AMBER}12` }}>
            <div className="flex items-center gap-2 text-[14px] font-bold" style={{ color: AMBER }}><AlertTriangle className="w-4 h-4" /> INSURANCE TO CHASE</div>
            {coiAlerts.map(({ r, left }) => (
              <button key={r.id} type="button" onClick={() => setView(r)} className="flex items-center gap-2 text-left text-[15px]">
                <span className="flex-1 min-w-0 truncate">{r.party || "Certificate"} · {r.event_name || "Event"} {r.event_date ? `(${fmtDate(r.event_date)})` : ""}</span>
                <span className="shrink-0 text-[13px]" style={{ color: left < 0 ? "#F87171" : AMBER }}>{left < 0 ? `expired ${fmtDate(r.expires_on)}` : left === 0 ? "expires today" : `${left} day${left === 1 ? "" : "s"} left`}</span>
              </button>
            ))}
          </div>
        )}

        <div className={`flex gap-2 ${desktop ? "items-center" : "flex-col"}`}>
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className="shrink-0 px-3 py-1.5 rounded-full text-[13px] font-bold whitespace-nowrap" style={kind === k ? { background: C, color: "#0d0d0d" } : { border: "1px solid #2a2a2a", color: "rgba(255,255,255,0.7)" }}>
                {label}{counts[k] ? ` · ${counts[k]}` : ""}
              </button>
            ))}
          </div>
          <div className={`flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#111] px-3 h-10 ${desktop ? "ml-auto w-[300px]" : ""}`}>
            <Search className="w-4 h-4 text-white/40 shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search event, artist, title" className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-white/30" />
          </div>
        </div>

        {records === null ? (
          <div className="py-10 flex justify-center"><div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" /></div>
        ) : err ? (
          <p className="text-[15px] text-red-400">{err}</p>
        ) : !all.length ? (
          <div className="rounded-[12px] border border-[#1f1f1f] bg-[#111] p-5 text-[15px] text-white/55 leading-relaxed">
            Nothing filed yet. Open an event, go to your Venue profile and use <span className="text-white">Paperwork</span> to file the agreement, rider, advance and insurance. They all land here.
          </div>
        ) : !list.length ? (
          <p className="text-[15px] text-white/45">No records match.</p>
        ) : desktop ? (
          <div className="rounded-[12px] border border-[#1f1f1f] overflow-hidden">
            <div className="grid grid-cols-[110px_110px_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_150px] gap-3 px-4 py-2 text-[11px] tracking-[0.1em] text-white/45 bg-[#0f0f0f]" style={{ fontFamily: SCENE_MONO }}>
              <span>FILED</span><span>TYPE</span><span>RECORD</span><span>EVENT</span><span>WITH</span><span>STATUS</span>
            </div>
            {list.map((r) => (
              <button key={r.id} type="button" onClick={() => setView(r)} className="w-full grid grid-cols-[110px_110px_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_150px] gap-3 px-4 py-2.5 text-left border-t border-[#1a1a1a] hover:bg-white/[0.03] items-center text-[15px]">
                <span className="text-white/60 text-[14px]">{fmtDate(r.filed_at)}</span>
                <span>{badge(r)}</span>
                <span className="min-w-0 truncate font-semibold">{r.title} <span className="font-normal text-white/40">V{r.version}</span></span>
                <span className="min-w-0 truncate text-white/80">{r.event_name || "—"}{r.event_date ? <span className="text-white/45"> · {fmtDate(r.event_date)}</span> : null}</span>
                <span className="min-w-0 truncate text-white/70">{r.party || "—"}</span>
                <span className="flex items-center gap-2 text-[13px] min-w-0">
                  {r.signed && <span className="flex items-center gap-1" style={{ color: G }}><Check className="w-3.5 h-3.5" />Signed</span>}
                  {r.file_path && !r.signed && <span className="flex items-center gap-1 text-white/55"><FileText className="w-3.5 h-3.5" />File</span>}
                  {expiry(r)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((r) => (
              <button key={r.id} type="button" onClick={() => setView(r)} className="w-full rounded-[12px] border border-[#1f1f1f] bg-[#111] px-3.5 py-3 text-left flex flex-col gap-1">
                <div className="flex items-center gap-2 min-w-0">
                  {badge(r)}
                  <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{r.title} <span className="font-normal text-white/40">V{r.version}</span></span>
                  {r.signed && <Check className="w-4 h-4 shrink-0" style={{ color: G }} />}
                </div>
                <div className="text-[14px] text-white/70 truncate">{r.event_name || "—"}{r.event_date ? ` · ${fmtDate(r.event_date)}` : ""}{r.party ? ` · ${r.party}` : ""}</div>
                <div className="text-[12px] text-white/45 flex gap-2" style={{ fontFamily: SCENE_MONO }}>
                  <span>FILED {fmtDate(r.filed_at).toUpperCase()}</span>
                  {r.expires_on && <span>{expiry(r)}</span>}
                </div>
              </button>
            ))}
            <button type="button" onClick={exportCsv} className="mt-2 flex items-center justify-center gap-1.5 py-3 rounded-[10px] text-[14px] font-bold tracking-[0.05em] bg-[#111] border border-[#2a2a2a] text-white/80">
              <Download className="w-4 h-4" /> EXPORT CSV
            </button>
          </div>
        )}
      </div>

      <RecordModal record={view} versions={view ? versionsOf(view) : []} onClose={() => setView(null)} />
    </div>
  );
}
