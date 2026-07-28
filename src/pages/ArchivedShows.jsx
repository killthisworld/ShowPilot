import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Search, ArchiveRestore, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ArchivedShows() {
  const navigate = useNavigate();
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (isMounted) setLoading(false); return; }
      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .eq("owner_id", user.id)
        .eq("archived", true)
        .order("date", { ascending: false });
      if (error) console.error(error);
      else if (isMounted) setShows(data || []);
      if (isMounted) setLoading(false);
    }
    load();
    return () => { isMounted = false; };
  }, []);

  const handleUnarchive = async (show) => {
    setShows((prev) => prev.filter((s) => s.id !== show.id));
    const { error } = await supabase.from("shows").update({ archived: false }).eq("id", show.id);
    if (error) console.error(error);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return shows;
    return shows.filter((s) =>
      s.band_name?.toLowerCase().includes(q) ||
      s.venue?.toLowerCase().includes(q) ||
      s.location?.toLowerCase().includes(q)
    );
  }, [shows, search]);

  // Predictive suggestions, same pattern as the Home search bar
  const suggestions = useMemo(() => {
    if (!search || search.length < 1) return [];
    const q = search.toLowerCase();
    const candidates = new Set();
    shows.forEach((s) => {
      if (s.band_name?.toLowerCase().includes(q)) candidates.add(s.band_name);
      if (s.venue?.toLowerCase().includes(q)) candidates.add(s.venue);
      if (s.location?.toLowerCase().includes(q)) candidates.add(s.location);
      const city = s.location?.split(",")[0]?.trim();
      if (city?.toLowerCase().includes(q)) candidates.add(city);
    });
    return [...candidates].slice(0, 6);
  }, [search, shows]);

  // Group by state, then city — location is stored as "City, State"
  const grouped = useMemo(() => {
    const byState = {};
    filtered.forEach((s) => {
      const [city, state] = (s.location || "Unknown").split(",").map((p) => p.trim());
      const stateKey = state || "Unknown";
      const cityKey = city || "Unknown";
      if (!byState[stateKey]) byState[stateKey] = {};
      if (!byState[stateKey][cityKey]) byState[stateKey][cityKey] = [];
      byState[stateKey][cityKey].push(s);
    });
    return byState;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-10">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white">Archived Shows</h1>
        </div>
        <div className="px-4 pb-3 max-w-lg mx-auto">
          <div className="relative" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search archived shows..."
              className="pl-9 h-10 bg-[#161616] border-[#222] text-white placeholder:text-white/25 rounded-xl"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-xl z-50 overflow-hidden">
                {suggestions.map((s, i) => (
                  <button key={i} onMouseDown={() => { setSearch(s); setShowSuggestions(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-[#222] flex items-center gap-2">
                    <Search className="w-3 h-3 text-white/30" />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-center text-white/40 py-16">
            {search ? "No archived shows match your search" : "No archived shows"}
          </p>
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
                        {cityShows.map((s) => (
                          <div key={s.id} className="flex items-center justify-between gap-2">
                            <button onClick={() => navigate(`/show/${s.id}`)} className="text-left min-w-0 flex-1">
                              <p className="text-white text-sm truncate hover:text-[#8CFF3D] transition-colors">{s.band_name}</p>
                              <p className="text-white/40 text-xs truncate">{s.venue}</p>
                            </button>
                            <button
                              onClick={() => handleUnarchive(s)}
                              className="p-1.5 text-white/30 hover:text-[#8CFF3D] shrink-0"
                              title="Unarchive"
                            >
                              <ArchiveRestore className="w-4 h-4" />
                            </button>
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
