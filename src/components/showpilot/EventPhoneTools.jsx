import React, { useRef, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { FileText, ChevronRight } from "lucide-react";
import { useEventBusiness, fileRecord } from "@/lib/eventBusiness";
import { canWorkSection } from "@/lib/eventFeed";
import { SECTION_FOR_TYPE } from "@/lib/needsMe";
import { usePreferences } from "@/hooks/usePreferences";
import { buildRunOfShow } from "@/components/showpilot/RoleWorkspace";
import PdfMaker from "@/components/showpilot/PdfMaker";

// Create PDF on a phone's event task page (job 73, Jay 2026-11-12: "pdf
// creation ... should be a thing to do in the task page"), for the side of
// the event you work on. A PDF added from here is filed under the event's
// Paperwork > Other. The Paperwork button that sat here is gone (job 330,
// Jay 2026-11-18): the event's own Paperwork page has it all. The server
// decides who's allowed.

const SIDES = {
  venue: { label: "Venue", color: "#60A5FA", pdfRole: "venue" },
  manager: { label: "Manager / Artist", color: "#EF4444", pdfRole: "manager" },
};

// The sides of this event you work on, among Venue and Manager / Artist.
// The owner can edit everything, but on a phone gets their own account's
// side (plus anything they hold or were given), to keep it simple.
export function workSides(perms, accountType) {
  if (!perms) return [];
  const own = perms.is_owner ? SECTION_FOR_TYPE[accountType] : null;
  const asGuest = { ...perms, is_owner: false };
  return ["venue", "manager"].filter((s) => s === own || canWorkSection(s, asGuest) || (perms.is_owner && !own && canWorkSection(s, perms)));
}

// Create PDF, for each side you work on. Hidden if you work on neither side.
export default function EventPhoneTools({ gig, perms, onChanged }) {
  const [pdfFor, setPdfFor] = useState(null);
  // Pins this side made (Pin to board, job 314), saved straight away against
  // a fresh read, one at a time, like desktop (job 73, 2026-11-13).
  const [pinsLocal, setPinsLocal] = useState(null); // { venue: [...], manager: [...] } after a change
  const pinQueue = useRef(Promise.resolve());
  const { preferences } = usePreferences();
  const sides = workSides(perms, preferences?.account_type);
  const on = !!gig?.id && sides.length > 0;
  const { biz, reload } = useEventBusiness(on ? gig.id : null, on);
  if (!on) return null;
  const field = (side) => (side === "venue" ? "venue_info" : "manager_info");
  const pinsOf = (side) => {
    const l = pinsLocal?.[side] ?? gig[field(side)]?.pins;
    return Array.isArray(l) ? l : [];
  };
  const togglePin = (side) => (type) => {
    const pinning = !pinsOf(side).some((x) => x?.type === type);
    const run = pinQueue.current.then(async () => {
      const { data: fresh, error } = await supabase.rpc("get_shared_gig", { p_token: gig.share_token });
      if (error || !fresh) throw error || new Error("couldn't read the event");
      const info = fresh[field(side)] || {};
      const l = (Array.isArray(info.pins) ? info.pins : []).filter((x) => x && x.type !== type);
      const next = pinning ? [...l, { type, at: new Date().toISOString() }] : l;
      const updates = side === "venue" ? { venue_info: { ...info, pins: next } } : { ...info, pins: next };
      const { error: wErr } = await supabase.rpc("update_gig_section", { p_token: gig.share_token, p_section: side, p_updates: updates });
      if (wErr) throw wErr;
      setPinsLocal((m) => ({ ...(m || {}), [side]: next }));
      onChanged?.();
    });
    pinQueue.current = run.catch((e) => console.error(e));
    return run.catch(() => {});
  };
  // The gig as PdfMaker sees it, with pins just made here.
  const gigWithPins = pinsLocal ? {
    ...gig,
    ...(pinsLocal.venue ? { venue_info: { ...(gig.venue_info || {}), pins: pinsLocal.venue } } : {}),
    ...(pinsLocal.manager ? { manager_info: { ...(gig.manager_info || {}), pins: pinsLocal.manager } } : {}),
  } : gig;

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
      <div className={`grid gap-2 ${sides.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {sides.map((side) => (
          <button key={side} type="button" onClick={() => setPdfFor(side)} className={btn}>
            <FileText className="w-[18px] h-[18px] shrink-0" style={{ color: SIDES[side].color }} />
            <span className="flex-1 min-w-0 text-[14.5px] font-semibold text-white leading-tight">Create PDF{sides.length > 1 ? <span className="block text-[11.5px] font-normal text-white/50">{SIDES[side].label}</span> : null}</span>
            <ChevronRight className="w-4 h-4 text-white/35" />
          </button>
        ))}
      </div>
      {pdfFor && (
        <PdfMaker gig={gigWithPins} role={SIDES[pdfFor].pdfRole} color={SIDES[pdfFor].color} runOfShow={buildRunOfShow(gig)}
          ownPins={pinsOf(pdfFor).map((x) => x?.type)} onTogglePin={togglePin(pdfFor)}
          onAddToDocs={biz?.can_view ? addToPaperwork : null} docsLabel="Add to the event's Paperwork (Other)" onClose={() => setPdfFor(null)} />
      )}
    </section>
  );
}
