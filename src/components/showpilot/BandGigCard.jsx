import React, { useState, useRef } from "react";
import { MapPin, Calendar, Star, Link2, Archive, Trash2 } from "lucide-react";
import GigProgressBar from "./GigProgressBar";

const SWIPE_WIDTH = 144;

export default function BandGigCard({ gig, progress, onOpen, onArchive, onDeleteRequest }) {
  const [offset, setOffset] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const moved = useRef(false);

  const onPointerDown = (e) => {
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX;
    startOffset.current = offset;
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 5) moved.current = true;
    let next = startOffset.current + delta;
    next = Math.max(-SWIPE_WIDTH, Math.min(0, next));
    setOffset(next);
  };
  const onPointerUp = () => {
    dragging.current = false;
    setOffset((o) => (o < -SWIPE_WIDTH / 2 ? -SWIPE_WIDTH : 0));
  };

  const handleCardClick = () => {
    if (moved.current) return;
    if (offset !== 0) { setOffset(0); return; }
    onOpen(gig);
  };

  const title = gig.event_name || gig.band_name || "Untitled Gig";
  const location = [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(" \u00b7 ");
  const ownerLabel = gig.is_owned ? "You" : (gig.owner_display_name || "Unknown");
  const accent = gig.is_owned ? "#8CFF3D" : "#F472B6";

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Action buttons, revealed as the card swipes left */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: SWIPE_WIDTH }}>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive?.(gig); setOffset(0); }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
        >
          <Archive className="w-4 h-4" />
          <span className="text-[10px] font-medium">Archive</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteRequest?.(gig); setOffset(0); }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-[10px] font-medium">{gig.is_owned ? "Delete" : "Remove"}</span>
        </button>
      </div>

      {/* Card content - slides left to reveal the actions behind it */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={handleCardClick}
        className={`w-full text-left bg-[#161616] rounded-2xl overflow-hidden transition-colors cursor-pointer select-none border ${gig.is_owned ? "border-[#222] hover:border-white/20" : "border-[#F472B6]/50 hover:border-[#F472B6]"}`}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging.current ? "none" : "transform 0.2s ease-out",
          touchAction: "pan-y",
        }}
      >
        <GigProgressBar progress={progress} />
        <div className="p-4 flex gap-3">
          <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0 w-4">
            {gig.starred && <Star className="w-4 h-4 text-amber-400" fill="currentColor" />}
            {(!gig.is_owned || gig.is_shared_by_me) && <Link2 className="w-4 h-4 text-[#F472B6]" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-white font-semibold text-sm truncate flex-1">{title}</p>
              <span className="text-xs font-medium px-2 py-1 rounded-md shrink-0" style={{ color: accent, backgroundColor: accent + "1a" }}>
                Owner: {ownerLabel}
              </span>
            </div>
            {location && (
              <div className="flex items-center gap-1.5 text-white/50 text-xs mt-1">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{location}</span>
              </div>
            )}
            {gig.date && (
              <div className="flex items-center gap-1.5 text-white/40 text-xs mt-0.5">
                <Calendar className="w-3 h-3 shrink-0" />
                <span>{new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
