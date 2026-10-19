import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ticket } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import FanPageSheet from "@/components/showpilot/FanPageSheet";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { FAN_SIDE_OPEN } from "@/lib/hiddenProfiles";

const G = "#8CFF3D";

// Two half-circle notches cut into the left and right edges, like a
// ticket. Same mask trick as TicketCard.
const NOTCH = 4;
const notch = (x) => `radial-gradient(circle at ${x} 50%, transparent ${NOTCH}px, #000 ${NOTCH + 0.5}px)`;
const TICKET_MASK = `${notch("0")}, ${notch("100%")}`;

// Is this event's fan page published right now? Owners read their own
// show; linked users go through get_fan_link (they can't read shows).
async function fetchLive(show) {
  if (show.is_owned !== false) {
    const { data } = await supabase.from("shows").select("fan_page_enabled").eq("id", show.id).single();
    return !!data?.fan_page_enabled;
  }
  const { data } = await supabase.rpc("get_fan_link", { p_share_token: show.share_token });
  return !!data?.enabled;
}

// Small button for an event bar. The owner opens the editor; anyone
// else linked to the event opens a read-only view of the fan page link.
// The sheet is portaled to the page body so a bar's own transform (swipe
// rows) can't trap its fixed positioning.
//
// ticket: tech event bars (job 72). Drawn as a small ticket and only shown
// while the event's fan page is published (show.fan_page_enabled). After
// the sheet closes it re-checks, so switching the page off hides it.
export default function FanPageButton({ show, className = "", ticket = false }) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(show.fan_page_enabled === true);
  useEffect(() => { setLive(show.fan_page_enabled === true); }, [show.fan_page_enabled]);

  const owned = show.is_owned !== false;
  if (!FAN_SIDE_OPEN) return null;
  if (owned ? !show.id : !show.share_token) return null;
  if (ticket && !live && !open) return null;

  const stop = (e) => e.stopPropagation();
  const close = () => {
    setOpen(false);
    if (ticket) fetchLive(show).then(setLive).catch(() => {});
  };
  const label = owned ? "Edit fan page" : "View fan page";
  const openSheet = (e) => { e.stopPropagation(); setOpen(true); };
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen(true); } };

  return (
    <>
      {ticket ? (
        <span
          role="button"
          tabIndex={0}
          aria-label={label}
          title={owned ? "Fan page is live · edit" : "Fan page is live · view"}
          onPointerDown={stop}
          onClick={openSheet}
          onKeyDown={onKey}
          className={`shrink-0 h-7 flex items-stretch rounded-[4px] cursor-pointer text-[9px] font-semibold tracking-[0.08em] hover:brightness-125 ${className}`}
          style={{ fontFamily: SCENE_MONO, color: G, background: `${G}26`, WebkitMaskImage: TICKET_MASK, maskImage: TICKET_MASK, WebkitMaskComposite: "source-in", maskComposite: "intersect" }}
        >
          <span className="flex items-center pl-2 pr-1.5" aria-hidden="true">
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: G, boxShadow: `0 0 4px ${G}` }} />
          </span>
          <span className="my-1" style={{ borderLeft: `1px dashed ${G}80` }} aria-hidden="true" />
          <span className="flex items-center pl-1.5 pr-2.5">FAN PAGE</span>
        </span>
      ) : (
        <span
          role="button"
          tabIndex={0}
          aria-label={label}
          title={owned ? "Fan page · edit" : "Fan page · view"}
          onPointerDown={stop}
          onClick={openSheet}
          onKeyDown={onKey}
          className={`shrink-0 h-7 px-2 rounded-md flex items-center gap-1 bg-[#8CFF3D]/10 border border-[#8CFF3D]/35 text-[#8CFF3D] hover:bg-[#8CFF3D]/20 cursor-pointer text-[9px] font-semibold tracking-[0.08em] ${className}`}
          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        >
          <Ticket className="w-3 h-3" /> FAN PAGE
        </span>
      )}
      {open && createPortal(
        <div onClick={stop} onPointerDown={stop}>
          <FanPageSheet showId={owned ? show.id : undefined} shareToken={owned ? undefined : show.share_token} onClose={close} />
        </div>,
        document.body
      )}
    </>
  );
}
