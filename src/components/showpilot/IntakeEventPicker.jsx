import React, { useMemo, useState } from "react";
import { ChevronDown, Plus, Check, X } from "lucide-react";
import TicketCard from "@/components/showpilot/TicketCard";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// "Event" on the Performer Intake link form (job 160 / 162): which event the
// link is for. Closed it shows the choice (New event, or the picked event's
// ticket with an x to go back to New event) and a chevron. Open it lists only
// what's ahead: this month's and next month's events as tickets, then a
// "Later months" dropdown to pick a month further out. No past months.
//
// shows: your own events. value: the picked event's id, "" = new event.
// colorOf(show): the ticket stub color.
const PURPLE = "#a855f7";

const monthKey = (d) => d.slice(0, 7);
const monthName = (key, withYear = true) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", withYear ? { month: "long", year: "numeric" } : { month: "long" }).toUpperCase();
};

function EventTicket({ show, colorOf, onClick, picked = false }) {
  return (
    <TicketCard
      color={colorOf(show)}
      date={show.date}
      photo={show.icon_url}
      compact
      stubWidth={46}
      notch={6}
      shadow={false}
      ariaLabel={eventTitle(show)}
      onClick={onClick}
    >
      <div className="h-full min-h-[40px] flex items-center gap-2">
        <span className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <span className="text-[14px] font-bold leading-tight text-white line-clamp-2 break-words" style={{ fontFamily: SCENE_FONT }}>{eventTitle(show)}</span>
          {show.venue && (show.event_name || show.band_name) && (
            <span className="text-[9.5px] tracking-[0.06em] text-white/65 truncate" style={{ fontFamily: SCENE_MONO }}>{String(show.venue).toUpperCase()}</span>
          )}
        </span>
        {picked && <Check className="w-4 h-4 shrink-0" style={{ color: PURPLE }} />}
      </div>
    </TicketCard>
  );
}

// A small upright ticket (job 163) so three fit across: date on the stub at
// the top, a perforation, the title below, on the event's picture.
function MiniTicket({ show, colorOf, onClick, picked = false }) {
  const color = colorOf(show);
  const d = new Date(show.date + "T00:00:00");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={eventTitle(show)}
      aria-pressed={picked}
      className="relative isolate overflow-hidden rounded-[10px] border text-left flex flex-col min-h-[104px]"
      style={{ borderColor: picked ? PURPLE : "#262626", boxShadow: picked ? `0 0 0 1px ${PURPLE}` : undefined, background: "#151515" }}
    >
      {show.icon_url && <img src={show.icon_url} alt="" className="absolute inset-0 -z-10 w-full h-full object-cover opacity-50" />}
      <span className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg, rgba(21,21,21,0.35), rgba(21,21,21,0.92) 70%)" }} />
      <span className="flex items-baseline justify-center gap-1 py-1.5" style={{ background: `linear-gradient(160deg, ${color}55, ${color}22)`, fontFamily: SCENE_MONO, color }}>
        <span className="text-[9px] tracking-[0.1em]">{d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</span>
        <span className="text-[18px] font-bold leading-none text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{d.getDate()}</span>
      </span>
      <span aria-hidden="true" className="mx-1.5 border-t-2 border-dashed border-white/20" />
      <span className="flex-1 px-2 py-1.5 flex flex-col gap-0.5">
        <span className="text-[12.5px] font-bold leading-tight text-white line-clamp-2 break-words" style={{ fontFamily: SCENE_FONT }}>{eventTitle(show)}</span>
        {show.venue && (show.event_name || show.band_name) && (
          <span className="text-[8.5px] tracking-[0.05em] text-white/60 truncate" style={{ fontFamily: SCENE_MONO }}>{String(show.venue).toUpperCase()}</span>
        )}
      </span>
      {picked && <Check className="absolute top-1 right-1 w-3.5 h-3.5" style={{ color: "#fff" }} />}
    </button>
  );
}

const MonthLabel = ({ children, count }) => (
  <div className="flex items-center gap-2 px-1 pt-1 text-[11px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>
    <span>{children}</span>
    <span className="text-white/35">{count}</span>
  </div>
);

export default function IntakeEventPicker({ shows, value, onChange, colorOf }) {
  const [open, setOpen] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  const [laterMonth, setLaterMonth] = useState("");
  const picked = value ? shows.find((s) => s.id === value) : null;
  const choose = (id) => { onChange(id); setOpen(false); };

  // Upcoming only (today on), by month, in date order.
  const { thisKey, nextKey, byMonth, laterKeys } = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const thisK = today.slice(0, 7);
    const nextK = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, "0")}`;
    const map = new Map();
    shows
      .filter((s) => s.date && s.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((s) => { const k = monthKey(s.date); if (!map.has(k)) map.set(k, []); map.get(k).push(s); });
    return { thisKey: thisK, nextKey: nextK, byMonth: map, laterKeys: [...map.keys()].filter((k) => k > nextK) };
  }, [shows]);

  // Three small tickets across (job 163), so a busy month stays short.
  const list = (k) => (
    <div className="grid grid-cols-3 gap-1.5">
      {(byMonth.get(k) || []).map((s) => (
        <MiniTicket key={s.id} show={s} colorOf={colorOf} picked={s.id === value} onClick={() => choose(s.id)} />
      ))}
    </div>
  );
  const nothingAhead = byMonth.size === 0;

  return (
    <div>
      {/* The closed dropdown: the current choice + chevron. */}
      <div className={`mt-1 w-full flex items-center gap-1 rounded-xl border bg-[#111] transition-colors ${open ? "border-[#a855f7]/60" : "border-[#2a2a2a]"} ${picked ? "p-1.5" : ""}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Event: ${picked ? eventTitle(picked) : "New event"}`}
          className={`flex-1 min-w-0 flex items-center gap-2 text-left ${picked ? "" : "h-11 px-3"}`}
        >
          <span className="flex-1 min-w-0">
            {picked ? (
              <span className="pointer-events-none block"><EventTicket show={picked} colorOf={colorOf} /></span>
            ) : (
              <span className="flex items-center gap-2 text-white text-sm"><Plus className="w-4 h-4" style={{ color: PURPLE }} /> New event</span>
            )}
          </span>
          <ChevronDown className="w-5 h-5 shrink-0 text-white/60 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
        {picked && (
          <button type="button" onClick={() => choose("")} aria-label="Back to New event" className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-white/50 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-2 max-h-[46vh] overflow-y-auto overscroll-contain space-y-2">
          {nothingAhead && <p className="text-white/40 text-xs px-1 py-2">No upcoming events.</p>}
          {byMonth.has(thisKey) && (<><MonthLabel count={byMonth.get(thisKey).length}>{monthName(thisKey, false)}</MonthLabel>{list(thisKey)}</>)}
          {byMonth.has(nextKey) && (<><MonthLabel count={byMonth.get(nextKey).length}>{monthName(nextKey, false)}</MonthLabel>{list(nextKey)}</>)}

          {laterKeys.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setLaterOpen((o) => !o)}
                aria-expanded={laterOpen}
                className="w-full h-10 px-3 rounded-[10px] border border-[#2a2a2a] flex items-center gap-2 text-left text-white/80 text-[13px]"
              >
                <span className="flex-1 truncate">{laterMonth ? monthName(laterMonth) : "Later months"}</span>
                <ChevronDown className="w-4 h-4 text-white/50 transition-transform" style={{ transform: laterOpen ? "rotate(180deg)" : "none" }} />
              </button>
              {laterOpen && (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {laterKeys.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { setLaterMonth(k); setLaterOpen(false); }}
                      className={`h-9 px-2.5 rounded-lg border text-[11px] tracking-[0.06em] flex items-center justify-between ${laterMonth === k ? "border-[#a855f7]/60 bg-[#a855f7]/10 text-white" : "border-[#2a2a2a] text-white/70"}`}
                      style={{ fontFamily: SCENE_MONO }}
                    >
                      <span className="truncate">{monthName(k)}</span>
                      <span className="text-white/40 ml-1">{byMonth.get(k).length}</span>
                    </button>
                  ))}
                </div>
              )}
              {laterMonth && !laterOpen && <div className="mt-2">{list(laterMonth)}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
