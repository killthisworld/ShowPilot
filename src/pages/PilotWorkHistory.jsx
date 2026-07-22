import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, MapPin } from "lucide-react";

export default function PilotWorkHistory() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.rpc("get_pilot_work_history_by_token", { p_token: token }).then(({ data, error }) => {
      if (error) {
        setError("Couldn't load work history.");
      } else {
        setShows(data || []);
      }
      setLoading(false);
    });
  }, [token]);

  // Group by state, then by city within each state — location is stored as "City, State"
  const grouped = useMemo(() => {
    const byState = {};
    shows.forEach((s) => {
      const [city, state] = (s.location || "Unknown").split(",").map((p) => p.trim());
      const stateKey = state || "Unknown";
      const cityKey = city || "Unknown";
      if (!byState[stateKey]) byState[stateKey] = {};
      if (!byState[stateKey][cityKey]) byState[stateKey][cityKey] = [];
      byState[stateKey][cityKey].push(s);
    });
    return byState;
  }, [shows]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-10">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white">Work History</h1>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-center text-white/40 py-16">{error}</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-center text-white/40 py-16">No completed shows yet</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([state, cities]) => (
              <div key={state}>
                <h2 className="text-[#8CFF3D] font-bold text-sm uppercase tracking-wide mb-2">{state}</h2>
                <div className="space-y-3">
                  {Object.entries(cities).sort(([a], [b]) => a.localeCompare(b)).map(([city, cityShows]) => (
                    <div key={city} className="bg-[#161616] rounded-xl border border-[#222] p-3">
                      <p className="text-white/70 text-xs font-semibold flex items-center gap-1 mb-2">
                        <MapPin className="w-3 h-3" /> {city}
                      </p>
                      <div className="space-y-1.5">
                        {cityShows.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-white truncate">{s.band_name}</span>
                            <span className="text-white/40 text-xs shrink-0 ml-2">{s.venue}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
