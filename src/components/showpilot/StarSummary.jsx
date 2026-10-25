import React, { useEffect, useState } from "react";
import { eventTitle } from "@/lib/eventTitle";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, MapPin, Link2 } from "lucide-react";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// What opens when you tap a star in a Logbook: your own (/logbook), a fellow
// pilot's (/logbook/public) and the desktop Cockpit preview all use this one
// card (job 73).
//
// It sits dead center of the screen (rendered into <body>, so no parent's
// scroll, overflow or transform can push it off center) and glows in the color
// of the star you tapped. Job 136: it reads like the company phone's event
// Overview - the event photo fills the top with the type, title, date and
// place over it. Just that: no event details below (Jay).
// `children` adds actions at the bottom (e.g. "Shared with").

export default function StarSummary({ show, color, onClose, children }) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, onClose]);

  useEffect(() => setBroken(false), [show?.icon_url]);

  if (!show) return null;

  const gig = show;
  const typeColor = eventTypeColor(gig.event_type) || (gig.is_linked ? "#F472B6" : "#8CFF3D");
  const accent = color || typeColor;
  const when = gig.date ? new Date(gig.date + "T00:00:00") : null;
  const place = [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const title = eventTitle(gig);
  const artist = gig.event_name && gig.band_name && gig.band_name !== gig.event_name ? gig.band_name : null;
  const photo = broken ? null : gig.icon_url;

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
        className="relative w-full max-w-sm max-h-full overflow-y-auto overscroll-contain rounded-2xl border bg-[#111111]"
        style={{ fontFamily: "Inter, system-ui, sans-serif", borderColor: accent + "66", boxShadow: `0 0 0 1px ${accent}22, 0 0 40px ${accent}40, 0 24px 48px rgba(0,0,0,0.6)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Photo header, like the event Overview: the picture fills it and the
            details sit over the bottom. No photo -> a glow in the star's color. */}
        <div className="relative isolate overflow-hidden rounded-t-2xl min-h-[230px] flex flex-col justify-end px-4 pb-4 pt-14">
          {photo ? (
            <img src={photo} alt="" onError={() => setBroken(true)} className="absolute inset-0 -z-10 w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 -z-10" style={{ background: `radial-gradient(120% 120% at 70% 0%, ${accent}55, #111111 70%)` }} />
          )}
          <span className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(17,17,17,0.2) 0%, rgba(17,17,17,0.55) 45%, #111111 100%)" }} />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 w-11 h-11 rounded-full bg-black/55 text-white/85 hover:text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>

          {(gig.event_type || gig.is_linked) && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {gig.event_type && (
                <span className="text-[10px] tracking-[0.1em] px-2 py-[3px] rounded" style={{ fontFamily: SCENE_MONO, color: typeColor, background: "rgba(0,0,0,0.55)", border: `1px solid ${typeColor}66` }}>
                  {gig.event_type.toUpperCase()}
                </span>
              )}
              {gig.is_linked && (
                <span className="flex items-center gap-1 text-[10px] tracking-[0.1em] px-2 py-[3px] rounded text-pink-300 bg-black/55 border border-pink-400/40" style={{ fontFamily: SCENE_MONO }}>
                  <Link2 className="w-3 h-3" /> LINKED
                </span>
              )}
            </div>
          )}
          <h2 className="m-0 text-[30px] leading-[1.05] font-bold text-white tracking-[0.02em] break-words" style={{ fontFamily: SCENE_FONT }}>{title}</h2>
          {artist && <p className="m-0 mt-0.5 text-white/70 text-sm truncate">{artist}</p>}
          <p className="m-0 mt-1.5 text-[12px] tracking-[0.08em] text-white/75 uppercase" style={{ fontFamily: SCENE_MONO }}>
            {[when ? when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "No date", gig.event_time].filter(Boolean).join(" · ")}
          </p>
          {place && (
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[14px] text-white/80">
              <MapPin className="w-4 h-4 shrink-0" style={{ color: typeColor }} />
              <span className="truncate">{place}</span>
            </p>
          )}
        </div>

        {children && (
          <div className="px-4 pb-4">
            {children}
          </div>
        )}
      </motion.div>
    </div>,
    document.body
  );
}
