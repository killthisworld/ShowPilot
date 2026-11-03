// An event's display title (job 158): its name, else the headliner, else the
// venue ("The Basement"; job 218 dropped the date next to it, it's shown under
// the title anyway), else the date - never "Untitled Gig".
export function eventTitle(e) {
  if (!e) return "New event";
  const name = String(e.event_name || "").trim() || String(e.band_name || "").trim();
  if (name) return name;
  const place = String(e.venue || "").trim() || String(e.location || "").trim()
    || [e.city, e.state].filter(Boolean).join(", ");
  const d = e.date ? new Date(String(e.date).slice(0, 10) + "T00:00:00") : null;
  const when = d && !isNaN(d) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  return place || when || "New event";
}
