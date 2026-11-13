import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Check, ChevronRight, ListMusic, ListOrdered, Pin, PinOff, Ticket, UserRound, Users, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import PdfStyleSheet from "@/components/showpilot/PdfStyleSheet";
import { guestListPdf, saveOrShare } from "@/lib/guestListPdf";
import { lineupPdf, schedulePdf, setlistPdf, contactsPdf, pdfCounts, readPins, PIN_TYPES } from "@/lib/eventPdfs";

// Create PDFs (job 313): the bottom-right feature on the Venue, Artist and
// Manager profiles. Pick a sheet, style it (color or picture background,
// font color), then save it to your phone and/or add it to this profile's
// Documents on the event so everyone invited can open it.
//   Lineup, Day-of schedule, Contact sheet: every one of these profiles
//   Set list: Artist and Manager only
//   Guest list: everyone here; RSVPs: when the event has a fan page you run
// onTogglePin(type) (job 314): pin a live sheet to the event's board, or
// take it off. ownPins: the types this profile has pinned.
export default function PdfMaker({ gig, role, color = "#8CFF3D", runOfShow = [], canRsvps = false, onAddToDocs, docsLabel = "Add to this event's Documents", initial = null, onClose, ownPins = [], onTogglePin = null }) {
  const counts = pdfCounts(gig);
  const title = gig.event_name || gig.band_name || "Event";
  const songActs = useMemo(() => (gig.manager_info?.setlists || []).filter((s) => (s.songs || []).some((x) => x.kind !== "break" && String(x.title || "").trim())).map((s) => s.act), [gig.manager_info?.setlists]);
  const [setAct, setSetAct] = useState(null); // null = all acts
  const [pick, setPick] = useState(typeof initial === "string" ? initial : null);
  const [rsvps, setRsvps] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!canRsvps || !gig.id) return;
    supabase.from("fan_rsvps").select("name, email, guests, artist_name, created_at").eq("show_id", gig.id).order("created_at", { ascending: true })
      .then(({ data }) => setRsvps(data || []));
  }, [canRsvps, gig.id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !pick) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pick]);

  const artistSide = role === "band" || role === "manager";
  const types = [
    { key: "lineup", label: "Lineup", icon: ListOrdered, sub: counts.acts ? `${counts.acts} act${counts.acts === 1 ? "" : "s"}, in playing order with set times` : "No acts on the lineup yet", ok: counts.acts > 0, docs: true },
    { key: "schedule", label: "Day-of schedule", icon: CalendarClock, sub: runOfShow.length ? `${runOfShow.length} time${runOfShow.length === 1 ? "" : "s"}, plus load-in, parking and Wi-Fi` : "No times yet", ok: runOfShow.length > 0, docs: true },
    artistSide && { key: "setlist", label: "Set list", icon: ListMusic, sub: counts.songs ? "Big type for the stage, one act per page" : "Add songs on the Set list page first", ok: counts.songs > 0, docs: true },
    { key: "contacts", label: "Contact sheet", icon: UserRound, sub: "Everyone on the event: role, name, phone, email", ok: true, docs: false },
    { key: "guests", label: "Guest list", icon: Ticket, sub: counts.guests ? `${counts.guests} name${counts.guests === 1 ? "" : "s"} with plus-ones, for the door` : "No one on the guest list yet", ok: counts.guests > 0, docs: false },
    canRsvps && { key: "rsvps", label: "RSVPs", icon: Users, sub: rsvps === null ? "Loading..." : rsvps.length ? `${rsvps.length} RSVP${rsvps.length === 1 ? "" : "s"}, for the door` : "No RSVPs yet", ok: !!rsvps?.length, docs: false },
  ].filter(Boolean);
  const current = types.find((t) => t.key === pick);
  const allPins = readPins(gig);
  const pinBtn = (t) => {
    if (!onTogglePin || !PIN_TYPES.includes(t.key)) return null;
    const mine = ownPins.includes(t.key);
    const other = !mine && allPins.find((p) => p.type === t.key);
    if (other) return <span className="shrink-0 flex items-center gap-1 text-[12px] text-white/45 px-2" title="Pinned by another profile"><Pin className="w-3.5 h-3.5" /> Pinned by {other.by === "venue" ? "Venue" : "Manager / Artist"}</span>;
    return (
      <button type="button" onClick={() => onTogglePin(t.key)} aria-pressed={mine} aria-label={mine ? `Unpin ${t.label}` : `Pin ${t.label} to the board`}
        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 mr-2 rounded-lg text-[12.5px] font-bold"
        style={mine ? { background: color, color: "#0d0d0d" } : { color, border: `1px solid ${color}66` }}>
        {mine ? <><PinOff className="w-3.5 h-3.5" /> Pinned</> : <><Pin className="w-3.5 h-3.5" /> Pin to board</>}
      </button>
    );
  };

  const build = (key, style) => {
    if (key === "lineup") return lineupPdf(gig, style);
    if (key === "schedule") return schedulePdf(gig, runOfShow, style);
    if (key === "setlist") return setlistPdf(gig, gig.manager_info?.setlists, setAct, style);
    if (key === "contacts") return contactsPdf(gig, style);
    if (key === "guests") return guestListPdf({ kind: "guests", rows: gig.manager_info?.guests || [], eventName: title, eventDate: gig.date || null, venue: gig.venue || null, style });
    if (key === "rsvps") return guestListPdf({ kind: "rsvps", rows: rsvps || [], eventName: title, eventDate: gig.date || null, venue: gig.venue || null, closeAt: gig.fan_page?.rsvp_close_at || null, style });
    return null;
  };
  const create = async (style, where = { phone: true, docs: false }) => {
    const file = build(pick, style);
    if (!file) throw new Error("no file");
    // Phone first: the share sheet needs the tap to still count.
    if (where.phone) await saveOrShare(file);
    if (where.docs && onAddToDocs) {
      const ok = await onAddToDocs(file);
      if (!ok) throw new Error("docs");
      setNote(`Added "${file.name}" to Documents.`);
    } else if (where.phone) setNote(`Made "${file.name}".`);
  };

  // The style screen sits beside the list (not inside it), so a tap on its
  // backdrop doesn't also close Create PDFs.
  return createPortal(<>
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/70" role="dialog" aria-modal="true" aria-label="Create PDFs" onClick={onClose}>
      <div className="w-full sm:max-w-[520px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#121212] border border-[#262626] p-5 text-white" style={{ fontFamily: SCENE_FONT, paddingBottom: "max(20px, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-[22px] font-bold leading-none">Create PDFs</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <p className="mt-2 mb-0 text-[14px] text-white/55">{title}. Pick a sheet, style it, then save it or add it to the event's Documents.{onTogglePin ? " Pin a sheet to keep it live on the event's home for everyone on the event." : ""}</p>
        {note && <p className="mt-3 mb-0 flex items-center gap-2 text-[14px]" style={{ color }}><Check className="w-4 h-4" /> {note}</p>}
        <div className="mt-4 flex flex-col gap-2">
          {types.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.key} className="rounded-xl bg-[#0b0b0b] border border-[#232323] overflow-hidden">
                <div className="flex items-center">
                <button type="button" disabled={!t.ok} onClick={() => { setNote(""); setPick(t.key); }} className="min-w-0 flex-1 flex items-center gap-3 px-3.5 py-3 text-left disabled:opacity-45">
                  <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1f`, color }}><Icon className="w-5 h-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-[16px] font-bold">{t.label}</span><span className="block text-[13px] text-white/55">{t.sub}</span></span>
                  {t.ok && <ChevronRight className="w-5 h-5 text-white/40 shrink-0" />}
                </button>
                {pinBtn(t)}
                </div>
                {t.key === "setlist" && songActs.length > 1 && (
                  <div className="px-3.5 pb-3 -mt-1 flex flex-wrap gap-1.5" aria-label="Which act">
                    {[[null, "All acts"], ...songActs.map((a) => [a, a])].map(([k, l]) => (
                      <button key={l} type="button" onClick={() => setSetAct(k)} className="px-2.5 py-1 rounded-full text-[13px] font-semibold"
                        style={setAct === k ? { background: color, color: "#0d0d0d" } : { color: "rgba(255,255,255,0.7)", border: "1px solid #333" }}>{l}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 mb-0 text-[12.5px] text-white/40" style={{ fontFamily: SCENE_MONO }}>Contact sheets and door lists aren't added to Documents unless you switch it on, since they hold phone numbers and emails.</p>
      </div>
    </div>
    {current && (
      <PdfStyleSheet title={current.label} eventName={title} previewLine={current.sub} onCreate={create} onClose={() => setPick(null)}
        destinations={onAddToDocs ? { docsLabel, docsDefault: current.docs } : null} />
    )}
  </>, document.body);
}
