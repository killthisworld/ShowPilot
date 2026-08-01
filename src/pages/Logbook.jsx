import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, ChevronLeft, ChevronRight, X, MapPin, Calendar, Music, Drama, Building, PartyPopper, Sparkles, Mic2, Star } from "lucide-react";

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

export default function Logbook() {
  const navigate = useNavigate();
  const [shows, setShows] = useState([]);
  const [monthSettingsMap, setMonthSettingsMap] = useState({});
  const [coverSettings, setCoverSettings] = useState({ background_url: "", blur: 0, overlay_darkness: 0.5 });
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedShow, setSelectedShow] = useState(null);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [selectedYear, setSelectedYear] = useState(null);
  const [showingCover, setShowingCover] = useState(true);
  const [monthIndex, setMonthIndex] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [showsRes, settingsRes, prefsRes] = await Promise.all([
        supabase.from("shows").select("*").eq("owner_id", user.id).eq("done", true).order("date", { ascending: false }),
        supabase.from("logbook_month_settings").select("*").eq("user_id", user.id),
        supabase.from("user_preferences").select("logbook_bio").eq("user_id", user.id).maybeSingle(),
      ]);

      if (showsRes.error) console.error(showsRes.error);
      else setShows(showsRes.data || []);

      if (settingsRes.error) console.error(settingsRes.error);
      else {
        const map = {};
        (settingsRes.data || []).forEach((s) => { map[s.month_key] = s; });
        setMonthSettingsMap(map);
        if (map.__cover__) setCoverSettings(map.__cover__);
      }

      setBio(prefsRes.data?.logbook_bio || "");
      setLoading(false);
    };
    load();
  }, []);

  const availableYears = useMemo(
    () => [...new Set(shows.map((s) => s.date?.slice(0, 4)).filter(Boolean))].sort().reverse(),
    [shows]
  );

  useEffect(() => {
    if (!selectedYear && availableYears.length > 0) setSelectedYear(availableYears[0]);
  }, [availableYears, selectedYear]);

  useEffect(() => {
    setMonthIndex(0);
  }, [selectedYear]);

  const yearShows = useMemo(() => shows.filter((s) => s.date?.startsWith(selectedYear)), [shows, selectedYear]);

  const monthGroups = useMemo(() => {
    const groups = {};
    yearShows.forEach((s) => {
      if (!s.date) return;
      const key = s.date.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [yearShows]);

  const uniqueVenues = [...new Set(shows.map((s) => s.venue).filter(Boolean))];
  const uniqueBands = [...new Set(shows.map((s) => s.band_name).filter(Boolean))];
  const uniqueCities = [...new Set(shows.map((s) => s.city).filter(Boolean))];

  const togglePublic = async (show) => {
    setTogglingPublic(true);
    const newVal = !show.logbook_public;
    try {
      const { error } = await supabase.from("shows").update({ logbook_public: newVal }).eq("id", show.id);
      if (error) throw error;
      setShows((prev) => prev.map((s) => (s.id === show.id ? { ...s, logbook_public: newVal } : s)));
      setSelectedShow((prev) => (prev && prev.id === show.id ? { ...prev, logbook_public: newVal } : prev));
    } catch (e) {
      console.error(e);
    }
    setTogglingPublic(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  const currentMonthEntry = monthGroups[monthIndex];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {showingCover ? (
        <div
          className="relative min-h-screen flex flex-col items-center justify-center text-center px-6"
          style={{ backgroundColor: "#0a0a0a" }}
        >
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
          <button onClick={() => navigate(-1)} className="absolute top-4 left-4 p-2 text-white/60 hover:text-white z-10">
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative z-10 max-w-md w-full">
            <h1 className="font-bold text-3xl tracking-tight mb-3" style={{ color: coverSettings.text_color || "#ffffff" }}>Logbook</h1>
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
              <p className="text-white/30 text-sm">Mark a show as Done to start your Logbook</p>
            ) : (
              <button
                onClick={() => setShowingCover(false)}
                className="px-6 py-3 rounded-full bg-[#8CFF3D] text-black font-semibold text-sm hover:bg-[#7ae62e] transition-colors"
              >
                Enter Logbook
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-lg border-b border-white/5">
            <div className="flex items-center justify-between gap-3 px-4 py-4 max-w-2xl mx-auto">
              <button onClick={() => setShowingCover(true)} className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm">
                <ArrowLeft className="w-4 h-4" /> Cover
              </button>
              {availableYears.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto">
                  {availableYears.map((y) => (
                    <button
                      key={y}
                      onClick={() => setSelectedYear(y)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all ${selectedYear === y ? "bg-[#8CFF3D] text-black" : "bg-white/5 text-white/40 hover:text-white/70"}`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!currentMonthEntry ? (
            <div className="text-center py-24">
              <p className="text-white/40 text-sm">No shows in {selectedYear}</p>
            </div>
          ) : (
            (() => {
              const [monthKey, monthShows] = currentMonthEntry;
              const monthLabel = new Date(monthKey + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
                    <div className="flex items-center justify-between mb-6">
                      <button
                        onClick={() => setMonthIndex((i) => Math.min(i + 1, monthGroups.length - 1))}
                        disabled={monthIndex >= monthGroups.length - 1}
                        className="p-2 rounded-full text-white/50 hover:text-white disabled:opacity-20 disabled:hover:text-white/50"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <h2 className="font-bold text-xl" style={{ color: settings?.text_color || "#ffffff" }}>{monthLabel}</h2>
                      <button
                        onClick={() => setMonthIndex((i) => Math.max(i - 1, 0))}
                        disabled={monthIndex <= 0}
                        className="p-2 rounded-full text-white/50 hover:text-white disabled:opacity-20 disabled:hover:text-white/50"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {monthShows.map((show, i) => (
                        <ShowStamp key={show.id} show={show} onClick={() => setSelectedShow(show)} rotation={((i * 37) % 7) - 3} />
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

            <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">Visible on public Logbook</p>
                <p className="text-white/30 text-xs mt-0.5">Anyone who flips your digital business card can see this stamp</p>
              </div>
              <button
                onClick={() => togglePublic(selectedShow)}
                disabled={togglingPublic}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-3 ${selectedShow.logbook_public ? "bg-[#8CFF3D]" : "bg-white/10"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${selectedShow.logbook_public ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
