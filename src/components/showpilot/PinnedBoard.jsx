import React, { useState } from "react";
import { ChevronDown, FileText, Pencil, Pin } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import PdfStyleSheet from "@/components/showpilot/PdfStyleSheet";
import { guestListPdf, saveOrShare } from "@/lib/guestListPdf";
import { readPins, PIN_LABEL, runOfShowFor, actsInOrder, contactRows, lineupPdf, schedulePdf, setlistPdf, contactsPdf } from "@/lib/eventPdfs";

// Pinned board (job 314): the sheets the Venue, Artist or Manager pinned
// from Create PDFs, shown live on the event's home for everyone on the
// event (phones and desktop, techs too). Built from the event's current
// info, so an edited time shows here straight away. Each pin opens a PDF
// copy, and whoever can edit where it comes from gets Edit.
const G = "#8CFF3D";
const COLOR = { venue: "#60A5FA", manager: "#F87171" };
// Where each sheet is edited: [section that edits it, profile, page].
const EDIT_AT = { schedule: ["venue", "venue", "schedule"], lineup: ["manager", "band", "lineup"], setlist: ["manager", "band", "setlist"], contacts: ["manager", "manager", "contact"], guests: ["manager", "manager", "guests"] };

function Row({ left, right, sub, color }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-[74px] shrink-0 text-[13.5px] pt-[1px]" style={{ fontFamily: SCENE_MONO, color: color || "rgba(255,255,255,0.6)" }}>{left}</span>
      <span className="min-w-0 flex-1 text-[15.5px] leading-snug [overflow-wrap:anywhere]" style={{ color: color || "#fff" }}>{right}{sub && <span className="block text-[13px] text-white/50">{sub}</span>}</span>
    </div>
  );
}

function SheetBody({ type, gig }) {
  const vi = gig.venue_info || {}, mi = gig.manager_info || {};
  if (type === "schedule") {
    const run = runOfShowFor(gig);
    const notes = [["Load-in", vi.load_in_location], ["Parking", vi.parking], ["Load out by", vi.load_out_by]].filter(([, v]) => v && String(v).trim());
    return (<>
      {run.length ? run.map((r, i) => (
        <Row key={i} left={r.time || "--"} right={`${r.label}${r.kind === "curfew" && vi.hard_curfew ? " (hard)" : ""}`}
          color={r.kind === "curfew" ? "#f87171" : r.kind === "doors" ? COLOR.venue : r.kind === "set" ? COLOR.manager : null} />
      )) : <p className="text-[14px] text-white/45 m-0">No times yet.</p>}
      {notes.length > 0 && <div className="mt-2 pt-2 border-t border-[#222]">{notes.map(([k, v]) => <Row key={k} left={k} right={v} />)}</div>}
    </>);
  }
  if (type === "lineup") {
    const acts = actsInOrder(gig);
    return acts.length ? acts.map((a, i) => <Row key={a.name} left={a.time || `#${i + 1}`} right={a.name} sub={[a.headliner ? "Headliner" : "", a.length].filter(Boolean).join(" · ")} />) : <p className="text-[14px] text-white/45 m-0">No acts yet.</p>;
  }
  if (type === "setlist") {
    const lists = (mi.setlists || []).filter((s) => (s.songs || []).some((x) => x.kind !== "break" && String(x.title || "").trim()));
    return lists.length ? lists.map((s) => (
      <div key={s.act} className="mb-2 last:mb-0">
        <div className="text-[12px] tracking-[0.12em] text-white/50 mb-1" style={{ fontFamily: SCENE_MONO }}>{String(s.act).toUpperCase()}</div>
        {(() => { let num = 0; return (s.songs || []).filter((x) => x.kind === "break" || String(x.title || "").trim()).map((x, i) => (x.kind === "break"
          ? <div key={x.id || i} role="separator" aria-label="Break" className="my-2 flex flex-col gap-[4px]"><span className="block h-[3px] rounded-full bg-white" /><span className="block h-[3px] rounded-full bg-white" /></div>
          : <Row key={x.id || i} left={String(++num)} right={x.title} />)); })()}
      </div>
    )) : <p className="text-[14px] text-white/45 m-0">No songs yet.</p>;
  }
  if (type === "contacts") {
    const rows = contactRows(gig);
    return rows.length ? rows.map(([role, name, phone, email], i) => (
      <div key={i} className="py-1.5">
        <div className="text-[12px] tracking-[0.1em] text-white/50" style={{ fontFamily: SCENE_MONO }}>{String(role).toUpperCase()}</div>
        <div className="text-[15.5px] text-white font-semibold [overflow-wrap:anywhere]">{name || "-"}</div>
        <div className="text-[14px] flex flex-wrap gap-x-3 [overflow-wrap:anywhere]">
          {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} style={{ color: G }}>{phone}</a>}
          {email && (email.includes("@") ? <a href={`mailto:${email}`} className="text-white/70">{email}</a> : <span className="text-white/60">{email}</span>)}
        </div>
      </div>
    )) : <p className="text-[14px] text-white/45 m-0">No contacts filled in yet.</p>;
  }
  if (type === "guests") {
    const g = (mi.guests || []).filter((x) => x.name);
    const people = g.reduce((n, x) => n + 1 + (Number(x.plus) || 0), 0);
    return g.length ? (<>
      <div className="text-[13px] text-white/55 mb-1">{people} {people === 1 ? "person" : "people"} · {g.length} {g.length === 1 ? "name" : "names"}</div>
      {[...g].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })).map((x, i) => (
        <Row key={x.id || i} left={Number(x.plus) > 0 ? `+${Number(x.plus)}` : ""} right={x.name} sub={x.artist ? `Guest of ${x.artist}` : ""} />
      ))}
    </>) : <p className="text-[14px] text-white/45 m-0">No one on the guest list yet.</p>;
  }
  return null;
}

export default function PinnedBoard({ gig, canEdit = () => false, onEdit = null }) {
  const pins = gig ? readPins(gig) : [];
  const [open, setOpen] = useState(() => new Set(pins.length ? [pins[0].type] : []));
  const [pdfFor, setPdfFor] = useState(null);
  if (!pins.length) return null;
  const title = gig.event_name || gig.band_name || "Event";
  const toggle = (t) => setOpen((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const build = (type, style) => {
    if (type === "schedule") return schedulePdf(gig, runOfShowFor(gig), style);
    if (type === "lineup") return lineupPdf(gig, style);
    if (type === "setlist") return setlistPdf(gig, gig.manager_info?.setlists, null, style);
    if (type === "contacts") return contactsPdf(gig, style);
    return guestListPdf({ kind: "guests", rows: gig.manager_info?.guests || [], eventName: title, eventDate: gig.date || null, venue: gig.venue || null, style });
  };
  const btn = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] font-bold border";
  return (
    <section aria-label="Pinned" className="mb-4">
      <div className="flex items-center gap-2 mb-2 text-[11.5px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>
        <Pin className="w-3.5 h-3.5" style={{ color: G }} /> PINNED
      </div>
      <div className="flex flex-col gap-2">
        {pins.map((p) => {
          const on = open.has(p.type);
          const [section, role, key] = EDIT_AT[p.type];
          const editable = !!onEdit && canEdit(section);
          const c = COLOR[p.by] || G;
          return (
            <div key={p.type} className="rounded-xl bg-[#111] border overflow-hidden" style={{ borderColor: `${c}55` }}>
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button type="button" onClick={() => toggle(p.type)} aria-expanded={on} className="min-w-0 flex-1 flex items-center gap-2 text-left">
                  <span className="w-1.5 h-5 rounded-full shrink-0" style={{ background: c }} />
                  <span className="text-[16px] font-bold text-white truncate">{PIN_LABEL[p.type]}</span>
                  <ChevronDown className={`w-4 h-4 text-white/45 shrink-0 transition-transform ${on ? "rotate-180" : ""}`} />
                </button>
                {editable && <button type="button" onClick={() => onEdit(role, key)} className={`${btn} text-white/80 border-[#333]`} aria-label={`Edit ${PIN_LABEL[p.type]}`}><Pencil className="w-3.5 h-3.5" /> Edit</button>}
                <button type="button" onClick={() => setPdfFor(p.type)} className={btn} style={{ color: c, borderColor: `${c}66` }} aria-label={`${PIN_LABEL[p.type]} as a PDF`}><FileText className="w-3.5 h-3.5" /> PDF</button>
              </div>
              {on && <div className="px-3 pb-3 -mt-0.5"><SheetBody type={p.type} gig={gig} /></div>}
            </div>
          );
        })}
      </div>
      {pdfFor && <PdfStyleSheet title={PIN_LABEL[pdfFor]} eventName={title} previewLine={PIN_LABEL[pdfFor]} onCreate={(style) => saveOrShare(build(pdfFor, style))} onClose={() => setPdfFor(null)} />}
    </section>
  );
}
