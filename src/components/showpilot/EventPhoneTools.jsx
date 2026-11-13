import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, FileText, FolderOpen, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useEventBusiness, fileRecord } from "@/lib/eventBusiness";
import EventPaperwork from "@/components/showpilot/EventPaperwork";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { canWorkSection } from "@/lib/eventFeed";
import { SECTION_FOR_TYPE } from "@/lib/needsMe";
import { usePreferences } from "@/hooks/usePreferences";
import { buildRunOfShow } from "@/components/showpilot/RoleWorkspace";
import PdfMaker from "@/components/showpilot/PdfMaker";

// Create PDFs and Paperwork on a phone (job 73, Jay 2026-11-12: "pdf
// creation and document upload should be a thing to do in the task page").
// The same tools as desktop: the Create PDFs corner, and Paperwork (the
// event's files since job 171: deal, agreement, rider, advance, insurance,
// other), for the side of the event you work on. A PDF added from here is
// filed under Paperwork's Other section. The server decides who's allowed.

const SIDES = {
  venue: { label: "Venue", color: "#60A5FA", pdfRole: "venue" },
  manager: { label: "Manager / Artist", color: "#EF4444", pdfRole: "manager" },
};

function PaperworkSheet({ gig, biz, color, userId, onChanged, onClose }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[#0d0d0d] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Paperwork" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg mx-auto px-5 pb-10">
        <div className="flex items-center pt-[max(14px,env(safe-area-inset-top))] -ml-2">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white"><ArrowLeft className="w-[22px] h-[22px]" /></button>
        </div>
        <div className="text-[11px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color }}>PAPERWORK</div>
        <h1 className="m-0 mt-1 text-[30px] leading-[1.05] tracking-[0.03em] font-bold text-white break-words" style={{ fontFamily: SCENE_FONT }}>{eventTitle(gig).toUpperCase()}</h1>
        <p className="m-0 mt-2 mb-5 text-[13.5px] text-white/55">The deal, agreement, rider, advance, insurance and other files. The venue side and the manager / artist side see these; crew don't.</p>
        {biz ? <EventPaperwork gig={gig} biz={biz} onChanged={onChanged} color={color} userId={userId} /> : null}
      </div>
    </div>,
    document.body
  );
}

// The sides of this event you work on, among Venue and Manager / Artist.
// The owner can edit everything, but on a phone gets their own account's
// side (plus anything they hold or were given), to keep it simple.
export function workSides(perms, accountType) {
  if (!perms) return [];
  const own = perms.is_owner ? SECTION_FOR_TYPE[accountType] : null;
  const asGuest = { ...perms, is_owner: false };
  return ["venue", "manager"].filter((s) => s === own || canWorkSection(s, asGuest) || (perms.is_owner && !own && canWorkSection(s, perms)));
}

// Buttons: Create PDF (for each side you work on) + Paperwork. Hidden if
// you work on neither side.
export default function EventPhoneTools({ gig, perms, onChanged }) {
  const [pdfFor, setPdfFor] = useState(null);
  const [papers, setPapers] = useState(false);
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const sides = workSides(perms, preferences?.account_type);
  const on = !!gig?.id && sides.length > 0;
  const { biz, reload } = useEventBusiness(on ? gig.id : null, on);
  if (!on) return null;
  const color = SIDES[sides[0]].color;
  const count = (biz?.records || []).length;

  // A PDF made here goes into Paperwork > Other, where the event's files live.
  const addToPaperwork = async (file) => {
    try {
      await fileRecord(gig.id, { kind: "other", title: file.name.replace(/\.pdf$/i, ""), file });
      reload?.(); onChanged?.();
      return true;
    } catch (e) { console.error(e); return false; }
  };

  const btn = "min-h-[52px] rounded-xl bg-[#161616] border border-[#262626] px-3 flex items-center gap-2.5 text-left active:bg-[#1c1c1c]";
  return (
    <section aria-label="Your tools" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {sides.map((side) => (
          <button key={side} type="button" onClick={() => setPdfFor(side)} className={btn}>
            <FileText className="w-[18px] h-[18px] shrink-0" style={{ color: SIDES[side].color }} />
            <span className="flex-1 min-w-0 text-[14.5px] font-semibold text-white leading-tight">Create PDF{sides.length > 1 ? <span className="block text-[11.5px] font-normal text-white/50">{SIDES[side].label}</span> : null}</span>
            <ChevronRight className="w-4 h-4 text-white/35" />
          </button>
        ))}
        {biz?.can_view && (
          <button type="button" onClick={() => setPapers(true)} className={btn}>
            <FolderOpen className="w-[18px] h-[18px] shrink-0" style={{ color }} />
            <span className="flex-1 min-w-0 text-[14.5px] font-semibold text-white">Paperwork{count ? <span className="text-white/45 font-normal"> · {count}</span> : null}</span>
            <ChevronRight className="w-4 h-4 text-white/35" />
          </button>
        )}
      </div>
      {pdfFor && (
        <PdfMaker gig={gig} role={SIDES[pdfFor].pdfRole} color={SIDES[pdfFor].color} runOfShow={buildRunOfShow(gig)}
          onAddToDocs={biz?.can_view ? addToPaperwork : null} docsLabel="Add to the event's Paperwork (Other)" onClose={() => setPdfFor(null)} />
      )}
      {papers && <PaperworkSheet gig={gig} biz={biz} color={color} userId={user?.id} onChanged={() => { reload?.(); onChanged?.(); }} onClose={() => setPapers(false)} />}
    </section>
  );
}
