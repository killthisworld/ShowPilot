import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, X, MapPin, Calendar, Music, Drama, Building, PartyPopper, Sparkles, Mic2, Star } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  return (
    <button
      onClick={onClick}
      className="group relative w-full aspect-square rounded-full flex flex-col items-center justify-center text-center px-2 transition-transform duration-200 hover:scale-105"
      style={{
        transform: `rotate(${rotation}deg)`,
        background: `radial-gradient(circle at 35% 25%, ${color}33, #111 70%)`,
        border: `2px dashed ${color}88`,
        boxShadow: `0 8px 20px rgba(0,0,0,0.5), inset 0 0 0 4px #0d0d0d, inset 0 0 0 5px ${color}55`,
      }}
    >
      <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: `0 0 24px 4px ${color}66` }} />
      <TypeIcon className="w-4 h-4 mb-0.5 relative z-10" style={{ color }} />
      <p className="relative z-10 text-white font-bold text-[10px] leading-tight line-clamp-2">{show.band_name || "Untitled"}</p>
      <p className="relative z-10 text-white/50 text-[8px] mt-0.5 line-clamp-1 px-1">{show.venue || "Venue TBD"}</p>
    </button>
  );
}

export default function PublicLogbook() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [shows, setShows] = useState([]);
  const [monthSettingsMap, setMonthSettingsMap] = useState({});
  const [coverSettings, setCoverSettings] = useState({ background_url: "", blur: 0, overlay_darkness: 0.5 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedShow, setSelectedShow] = useState(null);
  const [showingCover, setShowingCover] = useState(true);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!token) { setNotFound(true); setLoading(false); return; }
      try {
        const { data, error } = await supabase.rpc("get_public_logbook", { p_token: token });
        if (error) throw error;
        if (!data) {
          setNotFound(true);
        } else {
          setDisplayName(data.display_name || "");
          setBio(data.bio || "");
          setShows(data.shows || []);
          const map = {};
          (data.month_settings || []).forEach((s) => { map[s.month_key] = s; });
          setMonthSettingsMap(map);
          if (map.__cover__) setCoverSettings(map.__cover__);
        }
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const monthGroups = useMemo(() => {
    const groups = {};
    shows.forEach((s) => {
      if (!s.date) return;
      const key = s.date.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [shows]);

  useEffect(() => {
    if (!selectedMonthKey && monthGroups.length > 0) setSelectedMonthKey(monthGroups[0][0]);
  }, [monthGroups, selectedMonthKey]);

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

  const currentMonthEntry = monthGroups.find(([key]) => key === selectedMonthKey);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {showingCover ? (
        <div className="relative min-h-screen flex flex-col items-center justify-center text-center px-6">
          {coverSettings.background_url && (
            <>
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${coverSettings.background_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: `blur(${coverSettings.blur || 0}px)`,
                }}
              />
              <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${coverSettings.overlay_darkness ?? 0.5})` }} />
            </>
          )}

          <div className="relative z-10 max-w-md w-full">
            <h1 className="font-bold text-3xl tracking-tight mb-3" style={{ color: coverSettings.text_color || "#ffffff" }}>{displayName ? `${displayName}'s Logbook` : "Logbook"}</h1>
            {bio && <p className="text-sm leading-relaxed whitespace-pre-wrap mb-8 opacity-80" style={{ color: coverSettings.text_color || "#ffffff" }}>{bio}</p>}

            <div className="grid grid-cols-4 gap-2 mb-10">
              <div className="text-center">
                <p className="text-xl font-bold" style={{ color: coverSettings.text_color || "#ffffff" }}>{shows.length}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Shows</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold" style={{ color: coverSettings.text_color || "#ffffff" }}>{uniqueVenues.length}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Venues</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold" style={{ color: coverSettings.text_color || "#ffffff" }}>{uniqueBands.length}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Artists</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold" style={{ color: coverSettings.text_color || "#ffffff" }}>{uniqueCities.length}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-wide">Cities</p>
              </div>
            </div>

            {shows.length === 0 ? (
              <p className="text-white/30 text-sm">No public stamps yet</p>
            ) : (
              <button
                onClick={() => setShowingCover(false)}
                className="px-6 py-3 rounded-full bg-[#8CFF3D] text-black font-semibold text-sm hover:bg-[#7ae62e] transition-colors"
              >
                Enter Logbook
              </button>
            )}
            <p className="text-white/20 text-xs mt-8">Powered by ShowPilot</p>
          </div>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-lg border-b border-white/5">
            <div className="flex items-center justify-between gap-3 px-4 py-4 max-w-2xl mx-auto">
              <button onClick={() => setShowingCover(true)} className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm">
                <ArrowLeft className="w-4 h-4" /> Cover
              </button>
            </div>
          </div>

          {!currentMonthEntry ? (
            <div className="text-center py-24">
              <p className="text-white/40 text-sm">No shows yet</p>
            </div>
          ) : (
            (() => {
              const [monthKey, monthShows] = currentMonthEntry;
              const settings = monthSettingsMap[monthKey];
              const hasBg = !!settings?.background_url;
              return (
                <div className="relative min-h-screen">
                  {hasBg && (
                    <>
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `url(${settings.background_url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          filter: `blur(${settings.blur || 0}px)`,
                        }}
                      />
                      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${settings.overlay_darkness ?? 0.5})` }} />
                    </>
                  )}
                  <div className="relative max-w-2xl mx-auto px-4 py-10">
                    <div className="flex justify-center mb-6">
                      <Select value={selectedMonthKey || ""} onValueChange={setSelectedMonthKey}>
                        <SelectTrigger
                          className="w-auto px-5 py-2.5 rounded-xl border-2 font-bold text-xl h-auto bg-black/30"
                          style={{ color: settings?.text_color || "#ffffff", borderColor: (settings?.text_color || "#ffffff") + "40" }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                          {monthGroups.map(([key]) => (
                            <SelectItem key={key} value={key}>
                              {new Date(key + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {monthShows.map((show, i) => (
                        <ShowStamp key={i} show={show} onClick={() => setSelectedShow(show)} rotation={((i * 37) % 7) - 3} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </>
      )}

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
