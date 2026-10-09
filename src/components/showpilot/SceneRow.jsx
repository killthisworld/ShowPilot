import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Trash2 } from "lucide-react";
import { eventTypeColor, typeBarBackground } from "@/lib/eventTypes";
import EventTypeIcon from "@/components/showpilot/EventTypeIcon";
import FanPageButton from "@/components/showpilot/FanPageButton";
import { sceneAccent, scenePlace, sceneDate, sceneTitle, SCENE_COLORS, SCENE_MONO } from "@/lib/sceneStyle";

const SWIPE_WIDTH = 144;

// One line in the scene list (audio profile). Swipe left to reveal
// Archive / Delete, same as the old card; tap to open the show.
export default function SceneRow({ show, onArchive, onDeleteRequest }) {
  const navigate = useNavigate();
  const accent = sceneAccent(show);
  const typeColor = eventTypeColor(show.event_type);
  const [offset, setOffset] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const moved = useRef(false);

  const onPointerDown = (e) => { dragging.current = true; moved.current = false; startX.current = e.clientX; startOffset.current = offset; };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 5) moved.current = true;
    setOffset(Math.max(-SWIPE_WIDTH, Math.min(0, startOffset.current + delta)));
  };
  const onPointerUp = () => { dragging.current = false; setOffset((o) => (o < -SWIPE_WIDTH / 2 ? -SWIPE_WIDTH : 0)); };

  const open = () => {
    if (moved.current) return;
    if (offset !== 0) { setOffset(0); return; }
    if (show.is_owned === false) navigate(`/gig/web?token=${show.share_token}`);
    else navigate(`/show/${show.id}`);
  };

  return (
    <div className="relative overflow-hidden border-b border-[#1c1c1c] last:border-b-0">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: SWIPE_WIDTH }}>
        <button onClick={(e) => { e.stopPropagation(); onArchive?.(show); setOffset(0); }} className="flex-1 flex flex-col items-center justify-center gap-1 bg-blue-500/20 text-blue-300">
          <Archive className="w-4 h-4" /><span className="text-[10px] font-medium">Archive</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDeleteRequest?.(show); setOffset(0); }} className="flex-1 flex flex-col items-center justify-center gap-1 bg-red-500/20 text-red-400">
          <Trash2 className="w-4 h-4" /><span className="text-[10px] font-medium">Delete</span>
        </button>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={open}
        className="relative cursor-pointer select-none flex items-center gap-2.5 px-3 py-2.5"
        style={{ background: typeBarBackground(typeColor), boxShadow: typeColor ? `inset 4px 0 0 ${typeColor}` : undefined, paddingLeft: typeColor ? 16 : undefined, transform: `translateX(${offset}px)`, transition: dragging.current ? "none" : "transform 0.2s ease-out", touchAction: "pan-y" }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
        <EventTypeIcon type={show.event_type} imageUrl={show.icon_url} />
        <div className="min-w-0 flex-1">
          <div className="text-white font-semibold text-[17px] leading-tight truncate">{sceneTitle(show)}</div>
          <div className="flex items-center gap-1.5 min-w-0 text-white/50 text-[12.5px]">
            {typeColor && (
              <span className="shrink-0 text-[8.5px] tracking-[0.08em] px-[5px] py-px rounded-[3px]" style={{ fontFamily: SCENE_MONO, color: typeColor, background: typeColor + "1f" }}>
                {show.event_type.toUpperCase()}
              </span>
            )}
            <span className="truncate">
              {show.is_owned === false && <span style={{ color: SCENE_COLORS.linked }}>{show.owner_display_name ? `${show.owner_display_name} · ` : "Linked · "}</span>}
              {scenePlace(show)}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-white/60" style={{ fontFamily: SCENE_MONO }}>{sceneDate(show)}</span>
        <FanPageButton show={show} />
      </div>
    </div>
  );
}
