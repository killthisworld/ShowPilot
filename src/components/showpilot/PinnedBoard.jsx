import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Palette, Pencil, Pin, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import PdfStyleSheet from "@/components/showpilot/PdfStyleSheet";
import { guestListPdf, saveOrShare, DEFAULT_PDF_STYLE } from "@/lib/guestListPdf";
import { readPins, PIN_LABEL, runOfShowFor, actsInOrder, contactRows, lineupPdf, schedulePdf, setlistPdf, contactsPdf } from "@/lib/eventPdfs";

// Pinned board (jobs 314, 317): the sheets the Venue, Artist or Manager
// pinned from Create PDFs, on the event's home for everyone on the event
// (phones and desktop, techs too). Each pin is a little paper page with a
// thumbtack, slightly crooked like the bulletin-board notes. Tap one for a
// preview window: the page itself, Save PDF, Style (color / picture) and,
// for whoever can change it, Edit. Built from the event's current info, so
// an edited time shows straight away.
const G = "#8CFF3D";
const COLOR = { venue: "#60A5FA", manager: "#F87171" };
const TILT = [-2.2, 1.8, -1.2, 2.4, -1.8];
// Where each sheet is edited: [section that edits it, profile, page].
const EDIT_AT = { schedule: ["venue", "venue", "schedule"], lineup: ["manager", "band", "lineup"], setlist: ["manager", "band", "setlist"], contacts: ["manager", "manager", "contact"], guests: ["manager", "manager", "guests"] };
const INK = "#111", DIM = "rgba(0,0,0,0.55)";

function Row({ left, right, sub, strong }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="w-[78px] shrink-0 text-[13.5px] pt-[1px]" style={{ fontFamily: SCENE_MONO, color: DIM }}>{left}</span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug [overflow-wrap:anywhere]" style={{ color: INK, fontWeight: strong ? 700 : 400 }}>{right}{sub && <span className="block text-[12.5px] font-normal" style={{ color: DIM }}>{sub}</span>}</span>
    </div>
  );
}
const Empty = ({ children }) => <p className="text-[14px] m-0" style={{ color: DIM }}>{children}</p>;

// The sheet as a printed page (black on white), same content as the PDF.
export function Page({ type, gig }) {
  const vi = gig.venue_info || {}, mi = gig.manager_info || {};
  const head = (
    <div className="mb-3">
      <div className="text-[20px] font-bold leading-tight" style={{ color: INK }}>{gig.event_name || gig.band_name || "Event"}</div>
      <div className="text-[12.5px]" style={{ color: DIM }}>{[gig.date ? new Date(`${gig.date}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "", gig.venue].filter(Boolean).join(" · ")}</div>
      <div className="text-[12.5px] font-semibold mt-0.5" style={{ color: DIM }}>{PIN_LABEL[type]}</div>
    </div>
  );
  let body = null;
  if (type === "schedule") {
    const run = runOfShowFor(gig);
    const notes = [["Address", vi.address], ["Load-in", vi.load_in_location], ["Parking", vi.parking], ["Load out by", vi.load_out_by]].filter(([, v]) => v && String(v).trim());
    body = (<>
      {run.length ? run.map((r, i) => <Row key={i} left={r.time || "--"} right={`${r.label}${r.kind === "curfew" && vi.hard_curfew ? " (hard)" : ""}`} strong={r.kind === "set" || r.kind === "doors" || r.kind === "curfew"} />) : <Empty>No times yet.</Empty>}
      {notes.length > 0 && <div className="mt-3 pt-2 border-t border-black/15">{notes.map(([k, v]) => <Row key={k} left={k} right={v} />)}</div>}
    </>);
  } else if (type === "lineup") {
    const acts = actsInOrder(gig);
    body = acts.length ? acts.map((a, i) => <Row key={a.name} left={a.time || `#${i + 1}`} right={a.name} sub={[a.headliner ? "Headliner" : "", a.length].filter(Boolean).join(" · ")} strong />) : <Empty>No acts yet.</Empty>;
  } else if (type === "setlist") {
    const lists = (mi.setlists || []).filter((s) => (s.songs || []).some((x) => x.kind !== "break" && String(x.title || "").trim()));
    body = lists.length ? lists.map((s) => {
      let num = 0;
      return (
        <div key={s.act} className="mb-4 last:mb-0">
          <div className="text-[12px] font-bold tracking-[0.1em] mb-1.5 pb-1 border-b border-black/20" style={{ color: DIM }}>{String(s.act).toUpperCase()}</div>
          {(s.songs || []).filter((x) => x.kind === "break" || String(x.title || "").trim()).map((x, i) => (x.kind === "break"
            ? <div key={x.id || i} role="separator" aria-label="Break" className="my-2 flex flex-col gap-[4px]"><span className="block h-[3px] bg-black" /><span className="block h-[3px] bg-black" /></div>
            : <div key={x.id || i} className="flex items-baseline gap-3 py-0.5"><span className="w-6 text-right text-[16px] font-bold" style={{ color: DIM }}>{++num}</span><span className="text-[19px] font-bold leading-tight [overflow-wrap:anywhere]" style={{ color: INK }}>{x.title}</span></div>))}
        </div>
      );
    }) : <Empty>No songs yet.</Empty>;
  } else if (type === "contacts") {
    const rows = contactRows(gig);
    body = rows.length ? rows.map(([role, name, phone, email], i) => (
      <div key={i} className="py-1.5 border-b border-black/10 last:border-b-0">
        <div className="text-[11.5px] font-bold tracking-[0.08em]" style={{ color: DIM }}>{String(role).toUpperCase()}</div>
        <div className="text-[15px] font-bold [overflow-wrap:anywhere]" style={{ color: INK }}>{name || "-"}</div>
        <div className="text-[13.5px] flex flex-wrap gap-x-3 [overflow-wrap:anywhere]">
          {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="underline" style={{ color: INK }}>{phone}</a>}
          {email && (email.includes("@") ? <a href={`mailto:${email}`} className="underline" style={{ color: DIM }}>{email}</a> : <span style={{ color: DIM }}>{email}</span>)}
        </div>
      </div>
    )) : <Empty>No contacts filled in yet.</Empty>;
  } else if (type === "guests") {
    const g = (mi.guests || []).filter((x) => x.name);
    const people = g.reduce((n, x) => n + 1 + (Number(x.plus) || 0), 0);
    body = g.length ? (<>
      <div className="text-[13px] font-semibold mb-1" style={{ color: DIM }}>{people} {people === 1 ? "person" : "people"} · {g.length} {g.length === 1 ? "name" : "names"}</div>
      {[...g].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })).map((x, i) => (
        <Row key={x.id || i} left={Number(x.plus) > 0 ? `+${Number(x.plus)}` : ""} right={x.name} sub={x.artist ? `Guest of ${x.artist}` : ""} strong />
      ))}
    </>) : <Empty>No one on the guest list yet.</Empty>;
  }
  return <div style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>{head}{body}</div>;
}

function buildPdf(type, gig, style) {
  const title = gig.event_name || gig.band_name || "Event";
  if (type === "schedule") return schedulePdf(gig, runOfShowFor(gig), style);
  if (type === "lineup") return lineupPdf(gig, style);
  if (type === "setlist") return setlistPdf(gig, gig.manager_info?.setlists, null, style);
  if (type === "contacts") return contactsPdf(gig, style);
  return guestListPdf({ kind: "guests", rows: gig.manager_info?.guests || [], eventName: title, eventDate: gig.date || null, venue: gig.venue || null, style });
}

// The preview window: the page, Save PDF (plain), Style, Edit.
export function Preview({ pin, gig, editable, onEdit, onClose }) {
  const [ready, setReady] = useState(null);
  const [styling, setStyling] = useState(false);
  const [msg, setMsg] = useState("");
  const c = COLOR[pin.by] || G;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !styling) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, styling]);
  const save = async () => {
    setMsg("");
    try { await saveOrShare(ready || buildPdf(pin.type, gig, DEFAULT_PDF_STYLE)); setReady(null); }
    catch (e) {
      if (e?.needsTap) { setReady(e.file); setMsg("Your PDF is ready. Tap Save PDF again to keep it."); }
      else setMsg("Couldn't make the PDF. Try again.");
    }
  };
  const btn = "h-10 px-3.5 rounded-full flex items-center gap-1.5 text-[14px] font-bold";
  return createPortal(<>
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/75" role="dialog" aria-modal="true" aria-label={`${PIN_LABEL[pin.type]} preview`} onClick={onClose}>
      <div className="w-full sm:max-w-[640px] max-h-[94vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[#121212] border border-[#262626] text-white" style={{ fontFamily: SCENE_FONT }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <span className="w-1.5 h-6 rounded-full shrink-0" style={{ background: c }} />
          <h2 className="flex-1 min-w-0 truncate text-[19px] font-bold leading-none">{PIN_LABEL[pin.type]}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4">
          <div className="mx-auto bg-white rounded-sm p-5 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.5)]" style={{ maxWidth: 560 }}>
            <Page type={pin.type} gig={gig} />
          </div>
        </div>
        {msg && <p className="px-4 pt-3 m-0 text-[14px]" style={{ color: ready ? G : "#FF6B6B" }}>{msg}</p>}
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          {editable && <button type="button" onClick={() => { onClose(); onEdit(); }} className={`${btn} text-white/85 border border-[#333]`}><Pencil className="w-4 h-4" /> Edit</button>}
          <span className="flex-1" />
          <button type="button" onClick={() => setStyling(true)} className={`${btn} border`} style={{ color: c, borderColor: `${c}66` }}><Palette className="w-4 h-4" /> Style</button>
          <button type="button" onClick={save} className={`${btn} text-[#0d0d0d]`} style={{ background: G }}><FileText className="w-4 h-4" /> Save PDF</button>
        </div>
      </div>
    </div>
    {styling && <PdfStyleSheet title={PIN_LABEL[pin.type]} eventName={gig.event_name || ""} previewLine={PIN_LABEL[pin.type]} onCreate={(style) => saveOrShare(buildPdf(pin.type, gig, style))} onClose={() => setStyling(false)} />}
  </>, document.body);
}

// A little paper page with a thumbtack: the real page, shrunk.
function Thumb({ pin, gig, i, onOpen }) {
  const c = COLOR[pin.by] || G;
  return (
    <button type="button" onClick={onOpen} aria-label={`${PIN_LABEL[pin.type]}. Open preview`} className="relative flex flex-col items-center gap-2 p-0 bg-transparent border-0 group" style={{ width: 112 }}>
      <span className="relative block bg-white rounded-[2px] overflow-hidden transition-transform group-hover:scale-[1.04]" aria-hidden="true"
        style={{ width: 104, height: 134, transform: `rotate(${TILT[i % TILT.length]}deg)`, boxShadow: "0 10px 18px rgba(0,0,0,0.55)" }}>
        <span className="absolute top-0 left-0 origin-top-left pointer-events-none" style={{ width: 360, padding: 18, transform: "scale(0.289)" }}>
          <Page type={pin.type} gig={gig} />
        </span>
      </span>
      <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-[13px] h-[13px] rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${c} 50%, #222)`, boxShadow: "0 2px 4px rgba(0,0,0,0.6)" }} />
      <span className="text-[13px] font-semibold text-white/85 text-center leading-tight">{PIN_LABEL[pin.type]}</span>
    </button>
  );
}

export default function PinnedBoard({ gig, canEdit = () => false, onEdit = null }) {
  const pins = gig ? readPins(gig) : [];
  const [openPin, setOpenPin] = useState(null);
  if (!pins.length) return null;
  const pin = pins.find((p) => p.type === openPin);
  const at = pin ? EDIT_AT[pin.type] : null;
  return (
    <section aria-label="Pinned" className="mb-4">
      <div className="flex items-center gap-2 mb-3 text-[11.5px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>
        <Pin className="w-3.5 h-3.5" style={{ color: G }} /> PINNED
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-4 pt-1.5 pl-1">
        {pins.map((p, i) => <Thumb key={p.type} pin={p} gig={gig} i={i} onOpen={() => setOpenPin(p.type)} />)}
      </div>
      {pin && <Preview pin={pin} gig={gig} editable={!!onEdit && canEdit(at[0])} onEdit={() => onEdit(at[1], at[2])} onClose={() => setOpenPin(null)} />}
    </section>
  );
}
