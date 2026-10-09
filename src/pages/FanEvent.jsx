import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { MapPin, Ticket, Navigation } from "lucide-react";
import EventTypeIcon from "@/components/showpilot/EventTypeIcon";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// Public, no-login page for one event. Everything on it comes from
// get_fan_event, which only returns what the owner chose to show - crew
// details never reach this page.
const withProtocol = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export default function FanEvent() {
  const { token } = useParams();
  const [ev, setEv] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_fan_event", { p_token: token }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) setState("missing");
      else { setEv(data); setState("ok"); }
    });
    return () => { alive = false; };
  }, [token]);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }
  if (state === "missing" || !ev) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-6 text-center" style={{ fontFamily: SCENE_FONT }}>
        <div>
          <p className="text-white/70 text-2xl font-semibold">This event page isn't available</p>
          <p className="text-white/40 text-base mt-1">The link may be wrong, or the host has turned the page off.</p>
        </div>
      </div>
    );
  }

  const color = eventTypeColor(ev.event_type) || "#8CFF3D";
  const dateLabel = ev.date
    ? new Date(ev.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()
    : "";
  const place = [ev.city, ev.state].filter(Boolean).join(", ");
  const times = [
    ev.door_time && { label: "DOORS", value: ev.door_time, color: "#fff" },
    ev.show_time && { label: "SHOW", value: ev.show_time, color },
    ev.ages && { label: "AGES", value: ev.ages, color: "rgba(255,255,255,0.7)" },
  ].filter(Boolean);
  // A street address, when the host gave one, is what makes the map link land
  // on the right spot; otherwise fall back to the venue name and city.
  const mapQuery = ev.address ? [ev.address, place].filter(Boolean).join(", ") : [ev.venue, place].filter(Boolean).join(" ");
  const mapsUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white relative" style={{ fontFamily: SCENE_FONT }}>
      {ev.flyer_url && (
        <>
          <div className="fixed inset-0 z-0 bg-cover bg-center scale-110" style={{ backgroundImage: `url(${ev.flyer_url})`, filter: "blur(3px) saturate(1.1)" }} />
          <div className="fixed inset-0 z-0" style={{ background: "linear-gradient(180deg, rgba(13,13,13,0.55) 0%, rgba(13,13,13,0.72) 40%, rgba(13,13,13,0.9) 100%)" }} />
        </>
      )}
      <div className="max-w-lg mx-auto relative z-10">
        <div className="px-5 pt-6 pb-5 border-b border-white/10" style={{ background: ev.flyer_url ? `linear-gradient(180deg, ${color}2a 0%, transparent 100%)` : `linear-gradient(180deg, ${color}38 0%, ${color}0f 60%, #0d0d0d 100%)` }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>SHOWPILOT · EVENT</span>
            {ev.event_type && (
              <span className="text-[9px] tracking-[0.1em] px-[7px] py-[3px] rounded-[3px] uppercase" style={{ fontFamily: SCENE_MONO, color, background: color + "24" }}>{ev.event_type}</span>
            )}
          </div>
          <div className="mt-5" style={{ filter: `drop-shadow(0 0 18px ${color}55)` }}>
            <EventTypeIcon type={ev.event_type} imageUrl={ev.icon_url} size={84} />
          </div>
          <h1 className="mt-4 text-[40px] font-bold leading-[0.98] tracking-[0.01em]">{ev.event_name || ev.band_name || "Event"}</h1>
          {ev.band_name && ev.event_name && ev.band_name !== ev.event_name && (
            <p className="mt-2 text-xl font-semibold text-white/80">{ev.band_name}</p>
          )}
          <p className="mt-3 text-xs tracking-[0.08em] uppercase" style={{ fontFamily: SCENE_MONO, color }}>{[dateLabel, ev.venue].filter(Boolean).join(" · ")}</p>
          {place && <p className="mt-1 text-[11px] tracking-[0.08em] uppercase text-white/50" style={{ fontFamily: SCENE_MONO }}>{place}</p>}
        </div>

        {times.length > 0 && (
          <div className="mx-5 mt-4 flex bg-[#111111]/80 backdrop-blur-md border border-white/10 rounded-[10px] overflow-hidden">
            {times.map((t, i) => (
              <div key={t.label} className="flex-1 min-w-0 px-3 py-[9px]" style={{ borderRight: i < times.length - 1 ? "1px solid #1c1c1c" : "none" }}>
                <div className="text-[9px] tracking-[0.12em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{t.label}</div>
                <div className="text-[17px] font-semibold mt-0.5 truncate" style={{ fontFamily: SCENE_MONO, color: t.color }}>{t.value}</div>
              </div>
            ))}
          </div>
        )}

        {ev.ticket_link && (
          <div className="px-5 mt-4">
            <a
              href={withProtocol(ev.ticket_link)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 py-[15px] rounded-xl text-[22px] font-bold tracking-[0.06em] text-[#0d0d0d]"
              style={{ background: color, boxShadow: `0 0 22px ${color}66` }}
            >
              <Ticket className="w-5 h-5" /> GET TICKETS
              {ev.ticket_price && <span className="text-[13px] font-semibold opacity-70" style={{ fontFamily: SCENE_MONO }}>{ev.ticket_price}</span>}
            </a>
          </div>
        )}

        {ev.note && (
          <div className="mx-5 mt-4 bg-[#111111]/80 backdrop-blur-md border border-white/10 rounded-[10px] p-3.5">
            <div className="text-[10px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>NOTE FROM THE ARTIST</div>
            <p className="mt-2 text-lg font-medium leading-tight text-white/90 whitespace-pre-line">{ev.note}</p>
          </div>
        )}

        {ev.flyer_url && (
          <div className="px-5 mt-3.5">
            <a href={ev.flyer_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center py-2.5 rounded-xl text-base font-bold tracking-[0.06em] bg-black/40 backdrop-blur-md border border-white/15 text-white/85">
              VIEW FULL FLYER
            </a>
          </div>
        )}

        {ev.venue && (
          <div className="mx-5 mt-3.5 bg-[#111111]/80 backdrop-blur-md border border-white/10 rounded-[10px] p-3.5 flex items-center gap-3">
            <span className="w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FB923C24", border: "1px solid #FB923C8c", color: "#FB923C" }}>
              <MapPin className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold leading-tight truncate">{ev.venue}</div>
              {(ev.address || place) && <div className="text-[10px] tracking-[0.06em] uppercase text-white/50 mt-0.5" style={{ fontFamily: SCENE_MONO }}>{ev.address ? [ev.address, place].filter(Boolean).join(", ") : place}</div>}
            </div>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] tracking-[0.1em] flex items-center gap-1" style={{ fontFamily: SCENE_MONO, color: "#FB923C" }}>
                MAP <Navigation className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        <div className="mx-5 mt-6 pt-4 pb-10 border-t border-[#1a1a1a]">
          <div className="flex items-center gap-2.5">
            <span className="w-[26px] h-[26px] rounded-md flex items-center justify-center" style={{ background: "#8CFF3D24", border: "1px solid #8CFF3D8c", color: "#8CFF3D" }}>
              <Navigation className="w-3.5 h-3.5" />
            </span>
            <span className="text-base font-bold tracking-[0.06em] text-white/80">THIS SHOW RUNS ON SHOWPILOT</span>
          </div>
          <p className="mt-2 text-[15px] font-medium leading-tight text-white/50">The artist, venue, promoter and crew all work from one shared event.</p>
          <a href="/register" className="inline-flex mt-3 px-3.5 py-[9px] rounded-lg text-[15px] font-bold tracking-[0.06em]" style={{ background: "#8CFF3D1a", border: "1px solid #8CFF3D66", color: "#8CFF3D" }}>
            CREW OR VENUE? JOIN SHOWPILOT
          </a>
        </div>
      </div>
    </div>
  );
}
