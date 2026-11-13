import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, FileText, FolderOpen, ChevronRight } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { canWorkSection } from "@/lib/eventFeed";
import { SECTION_FOR_TYPE } from "@/lib/needsMe";
import { usePreferences } from "@/hooks/usePreferences";
import { buildRunOfShow } from "@/components/showpilot/RoleWorkspace";
import PdfMaker from "@/components/showpilot/PdfMaker";
import DocumentsUploader from "@/components/showpilot/DocumentsUploader";

// Create PDFs and Documents on a phone (job 73, Jay 2026-11-12: "pdf
// creation and document upload should be a thing to do in the task page").
// The same tools as desktop's Create PDFs corner and Documents page, for the
// side of the event you work on: Venue (venue_documents) or Manager / Artist
// (manager_info.documents). Saves re-read the event first, so nothing else
// changes. The server decides who's allowed (update_shared_gig /
// update_gig_section), same as desktop.

const SIDES = {
  venue: { label: "Venue", color: "#60A5FA", pdfRole: "venue" },
  manager: { label: "Manager / Artist", color: "#EF4444", pdfRole: "manager" },
};

async function readDocs(token, side) {
  const { data, error } = await supabase.rpc("get_shared_gig", { p_token: token });
  if (error || !data) throw error || new Error("Event not found");
  return { gig: data, docs: (side === "venue" ? data.venue_documents : data.manager_info?.documents) || [] };
}
async function writeDocs(token, side, docs) {
  if (side === "venue") {
    const { error } = await supabase.rpc("update_shared_gig", { p_token: token, p_updates: { venue_documents: docs } });
    if (error) throw error;
    return;
  }
  const { gig } = await readDocs(token, side); // manager_info is saved whole: keep the rest of it
  const { error } = await supabase.rpc("update_gig_section", { p_token: token, p_section: "manager", p_updates: { ...(gig.manager_info || {}), documents: docs } });
  if (error) throw error;
}

function DocsSheet({ gig, side, onClose }) {
  const token = gig.share_token;
  const s = SIDES[side];
  const [docs, setDocs] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    readDocs(token, side).then((r) => setDocs(r.docs)).catch((e) => { console.error(e); setErr("Couldn't load the documents."); setDocs([]); });
  }, [token, side]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const change = async (next) => {
    const before = docs;
    setDocs(next); setErr("");
    try { await writeDocs(token, side, next); }
    catch (e) { console.error(e); setDocs(before); setErr("Couldn't save that. Check your signal and try again."); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[70] bg-[#0d0d0d] overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="Documents" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="max-w-lg mx-auto px-5 pb-10">
        <div className="flex items-center pt-[max(14px,env(safe-area-inset-top))] -ml-2">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 flex items-center justify-center text-white"><ArrowLeft className="w-[22px] h-[22px]" /></button>
        </div>
        <div className="text-[11px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: s.color }}>{s.label.toUpperCase()} · DOCUMENTS</div>
        <h1 className="m-0 mt-1 text-[30px] leading-none tracking-[0.03em] font-bold text-white truncate" style={{ fontFamily: SCENE_FONT }}>{eventTitle(gig).toUpperCase()}</h1>
        <p className="m-0 mt-2 mb-5 text-[13.5px] text-white/55">Contracts, riders, flyers, photos: everyone on the event can open them.</p>
        {err && <p role="alert" className="m-0 mb-3 text-[13px] text-red-400">{err}</p>}
        {docs === null
          ? <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: s.color + "40", borderTopColor: s.color }} /></div>
          : <DocumentsUploader documents={docs} onChange={change} uploadPathPrefix={`gig_docs/${gig.id}/${side}`} editable label="Documents" />}
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

// Buttons: Create PDF + Documents for each side you work on. Hidden if none.
export default function EventPhoneTools({ gig, perms, onChanged }) {
  const [pdfFor, setPdfFor] = useState(null);
  const [docsFor, setDocsFor] = useState(null);
  const { preferences } = usePreferences();
  const sides = workSides(perms, preferences?.account_type);
  if (!gig?.id || !sides.length) return null;

  const addToDocs = (side) => async (file) => {
    const path = `gig_docs/${gig.id}/${side}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${file.name.replace(/[^\w .()\-]+/g, "_")}`;
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: new Error("timed out") }), 30_000));
    const { error } = await Promise.race([supabase.storage.from("input-files").upload(path, file, { contentType: "application/pdf" }), timeout]);
    if (error) { console.error(error); return false; }
    const { data } = supabase.storage.from("input-files").getPublicUrl(path);
    try {
      const { docs } = await readDocs(gig.share_token, side);
      await writeDocs(gig.share_token, side, [...docs, { url: data.publicUrl, name: file.name, type: "application/pdf" }]);
      onChanged?.();
      return true;
    } catch (e) { console.error(e); return false; }
  };

  const btn = "min-h-[52px] rounded-xl bg-[#161616] border border-[#262626] px-3 flex items-center gap-2.5 text-left active:bg-[#1c1c1c]";
  return (
    <section aria-label="Your tools" className="flex flex-col gap-2">
      {sides.map((side) => {
        const s = SIDES[side];
        const n = ((side === "venue" ? gig.venue_documents : gig.manager_info?.documents) || []).length;
        return (
          <div key={side} className="flex flex-col gap-1.5">
            {sides.length > 1 && <span className="text-[10.5px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: s.color }}>{s.label.toUpperCase()}</span>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPdfFor(side)} className={btn}>
                <FileText className="w-[18px] h-[18px] shrink-0" style={{ color: s.color }} />
                <span className="flex-1 min-w-0 text-[14.5px] font-semibold text-white">Create PDF</span>
                <ChevronRight className="w-4 h-4 text-white/35" />
              </button>
              <button type="button" onClick={() => setDocsFor(side)} className={btn}>
                <FolderOpen className="w-[18px] h-[18px] shrink-0" style={{ color: s.color }} />
                <span className="flex-1 min-w-0 text-[14.5px] font-semibold text-white">Documents{n ? <span className="text-white/45 font-normal"> · {n}</span> : null}</span>
                <ChevronRight className="w-4 h-4 text-white/35" />
              </button>
            </div>
          </div>
        );
      })}
      {pdfFor && (
        <PdfMaker gig={gig} role={SIDES[pdfFor].pdfRole} color={SIDES[pdfFor].color} runOfShow={buildRunOfShow(gig)}
          onAddToDocs={addToDocs(pdfFor)} docsLabel={`Add to ${SIDES[pdfFor].label} Documents on the event`} onClose={() => setPdfFor(null)} />
      )}
      {docsFor && <DocsSheet gig={gig} side={docsFor} onClose={() => { setDocsFor(null); onChanged?.(); }} />}
    </section>
  );
}
