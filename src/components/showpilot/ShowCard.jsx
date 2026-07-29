import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, MapPin, Star, Archive, Trash2, Building2, Mic } from "lucide-react";
import StatusBadge from "./StatusBadge";
import moment from "moment";

function getAccentColor(show) {
  if (show.starred) return "#F59E0B";          // amber — Starred
  if (show.status === "complete") return "#8CFF3D";  // green — Worked
  if (show.status === "in_progress") return "#60A5FA"; // blue — Frequent
  return "#555";                               // grey — New
}

const SWIPE_WIDTH = 144;

export default function ShowCard({ show, genreTagMap = {}, onArchive, onDeleteRequest }) {
  const accentColor = getAccentColor(show);
  const navigate = useNavigate();
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
    if (moved.current) return; // this was a swipe, not a tap
    if (offset !== 0) { setOffset(0); return; } // tap while open just closes the actions
    navigate(`/show/${show.id}`);
  };

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Action buttons, revealed as the card swipes left */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: SWIPE_WIDTH }}>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive?.(show); setOffset(0); }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
        >
          <Archive className="w-4 h-4" />
          <span className="text-[10px] font-medium">Archive</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteRequest?.(show); setOffset(0); }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-[10px] font-medium">Delete</span>
        </button>
      </div>

      {/* Card content — slides left to reveal the actions behind it */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={handleCardClick}
        className="relative bg-[#161616] border border-[#222] overflow-hidden hover:border-[#333] hover:bg-[#1a1a1a] cursor-pointer select-none"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging.current ? "none" : "transform 0.2s ease-out",
          touchAction: "pan-y",
        }}
      >
        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: accentColor }} />
        <div className="p-4 pl-5">
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-white font-semibold text-base truncate">
                  {show.band_name}
                </h3>
                {show.starred && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="currentColor" />}
              </div>
              {show.venue && (
                <div className="flex items-center gap-1.5 mt-1 text-white/50 text-sm">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{show.venue}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {show.frequency_scope === "venue" && <Building2 className="w-3.5 h-3.5" style={{ color: accentColor }} title="Venue" />}
              {show.frequency_scope === "artist" && <Mic className="w-3.5 h-3.5" style={{ color: accentColor }} title="Artist / Band" />}
              {show.frequency_scope === "both" && (
                <span className="flex items-center gap-0.5" style={{ color: accentColor }} title="Venue & Artist">
                  <Building2 className="w-3 h-3" />
                  <Mic className="w-3 h-3" />
                </span>
              )}
              <StatusBadge status={show.status} />
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {moment(show.date).format("MMM D, YYYY")}
            </span>
          </div>
          {show.genre_tags && show.genre_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {show.genre_tags.map((tag, i) => {
                const color = genreTagMap[tag];
                return (
                  <span
                    key={i}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full border"
                    style={color ? { backgroundColor: color + "22", color, borderColor: color + "44" } : { backgroundColor: "#222", color: "rgba(255,255,255,0.6)", borderColor: "#333" }}
                  >
                    {tag}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
