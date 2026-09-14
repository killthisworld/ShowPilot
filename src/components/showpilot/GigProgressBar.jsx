import React from "react";

// Segment order is fixed so position always maps to the same role across
// every card - lets someone scanning a long list learn "2nd segment =
// Promoter" once and use it everywhere. Manager and Band/Performer info
// share one segment since either can fill in the same underlying data.
const SEGMENTS = [
  { key: "venue", color: "#F97316", label: "Venue" },
  { key: "promoter", color: "#60A5FA", label: "Promoter" },
  { key: "booking_agent", color: "#C026D3", label: "Booking" },
  { key: "manager_band", color: "#EF4444", label: "Manager/Band" },
];

// Home's progress bar key differs slightly from the included_sections key
// for the combined section ("manager_band" here vs "manager" there).
const INCLUDED_SECTION_KEY = {
  venue: "venue",
  promoter: "promoter",
  booking_agent: "booking_agent",
  manager_band: "manager",
};

export default function GigProgressBar({ progress }) {
  if (!progress) return null;
  const includedSections = progress.included_sections;
  const visibleSegments = SEGMENTS.filter(
    (seg) => !includedSections || includedSections.includes(INCLUDED_SECTION_KEY[seg.key])
  );
  if (visibleSegments.length === 0) return null;
  return (
    <div className="flex w-full gap-1.5 p-2">
      {visibleSegments.map((seg) => {
        const data = progress[seg.key];
        const invited = !!data?.invited;
        const percent = Math.max(0, Math.min(1, data?.percent || 0));
        const labelColor = invited ? seg.color : "rgba(255,255,255,0.3)";
        return (
          <div
            key={seg.key}
            className="flex-1 relative h-8 rounded-md border-2 overflow-hidden flex items-center justify-center"
            style={{ borderColor: seg.color }}
            title={invited ? `${seg.label}: ${Math.round(percent * 100)}%` : `${seg.label}: not invited`}
          >
            {invited && (
              <div
                className="absolute inset-y-0 left-0 transition-all"
                style={{ width: `${percent * 100}%`, backgroundColor: seg.color + "33" }}
              />
            )}
            <span
              className="relative z-10 text-[9px] font-bold uppercase tracking-wide px-1 truncate"
              style={{ color: labelColor }}
            >
              {seg.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
