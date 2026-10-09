import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { MapPin, Ticket, Navigation, Image as ImageIcon, X, ArrowLeft } from "lucide-react";
import EventTypeIcon from "@/components/showpilot/EventTypeIcon";
import { eventTypeColor } from "@/lib/eventTypes";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// Public, no-login page for one event. Everything on it comes from
// get_fan_event, which only returns what the owner chose to show - crew
// details never reach this page.
const withProtocol = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export default function FanEvent() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState(null);
  // Back shows when there is somewhere to go back to: earlier history (a fan
  // who arrived from a link, or an owner who previewed from the app) or a
  // signed-in ShowPilot user (falls back to their home).
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSignedIn(!!data?.session)); }, []);
  const hasHistory = typeof window !== "undefined" && window.history.length > 1;
  const goBack = () => (hasHistory ? navigate(-1) : navigate("/"));
  const [state, setState] = useState("loading");
  // Flyer viewing mode: the page info dissolves and the flyer comes forward.
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_fan_event", { p_token: token }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) setState("missing");
      else { setEv(data); setState("ok"); }
    });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e) => { if (e.key === "Escape") setViewing(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

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
          <div className="fixed inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: `url(${ev.flyer_url})`, filter: viewing ? "blur(0px)" : "blur(3px) saturate(1.1)", transform: viewing ? "scale(1.25)" : "scale(1.1)", opacity: viewing ? 0 : 1, transition: "opacity 700ms ease, transform 900ms ease, filter 700ms ease" }} />
          <div className="fixed inset-0 z-0" style={{ background: "linear-gradient(180deg, rgba(13,13,13,0.55) 0%, rgba(13,13,13,0.72) 40%, rgba(13,13,13,0.9) 100%)", opacity: viewing ? 0 : 1, transition: "opacity 600ms ease" }} />
          {/* The clear, full flyer: fits the screen, fades and settles in when viewing. */}
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#0d0d0d]" style={{ opacity: viewing ? 1 : 0, pointerEvents: viewing ? "auto" : "none", transition: "opacity 700ms ease 150ms" }} onClick={() => setViewing(false)}>
            <img src={ev.flyer_url} alt="Event flyer" className="max-w-full max-h-full object-contain" style={{ transform: viewing ? "scale(1)" : "scale(1.12)", transition: "transform 900ms cubic-bezier(0.2, 0.8, 0.2, 1) 100ms" }} />
          </div>
          <button
            type="button"
            onClick={() => setViewing(false)}
            aria-label="Back to event info"
            tabIndex={viewing ? 0 : -1}
            className="fixed z-30 left-1/2 -translate-x-1/2 bottom-6 flex items-center gap-2 px-5 py-3 rounded-full text-base font-bold tracking-[0.06em] text-white bg-black/60 backdrop-blur-md border border-white/25"
            style={{ opacity: viewing ? 1 : 0, pointerEvents: viewing ? "auto" : "none", transition: "opacity 500ms ease 700ms" }}
          >
            <X className="w-4 h-4" /> BACK TO INFO
          </button>
        </>
      )}
      <div className="max-w-lg mx-auto relative z-10" style={{ opacity: viewing ? 0 : 1, filter: viewing ? "blur(6px)" : "none", transform: viewing ? "scale(0.97)" : "none", pointerEvents: viewing ? "none" : "auto", transition: "opacity 550ms ease, filter 550ms ease, transform 550ms ease" }} aria-hidden={viewing}>
        <div className="px-5 pt-6 pb-5 border-b border-white/10" style={{ background: ev.flyer_url ? `linear-gradient(180deg, ${color}2a 0%, transparent 100%)` : `linear-gradient(180deg, ${color}38 0%, ${color}0f 60%, #0d0d0d 100%)` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {(hasHistory || signedIn) && (
                <button type="button" onClick={goBack} aria-label="Go back" className="w-8 h-8 -ml-1 rounded-full flex items-center justify-center text-white/80 bg-black/35 border border-white/20 hover:bg-black/50">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <span className="text-[10px] tracking-[0.14em] text-white/55" style={{ fontFamily: SCENE_MONO }}>SHOWPILOT · EVENT</span>
            </div>
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
          {ev.flyer_url && (
            <button type="button" onClick={() => setViewing(true)} className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] tracking-[0.1em] text-white/80 bg-black/35 border border-white/20 hover:bg-black/50" style={{ fontFamily: SCENE_MONO }}>
              <ImageIcon className="w-3 h-3" /> VIEW FLYER
            </button>
          )}
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
