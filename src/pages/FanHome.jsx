import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Star, KeyRound, MapPin, LogOut, ExternalLink } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { fanPath } from "@/lib/fanUrl";

// Fan accounts (job 77; direction in claude/fan-profile-direction.md).
// A fan's home is "My shows": every event they RSVP'd to with their
// account's email, each opening its key / sky and its fan page. Phone-first,
// in the event sky's colors so it feels like the fan's own corner of Show
// Pilot rather than a work screen.

const STAR = "#E4E0FF";
const SKY = "#0b0e24";
const LINE = "#2b2f5a";
const SOFT = "#b7bbe6";
const G = "#8CFF3D";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateParts = (iso) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return {
    dow: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    mon: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: d.getDate(),
  };
};
const daysUntil = (iso) => {
  if (!iso) return null;
  const a = new Date(`${iso}T00:00:00`).getTime();
  const b = new Date(`${todayIso()}T00:00:00`).getTime();
  return Math.round((a - b) / 86400000);
};
const countdownLabel = (n) => (n === null ? "DATE TBA" : n === 0 ? "TONIGHT" : n === 1 ? "TOMORROW" : `${n} DAYS TO GO`);

export default function FanHome() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [shows, setShows] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_my_fan_shows").then(({ data, error: err }) => {
      if (!alive) return;
      if (err) { console.error(err); setError(true); setShows([]); return; }
      setShows(Array.isArray(data) ? data : []);
    });
    return () => { alive = false; };
  }, []);

  const today = todayIso();
  const upcoming = (shows || []).filter((s) => !s.date || s.date >= today);
  const past = (shows || []).filter((s) => s.date && s.date < today).reverse();

  const doSignOut = async () => {
    try { await signOut(); } catch (e) { console.error(e); }
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: SCENE_FONT, background: `radial-gradient(ellipse at 50% 0%, #141a44 0%, ${SKY} 40%, #05060f 100%)` }}>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-16">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.16em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>SHOW PILOT · FAN</div>
            <h1 className="text-[34px] font-bold tracking-[0.04em] leading-none mt-1">MY SHOWS</h1>
            <p className="text-[13px] mt-1.5 truncate" style={{ color: SOFT }}>{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={doSignOut}
            className="shrink-0 flex items-center gap-1.5 h-10 px-3 rounded-full text-[13px] font-semibold"
            style={{ background: "#12163a", border: `1px solid ${LINE}`, color: SOFT }}
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </header>

        {shows === null ? (
          <div className="py-24 flex justify-center">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${STAR}33`, borderTopColor: STAR }} />
          </div>
        ) : error ? (
          <p className="mt-10 text-[15px] leading-relaxed rounded-xl px-4 py-4" style={{ background: "#12163a", border: `1px solid ${LINE}`, color: SOFT }}>
            Your shows couldn't load right now. Try again in a minute.
          </p>
        ) : shows.length === 0 ? (
          <div className="mt-10 rounded-2xl px-5 py-8 text-center" style={{ background: "#12163a", border: `1px dashed ${LINE}` }}>
            <Star className="w-8 h-8 mx-auto" style={{ color: STAR }} />
            <h2 className="text-[24px] font-bold mt-3 leading-tight">No shows yet</h2>
            <p className="text-[15px] mt-2 leading-relaxed" style={{ color: SOFT }}>
              RSVP to an event with <span className="text-white font-semibold break-all">{user?.email}</span> and it lands here, with your key to the event's sky.
            </p>
          </div>
        ) : (
          <>
            <Section label="COMING UP" count={upcoming.length}>
              {upcoming.length === 0 ? (
                <p className="text-[15px]" style={{ color: SOFT }}>Nothing coming up. Your next RSVP will show here.</p>
              ) : (
                upcoming.map((s) => <ShowCard key={s.rsvp_id} show={s} />)
              )}
            </Section>
            {past.length > 0 && (
              <Section label="BEEN THERE" count={past.length}>
                {past.map((s) => <ShowCard key={s.rsvp_id} show={s} past />)}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ label, count, children }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[13px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>{label}</h2>
        <span className="text-[12px]" style={{ fontFamily: SCENE_MONO, color: "#7e83b8" }}>{count}</span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// One RSVP'd event, shaped like a ticket: date stub on the left, the event
// on the right, key + event page below.
function ShowCard({ show, past = false }) {
  const parts = dateParts(show.date);
  const n = daysUntil(show.date);
  const place = [show.venue, [show.city, show.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const page = show.fan_token || show.fan_slug ? fanPath(show.fan_slug, show.fan_token) : null;
  const sky = page && show.sky_key ? `${page}/sky?k=${show.sky_key}` : null;
  const title = show.event_name || show.band_name || "Untitled event";

  return (
    <article
      className="rounded-2xl overflow-hidden"
      style={{ background: "#12163a", border: `1px solid ${past ? "#23264a" : LINE}`, opacity: past ? 0.8 : 1 }}
    >
      <div className="flex">
        <div className="w-[76px] shrink-0 flex flex-col items-center justify-center py-4 relative" style={{ background: "#0e1230", borderRight: `2px dashed ${LINE}` }}>
          {parts ? (
            <>
              <span className="text-[11px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>{parts.mon}</span>
              <span className="text-[34px] font-bold leading-none">{parts.day}</span>
              <span className="text-[11px] tracking-[0.1em]" style={{ fontFamily: SCENE_MONO, color: SOFT }}>{parts.dow}</span>
            </>
          ) : (
            <span className="text-[11px] tracking-[0.1em] text-center px-1" style={{ fontFamily: SCENE_MONO, color: SOFT }}>DATE TBA</span>
          )}
        </div>
        <div className="flex-1 min-w-0 px-4 py-3.5 flex flex-col gap-1">
          {!past && (
            <span className="text-[11px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO, color: n !== null && n <= 1 ? G : STAR }}>{countdownLabel(n)}</span>
          )}
          <h3 className="text-[22px] font-bold leading-tight tracking-[0.02em] line-clamp-2">{title}</h3>
          {show.band_name && show.event_name && show.band_name !== show.event_name && (
            <span className="text-[14px] text-white/80 truncate">{show.band_name}</span>
          )}
          {place && (
            <span className="flex items-center gap-1.5 text-[13px] truncate" style={{ color: SOFT }}>
              <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{place}</span>
            </span>
          )}
          <span className="text-[12px]" style={{ fontFamily: SCENE_MONO, color: "#9ea3d6" }}>
            {show.guests > 1 ? `YOU + ${show.guests - 1}` : "JUST YOU"}{show.artist_name ? ` · FOR ${String(show.artist_name).toUpperCase()}` : ""}
          </span>
        </div>
      </div>
      <div className="flex gap-2 px-3 pb-3 pt-1">
        {sky && (
          <Link
            to={sky}
            className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-[15px] font-bold"
            style={{ background: past ? "transparent" : G, color: past ? STAR : "#0d0d0d", border: past ? `1px solid ${LINE}` : "none" }}
          >
            <KeyRound className="w-4 h-4" /> {past ? "Your star" : "Open your key"}
          </Link>
        )}
        {page && (
          <Link
            to={page}
            className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-[15px] font-semibold"
            style={{ background: "transparent", color: "#ffffff", border: `1px solid ${LINE}` }}
          >
            Event page <ExternalLink className="w-4 h-4" />
          </Link>
        )}
      </div>
    </article>
  );
}
