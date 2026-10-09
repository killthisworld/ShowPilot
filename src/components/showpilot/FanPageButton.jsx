import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Share2 } from "lucide-react";
import FanPageSheet from "@/components/showpilot/FanPageSheet";

// Small icon button for an event bar. The owner opens the editor; anyone
// else linked to the event opens a read-only view of the fan page link.
// The sheet is portaled to the page body so a bar's own transform (swipe
// rows) can't trap its fixed positioning.
export default function FanPageButton({ show, className = "" }) {
  const [open, setOpen] = useState(false);
  const owned = show.is_owned !== false;
  if (owned ? !show.id : !show.share_token) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={owned ? "Edit event page for fans" : "View event page for fans"}
        title={owned ? "Event page · edit" : "Event page · view"}
        onPointerDown={stop}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen(true); } }}
        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-black/30 border border-white/10 text-white/55 hover:text-[#8CFF3D] hover:border-[#8CFF3D]/50 cursor-pointer ${className}`}
      >
        <Share2 className="w-3.5 h-3.5" />
      </span>
      {open && createPortal(
        <div onClick={stop} onPointerDown={stop}>
          <FanPageSheet showId={owned ? show.id : undefined} shareToken={owned ? undefined : show.share_token} onClose={() => setOpen(false)} />
        </div>,
        document.body
      )}
    </>
  );
}
