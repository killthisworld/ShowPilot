import React, { useState } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";
import TicketCard from "@/components/showpilot/TicketCard";
import MonthGroups from "@/components/showpilot/MonthGroups";
import { eventTitle } from "@/lib/eventTitle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// "Event" on the Performer Intake link form (job 160): which event the link is
// for. Closed it shows the choice (New event, or that event's ticket) with a
// chevron so it reads as a dropdown. Open: "New event" on top, then your
// events as tickets grouped by month (each month a dropdown, the current
// month open), so a long list stays short.
//
// shows: your own events. value: the picked event's id, "" = new event.
// colorOf(show): the ticket stub color.
const PURPLE = "#a855f7";

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

export default function IntakeEventPicker({ shows, value, onChange, colorOf }) {
  const [open, setOpen] = useState(false);
  const picked = value ? shows.find((s) => s.id === value) : null;
  const choose = (id) => { onChange(id); setOpen(false); };

  return (
    <div>
      {/* The closed dropdown: the current choice + chevron. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Event: ${picked ? eventTitle(picked) : "New event"}`}
        className={`mt-1 w-full flex items-center gap-2 rounded-xl border bg-[#111] text-left transition-colors ${open ? "border-[#a855f7]/60" : "border-[#2a2a2a]"} ${picked ? "p-1.5" : "h-11 px-3"}`}
      >
        <span className="flex-1 min-w-0">
          {picked ? (
            <span className="pointer-events-none block"><EventTicket show={picked} colorOf={colorOf} /></span>
          ) : (
            <span className="flex items-center gap-2 text-white text-sm"><Plus className="w-4 h-4" style={{ color: PURPLE }} /> New event</span>
          )}
        </span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-white/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-2 max-h-[46vh] overflow-y-auto overscroll-contain space-y-2">
          <button
            type="button"
            onClick={() => choose("")}
            className={`w-full h-11 px-3 rounded-[10px] border flex items-center gap-2 text-sm font-semibold ${!picked ? "border-[#a855f7]/60 bg-[#a855f7]/10 text-white" : "border-[#2a2a2a] text-white/80"}`}
          >
            <Plus className="w-4 h-4" style={{ color: PURPLE }} />
            <span className="flex-1 text-left">New event</span>
            {!picked && <Check className="w-4 h-4" style={{ color: PURPLE }} />}
          </button>
          {shows.length > 0 ? (
            <MonthGroups shows={shows}>
              {(list) => (
                <div className="flex flex-col gap-1.5">
                  {list.map((s) => (
                    <EventTicket key={s.id} show={s} colorOf={colorOf} picked={s.id === value} onClick={() => choose(s.id)} />
                  ))}
                </div>
              )}
            </MonthGroups>
          ) : (
            <p className="text-white/40 text-xs px-1 py-2">No events yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
