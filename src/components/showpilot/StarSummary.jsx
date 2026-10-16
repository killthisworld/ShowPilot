import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, MapPin, Link2, Star } from "lucide-react";
import StatusStrip from "@/components/showpilot/StatusStrip";
import EventTypeIcon from "@/components/showpilot/EventTypeIcon";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// What opens when you tap a star in a Logbook: your own (/logbook), a fellow
// pilot's (/logbook/public) and the desktop Cockpit preview all use this one
// card (job 73).
//
// It sits dead center of the screen (rendered into <body>, so no parent's
// scroll, overflow or transform can push it off center), glows in the color
// of the star you tapped, and leads with the event photo when there is one.
// `children` adds actions under the details (e.g. "Shared with").
export default function StarSummary({ show, color, onClose, children }) {
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, onClose]);

  if (!show) return null;

  const typeColor = eventTypeColor(show.event_type) || (show.is_linked ? "#F472B6" : "#8CFF3D");
  const accent = color || typeColor;
  const when = show.date ? new Date(show.date + "T00:00:00") : null;
  const place = [show.venue, [show.city, show.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const title = show.event_name || show.band_name || show.venue || "Untitled";
  const artist = show.event_name && show.band_name && show.band_name !== show.event_name ? show.band_name : null;
  const photo = show.icon_url;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      style={{
        padding: "max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))",
        height: "100dvh",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative w-full max-w-sm max-h-full overflow-y-auto rounded-2xl border bg-[#111111]"
        style={{ fontFamily: SCENE_FONT, borderColor: accent + "66", boxShadow: `0 0 0 1px ${accent}22, 0 0 40px ${accent}40, 0 24px 48px rgba(0,0,0,0.6)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: the event photo, or a glow in the star's color. */}
        <div className="relative h-32 overflow-hidden rounded-t-2xl" style={{ background: `radial-gradient(120% 140% at 50% 0%, ${accent}55 0%, ${accent}14 45%, #111111 80%)` }}>
          {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(17,17,17,0) 30%, #111111 100%)" }} />
          <span
            className="absolute left-4 top-3.5 flex items-center gap-1.5 text-[10px] tracking-[0.16em] px-2 py-1 rounded-full bg-black/50"
            style={{ fontFamily: SCENE_MONO, color: accent }}
          >
            <Star className="w-3 h-3" fill={accent} strokeWidth={0} /> LOGBOOK
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 w-9 h-9 rounded-full bg-black/55 text-white/80 hover:text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative -mt-8 px-4 flex items-end gap-3">
          <div className="shrink-0 rounded-xl p-[3px] bg-[#111111]" style={{ boxShadow: `0 0 0 1.5px ${accent}88` }}>
            <EventTypeIcon type={show.event_type || "Other"} imageUrl={photo} size={52} />
          </div>
          <div className="min-w-0 flex-1 pb-0.5">
            <h2 className="m-0 text-white font-semibold text-[26px] leading-[1.05] tracking-wide break-words">{title}</h2>
            {artist && <p className="m-0 mt-0.5 text-white/60 text-sm truncate" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>{artist}</p>}
          </div>
        </div>

        {(show.event_type || show.is_linked) && (
          <div className="flex items-center gap-1.5 flex-wrap px-4 pt-2.5">
            {show.event_type && (
              <span className="text-[10px] tracking-[0.08em] px-2 py-[3px] rounded-[4px]" style={{ fontFamily: SCENE_MONO, color: typeColor, background: typeColor + "1f" }}>
                {show.event_type.toUpperCase()}
              </span>
            )}
            {show.is_linked && (
              <span className="flex items-center gap-1 text-[10px] tracking-[0.08em] px-2 py-[3px] rounded-[4px] text-pink-400 bg-pink-500/10" style={{ fontFamily: SCENE_MONO }}>
                <Link2 className="w-3 h-3" /> LINKED
              </span>
            )}
          </div>
        )}

        <div className="px-4 pt-3">
          <StatusStrip
            cells={[
              { label: "DATE", value: when ? when.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase() : "—", color: accent },
              { label: "YEAR", value: when ? String(when.getFullYear()) : "—", color: "#ffffff" },
              { label: "DAY", value: when ? when.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase() : "—", color: "#60A5FA" },
            ]}
          />
        </div>

        {place && (
          <div className="px-4 pt-2.5">
            <div className="flex items-center gap-2 bg-[#0d0d0d] border border-[#1f1f1f] rounded-[10px] px-3 py-2.5">
              <MapPin className="w-4 h-4 shrink-0" style={{ color: accent }} />
              <span className="text-white/80 text-[12px] leading-snug uppercase" style={{ fontFamily: SCENE_MONO }}>{place}</span>
            </div>
          </div>
        )}

        <div className="p-4 pt-3">{children}</div>
      </motion.div>
    </div>,
    document.body
  );
}
