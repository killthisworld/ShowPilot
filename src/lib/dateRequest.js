// "Request a date" on a new event (job 329).
//
// An event's date can't be empty in the database, and many screens, emails and
// reminders count from it. So an event whose date isn't settled yet gets a
// stand-in date far in the future (it never lands on a real calendar, never
// reaches a countdown or an advance step), and what was asked for (months,
// nights, a note) is kept in manager_info.date_request. Screens that show an
// event's date use these helpers to say "Date requested" instead of the
// stand-in. Setting a real date on the event makes it a normal event again.
import { wantsLine } from "@/lib/bookingPackage";

export const DATE_TBD = "2099-12-31";

export const isDateTbd = (d) => String(d || "").slice(0, 10) === DATE_TBD;

// The date to show or edit: "" while it's only a request.
export const realDate = (d) => (isDateTbd(d) ? "" : d || "");

// "Mar 2027 · Fridays and Saturdays" from what was asked for ("" if nothing).
export const requestLine = (req) => (req ? wantsLine(req) : "");

// What a screen writes where the date goes. `gig` is the event row.
export function dateText(gig, fmt) {
  if (!gig) return "";
  if (isDateTbd(gig.date)) {
    const line = requestLine(gig.manager_info?.date_request);
    return line ? `Date requested: ${line}` : "Date requested";
  }
  return fmt ? fmt(gig.date) : gig.date || "";
}
