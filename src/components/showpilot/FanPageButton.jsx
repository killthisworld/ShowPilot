import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Ticket } from "lucide-react";
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
        aria-label={owned ? "Edit fan page" : "View fan page"}
        title={owned ? "Fan page · edit" : "Fan page · view"}
        onPointerDown={stop}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen(true); } }}
        className={`shrink-0 h-7 px-2 rounded-md flex items-center gap-1 bg-[#8CFF3D]/10 border border-[#8CFF3D]/35 text-[#8CFF3D] hover:bg-[#8CFF3D]/20 cursor-pointer text-[9px] font-semibold tracking-[0.08em] ${className}`}
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        <Ticket className="w-3 h-3" /> FAN PAGE
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
