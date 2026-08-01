import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { X, MapPin, Calendar, Music, Drama, Building, PartyPopper, Sparkles, Mic2, Star } from "lucide-react";

const TYPE_ICONS = {
  "Concert": Music,
  "Comedy Show": Drama,
  "Theatre Play": Drama,
  "Corporate Event": Building,
  "Private Party": PartyPopper,
  "Festival": Sparkles,
  "Open Mic": Mic2,
};

const STAMP_COLORS = ["#8CFF3D", "#60A5FA", "#F59E0B", "#F472B6", "#A78BFA", "#34D399", "#F87171", "#38BDF8"];

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return STAMP_COLORS[Math.abs(hash) % STAMP_COLORS.length];
}

function ShowStamp({ show, onClick, rotation }) {
  const color = hashColor(show.venue || show.band_name || "show");
  const TypeIcon = TYPE_ICONS[show.event_type] || Star;
  const d = show.date ? new Date(show.date + "T00:00:00") : null;

  return (
    <button
      onClick={onClick}
      className="group relative w-full aspect-square rounded-full flex flex-col items-center justify-center text-center px-4 transition-transform duration-200 hover:scale-105"
      style={{
        transform: `rotate(${rotation}deg)`,
        background: `radial-gradient(circle at 35% 25%, ${color}33, #111 70%)`,
        border: `2px dashed ${color}88`,
        boxShadow: `0 8px 20px rgba(0,0,0,0.5), inset 0 0 0 6px #0d0d0d, inset 0 0 0 7px ${color}55`,
      }}
    >
      <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: `0 0 24px 4px ${color}66` }} />
      <TypeIcon className="w-5 h-5 mb-1 relative z-10" style={{ color }} />
      <p className="relative z-10 text-white font-bold text-xs leading-tight line-clamp-2">{show.band_name || "Untitled"}</p>
      <p className="relative z-10 text-white/50 text-[10px] mt-0.5 line-clamp-1 px-2">{show.venue || "Venue TBD"}</p>
      {d && <p className="relative z-10 text-[9px] mt-0.5 font-semibold" style={{ color }}>{d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
    </button>
  );
}

export default function PublicLogbook() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const [displayName, setDisplayName] = useState("");
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedShow, setSelectedShow] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }
      try {
        const { data, error } = await supabase.rpc("get_public_logbook", { p_token: token });
        if (error) throw error;
        if (!data) { setNotFound(true); }
        else {
          setDisplayName(data.display_name || "");
          setShows(data.shows || []);
        }
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const uniqueVenues = [...new Set(shows.map((s) => s.venue).filter(Boolean))];
  const uniqueBands = [...new Set(shows.map((s) => s.band_name).filter(Boolean))];
  const uniqueCities = [...new Set(shows.map((s) => s.city).filter(Boolean))];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Logbook not found</p>
          <p className="text-white/30 text-sm">This link may be invalid or no longer active.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-16">
      <div className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-lg border-b border-white/5">
        <div className="px-4 py-4 max-w-2xl mx-auto">
          <h1 className="text-lg font-bold text-white tracking-tight">{displayName ? `${displayName}'s Logbook` : "Logbook"}</h1>
          <p className="text-white/30 text-xs">Powered by ShowPilot</p>
        </div>
      </div>

      <div className="px-4 pt-6 max-w-2xl mx-auto">
        <div className="grid grid-cols-4 gap-2 mb-8">
          <div className="text-center">
            <p className="text-xl font-bold text-white">{shows.length}</p>
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Shows</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white">{uniqueVenues.length}</p>
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Venues</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white">{uniqueBands.length}</p>
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Artists</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white">{uniqueCities.length}</p>
            <p className="text-white/30 text-[10px] uppercase tracking-wide">Cities</p>
          </div>
        </div>

        {shows.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-white/40 text-sm">No public stamps yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            {shows.map((show, i) => (
              <ShowStamp key={i} show={show} onClick={() => setSelectedShow(show)} rotation={((i * 37) % 7) - 3} />
            ))}
          </div>
        )}
      </div>

      {selectedShow && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 px-4 pb-4 sm:pb-0" onClick={() => setSelectedShow(null)}>
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-white font-bold text-xl">{selectedShow.band_name || "Untitled"}</h2>
                {selectedShow.event_type && <p className="text-white/40 text-xs mt-0.5">{selectedShow.event_type}</p>}
              </div>
              <button onClick={() => setSelectedShow(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-sm">
              {selectedShow.venue && (
                <div className="flex items-center gap-2 text-white/70">
                  <MapPin className="w-4 h-4 text-white/30 shrink-0" />
                  <span>{selectedShow.venue}{selectedShow.city ? `, ${[selectedShow.city, selectedShow.state].filter(Boolean).join(", ")}` : ""}</span>
                </div>
              )}
              {selectedShow.date && (
                <div className="flex items-center gap-2 text-white/70">
                  <Calendar className="w-4 h-4 text-white/30 shrink-0" />
                  <span>{new Date(selectedShow.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
