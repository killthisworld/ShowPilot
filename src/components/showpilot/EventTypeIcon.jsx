import React from "react";
import { Mic, Smile, Tent, Drama, Briefcase, PartyPopper, MessageSquare, CalendarDays } from "lucide-react";
import { eventTypeColor } from "@/lib/eventTypes";

const ICONS = {
  "concert": Mic,
  "comedy show": Smile,
  "festival": Tent,
  "theatre play": Drama,
  "corporate event": Briefcase,
  "private party": PartyPopper,
  "open mic": MessageSquare,
};

// Small tile for an event: its uploaded image if there is one, otherwise
// the icon for its type.
// Small colored tile showing the icon for an event's type. Custom types
// (no built-in icon) get a calendar glyph in their own stable color.
export default function EventTypeIcon({ type, imageUrl, size = 34 }) {
  const color = eventTypeColor(type);
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        className="shrink-0 object-cover"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), border: `1px solid ${color || "#333"}66`, background: "#161616" }}
      />
    );
  }
  if (!color) return null;
  const Icon = ICONS[(type || "").trim().toLowerCase()] || CalendarDays;
  return (
    <span
      className="shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), background: color + "1f", border: `1px solid ${color}44`, color }}
    >
      <Icon style={{ width: size * 0.53, height: size * 0.53 }} />
    </span>
  );
}
