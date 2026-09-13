import React from "react";

// Segment order is fixed so position always maps to the same role across
// every card - lets someone scanning a long list learn "3rd segment =
// Promoter" once and use it everywhere.
const SEGMENTS = [
  { key: "venue", color: "#60A5FA", label: "Venue" },
  { key: "manager", color: "#A78BFA", label: "Manager" },
  { key: "promoter", color: "#FB7185", label: "Promoter" },
  { key: "booking_agent", color: "#FBBF24", label: "Booking Agent" },
  { key: "performer", color: "#8CFF3D", label: "Performer" },
];

export default function GigProgressBar({ progress }) {
  if (!progress) return null;
  return (
    <div className="flex w-full h-1.5 rounded-t-xl overflow-hidden gap-[1px]">
      {SEGMENTS.map((seg) => {
        const data = progress[seg.key];
        const invited = !!data?.invited;
        const percent = Math.max(0, Math.min(1, data?.percent || 0));
        return (
          <div
            key={seg.key}
            className="flex-1 relative"
            style={{ backgroundColor: invited ? seg.color + "22" : "#2a2a2a" }}
            title={invited ? `${seg.label}: ${Math.round(percent * 100)}%` : `${seg.label}: not invited`}
          >
            {invited && (
              <div
                className="absolute inset-y-0 left-0 transition-all"
                style={{ width: `${percent * 100}%`, backgroundColor: seg.color }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
