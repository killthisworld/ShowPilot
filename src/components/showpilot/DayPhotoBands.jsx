import React from "react";
import { SCENE_MONO } from "@/lib/sceneStyle";

// A calendar day box filled with its events' photos (the same image as the
// event bar). One event fills the whole box; two split it into a top and a
// bottom half; three or more stack up to `max` bands, with "+N" on the last.
// An event without a photo keeps its band in its type color, so a split day
// always reads as two events.
//
// Sits behind the day number: the parent cell should be `relative
// overflow-hidden` and render its number with `relative z-10`.
export function hasDayPhotos(events) {
  return (events || []).some((e) => e?.icon_url);
}

export default function DayPhotoBands({
  events,
  colorOf,
  keyOf,
  titleOf = (e) => e.event_name || e.band_name || "Untitled",
  onOpen,          // when set, each band is a button that opens its event
  max = 3,
  titleClass = "text-[13px]",
  showTitles = true,
  dim = false,     // days outside the month / past days can sit back
}) {
  const shown = events.slice(0, max);
  const extra = events.length - shown.length;
  return (
    <div className="absolute inset-0 flex flex-col">
      {shown.map((e, i) => {
        const color = colorOf(e);
        const last = i === shown.length - 1;
        const Tag = onOpen ? "button" : "div";
        return (
          <Tag
            key={keyOf(e)}
            type={onOpen ? "button" : undefined}
            onClick={onOpen ? (ev) => { ev.stopPropagation(); onOpen(e); } : undefined}
            className={`relative flex-1 min-h-0 overflow-hidden text-left ${onOpen ? "hover:brightness-110" : ""}`}
            style={{
              background: color + "33",
              borderTop: i > 0 ? "1px solid rgba(0,0,0,0.75)" : undefined,
              opacity: dim ? 0.45 : 1,
            }}
            aria-label={onOpen ? `Open ${titleOf(e)}` : undefined}
          >
            {e.icon_url && (
              <img src={e.icon_url} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
            )}
            {/* Shade: darker at the top of the first band (day number) and at the bottom of every band (title). */}
            <span
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background: i === 0
                  ? "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 38%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.78) 100%)"
                  : "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.78) 100%)",
              }}
            />
            <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: color }} />
            {showTitles && (
              <span className={`absolute left-[7px] right-1 bottom-[3px] block font-semibold leading-[1.1] text-white truncate ${titleClass}`} style={{ textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>
                {titleOf(e)}
              </span>
            )}
            {last && extra > 0 && (
              <span className="absolute right-1 top-1 text-[9px] px-1 rounded bg-black/70 text-white/85" style={{ fontFamily: SCENE_MONO }}>+{extra}</span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}
