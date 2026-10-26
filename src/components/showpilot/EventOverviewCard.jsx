import React from "react";
import { Ticket, Globe } from "lucide-react";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { EventTypeGlyph } from "@/components/showpilot/EventTypeIcon";
import { overviewRun, linkHref } from "@/lib/eventLink";

// The event overview card an act sees at the top of the event link (job 176),
// and the venue's preview of it: picture, name, date and venue, the run of
// show, tickets and the venue website. Nothing private.
const mono = { fontFamily: SCENE_MONO };
const lbl = "text-[10.5px] tracking-[0.14em] text-white/45";
const fmtDay = (d) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "");

export default function EventOverviewCard({ ov = {}, title, date, venue, place, color = "#60A5FA" }) {
  const run = overviewRun(ov);
  const ticket = linkHref(ov.ticket_link);
  const site = linkHref(ov.website);
  return (
    <div className="rounded-[14px] border border-[#2a2a2a] bg-[#141414] overflow-hidden">
      <div className="relative w-full aspect-[16/7] flex items-center justify-center" style={{ background: ov.image ? "#111" : `${color}14` }}>
        {ov.image ? (
          <img src={ov.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <EventTypeGlyph type={ov.event_type} style={{ width: 56, height: 56, color, opacity: 0.6, strokeWidth: 1.5 }} />
        )}
        <span aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(10,10,10,0.92))" }} />
        <div className="absolute left-0 right-0 bottom-0 px-4 pb-3">
          {venue && <div className="text-[11px] tracking-[0.1em]" style={{ ...mono, color }}>{String(venue).toUpperCase()}</div>}
          <div className="text-[28px] leading-[1.05] font-bold text-white" style={{ fontFamily: "'Barlow Condensed', sans-serif", textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}>{title || "Event"}</div>
          {date && <div className="text-[13.5px] text-white/75">{fmtDay(date)}</div>}
        </div>
      </div>

      {(run.length > 0 || ticket || site) && (
      <div className="p-4 flex flex-col gap-4">
        {run.length > 0 && (
          <section>
            <div className={`${lbl} mb-1.5`} style={mono}>RUN OF SHOW</div>
            <div className="rounded-[10px] border border-[#242424] divide-y divide-[#1f1f1f]">
              {run.map((r, i) => (
                <div key={i} className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 px-3 py-2 text-[14.5px]">
                  <span className="text-[13px]" style={{ ...mono, color: r.kind === "curfew" ? "#FCA5A5" : color }}>{r.time || "—"}</span>
                  <span className="truncate" style={r.kind === "curfew" ? { color: "#FCA5A5" } : undefined}>{r.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(ticket || site) && (
          <div className="flex gap-2 flex-wrap">
            {ticket && <a href={ticket} target="_blank" rel="noreferrer" className="flex-1 min-w-[140px] min-h-[44px] rounded-[10px] border flex items-center justify-center gap-2 text-[14px] font-semibold" style={{ color, borderColor: `${color}66` }}><Ticket className="w-4 h-4" />Tickets</a>}
            {site && <a href={site} target="_blank" rel="noreferrer" className="flex-1 min-w-[140px] min-h-[44px] rounded-[10px] border border-[#2a2a2a] flex items-center justify-center gap-2 text-[14px] font-semibold text-white/80"><Globe className="w-4 h-4" />Venue website</a>}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
