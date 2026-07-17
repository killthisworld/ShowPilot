import React from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Star } from "lucide-react";
import StatusBadge from "./StatusBadge";
import moment from "moment";

function getAccentColor(show) {
  if (show.starred) return "#F59E0B";          // amber — Starred
  if (show.status === "complete") return "#8CFF3D";  // green — Worked
  if (show.status === "in_progress") return "#60A5FA"; // blue — Frequent
  return "#555";                               // grey — New
}

export default function ShowCard({ show, genreTagMap = {} }) {
  const accentColor = getAccentColor(show);

  return (
    <Link to={`/show/${show.id}`} className="block group">
      <div className="relative bg-[#161616] rounded-2xl border border-[#222] overflow-hidden transition-all hover:border-[#333] hover:bg-[#1a1a1a]">
        <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ backgroundColor: accentColor }} />
        <div className="p-4 pl-5">
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="text-white font-semibold text-base truncate group-hover:text-[#8CFF3D] transition-colors">
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
            <StatusBadge status={show.status} />
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
    </Link>
  );
}
