import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { MapPin, Calendar, Music } from "lucide-react";

const ROLE_COLORS = {
  Headliner: { text: "text-blue-400", bg: "bg-blue-500/10" },
  Opener: { text: "text-[#8CFF3D]", bg: "bg-[#8CFF3D]/10" },
  "Performer/Group": { text: "text-purple-400", bg: "bg-purple-500/10" },
  "N/A": { text: "text-white/50", bg: "bg-white/10" },
};

export default function SharedGig() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const [gig, setGig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }
      try {
        const { data, error } = await supabase.rpc("get_shared_gig", { p_token: token });
        if (error) throw error;
        if (!data) setNotFound(true);
        else setGig(data);
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !gig) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Gig not found</p>
          <p className="text-white/30 text-sm">This share link may be invalid.</p>
        </div>
      </div>
    );
  }

  const title = gig.event_name || gig.band_name || "Untitled Gig";
  const location = [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto">
          <h1 className="text-white font-bold text-lg leading-tight">{title}</h1>
          {gig.event_type && <p className="text-white/40 text-xs mt-0.5">{gig.event_type}</p>}
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <div className="bg-[#111] rounded-2xl p-4 space-y-2.5">
          {location && (
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <MapPin className="w-4 h-4 text-white/30 shrink-0" />
              <span>{location}</span>
            </div>
          )}
          {gig.date && (
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <Calendar className="w-4 h-4 text-white/30 shrink-0" />
              <span>{new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
            </div>
          )}
        </div>

        {gig.bands && gig.bands.length > 0 && (
          <div className="bg-[#111] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Music className="w-4 h-4 text-[#8CFF3D]" />
              <p className="text-white font-semibold text-sm">Lineup</p>
            </div>
            <div className="space-y-2">
              {gig.bands.filter(b => b.band_name).map((b, i) => {
                const colors = ROLE_COLORS[b.role] || ROLE_COLORS["N/A"];
                return (
                  <div key={i} className="flex items-center justify-between bg-[#1a1a1a] rounded-xl px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{b.band_name}</p>
                      {b.genre_tags && b.genre_tags.length > 0 && (
                        <p className="text-white/30 text-xs truncate">{b.genre_tags.join(", ")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {b.set_length_minutes && <span className="text-white/40 text-xs">{b.set_length_minutes} min</span>}
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${colors.text} ${colors.bg}`}>
                        {b.role}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-white/20 text-xs text-center pt-2">Powered by ShowPilot</p>
      </div>
    </div>
  );
}
