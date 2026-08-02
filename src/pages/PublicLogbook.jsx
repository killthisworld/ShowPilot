import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, X, MapPin, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STAMP_COLORS = ["#8CFF3D", "#60A5FA", "#F59E0B", "#F472B6", "#A78BFA", "#34D399", "#F87171", "#38BDF8"];

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return STAMP_COLORS[Math.abs(hash) % STAMP_COLORS.length];
}

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < (str || "").length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function getConstellationLayout(monthShows) {
  const n = monthShows.length;
  if (n === 0) return { positions: [], rows: 0, cols: 0 };
  const cols = Math.max(3, Math.ceil(Math.sqrt(n * 1.5)));
  const rows = Math.ceil(n / cols) + 1;

  // Order every cell by distance from center, so filling them in sequence
  // naturally builds outward from the middle of the page.
  const centerCol = (cols - 1) / 2;
  const centerRow = (rows - 1) / 2;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ col: c, row: r, dist: Math.hypot(c - centerCol, r - centerRow) });
    }
  }
  cells.sort((a, b) => a.dist - b.dist);

  // Earliest show of the month gets the most central cell, so the
  // constellation reads as growing outward as the month goes on.
  const sortedShows = [...monthShows].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const positions = sortedShows.map((show, idx) => {
    const cell = cells[idx] || cells[cells.length - 1];
    const seed = hashString(show.id || `${show.band_name}-${show.date}-${idx}`);
    const jitterX = (seededRandom(seed) - 0.5) * 0.6;
    const jitterY = (seededRandom(seed + 1) - 0.5) * 0.6;
    const rotation = (seededRandom(seed + 2) - 0.5) * 14;

    const xPct = ((cell.col + 0.5 + jitterX) / cols) * 100;
    const yPct = ((cell.row + 0.5 + jitterY) / rows) * 100;

    return { show, xPct, yPct, rotation };
  });

  return { positions, rows, cols };
}

function ShowStamp({ show, onClick, rotation, isNewest }) {
  const color = hashColor(show.venue || show.band_name || "show");

  return (
    <button
      onClick={onClick}
      className="group relative flex items-center justify-center transition-transform duration-300 hover:scale-150"
      style={{ width: 56, height: 56 }}
    >
      {isNewest && (
        <style>{`
          @keyframes starPulseGlow {
            0%, 100% { transform: scale(1); opacity: 0.7; }
            50% { transform: scale(1.6); opacity: 1; }
          }
          @keyframes starPulseCore {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.35); }
          }
        `}</style>
      )}
      <div
        className="absolute rounded-full transition-opacity duration-300 group-hover:opacity-100"
        style={{
          width: isNewest ? 50 : 40,
          height: isNewest ? 50 : 40,
          background: `radial-gradient(circle, ${color}88 0%, transparent 70%)`,
          filter: "blur(5px)",
          opacity: 0.85,
          animation: isNewest ? "starPulseGlow 1.4s ease-in-out infinite" : undefined,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: isNewest ? 11 : 9,
          height: isNewest ? 11 : 9,
          background: `radial-gradient(circle at 35% 30%, #ffffff, ${color})`,
          boxShadow: isNewest
            ? `0 0 14px 5px ${color}ee, 0 0 30px 12px ${color}88`
            : `0 0 8px 2px ${color}cc, 0 0 18px 7px ${color}55`,
          animation: isNewest ? "starPulseCore 1.4s ease-in-out infinite" : undefined,
        }}
      />
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
  const [selectedYear, setSelectedYear] = useState(null);
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

  const availableYears = useMemo(
    () => [...new Set(shows.map((s) => s.date?.slice(0, 4)).filter(Boolean))].sort().reverse(),
    [shows]
  );

  const monthsInYear = useMemo(
    () => monthGroups.filter(([key]) => key.startsWith(selectedYear)),
    [monthGroups, selectedYear]
  );

  useEffect(() => {
    if (!selectedYear && availableYears.length > 0) setSelectedYear(availableYears[0]);
  }, [availableYears, selectedYear]);

  useEffect(() => {
    if (selectedYear && monthsInYear.length > 0 && (!selectedMonthKey || !selectedMonthKey.startsWith(selectedYear))) {
      setSelectedMonthKey(monthsInYear[0][0]);
    }
  }, [selectedYear, monthsInYear, selectedMonthKey]);

  const handleYearChange = (y) => {
    setSelectedYear(y);
    const firstInYear = monthGroups.find(([key]) => key.startsWith(y));
    if (firstInYear) setSelectedMonthKey(firstInYear[0]);
  };

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
                    <div className="flex items-center justify-center gap-2 mb-6">
                      {availableYears.length > 1 && (
                        <Select value={selectedYear || ""} onValueChange={handleYearChange}>
                          <SelectTrigger
                            className="w-auto px-3 py-2.5 rounded-xl border-2 font-bold text-xl h-auto bg-black/30"
                            style={{ color: settings?.text_color || "#ffffff", borderColor: (settings?.text_color || "#ffffff") + "40" }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                            {availableYears.map((y) => (
                              <SelectItem key={y} value={y}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Select value={selectedMonthKey || ""} onValueChange={setSelectedMonthKey}>
                        <SelectTrigger
                          className="w-auto px-5 py-2.5 rounded-xl border-2 font-bold text-xl h-auto bg-black/30"
                          style={{ color: settings?.text_color || "#ffffff", borderColor: (settings?.text_color || "#ffffff") + "40" }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                          {monthsInYear.map(([key]) => (
                            <SelectItem key={key} value={key}>
                              {new Date(key + "-01T00:00:00").toLocaleDateString("en-US", { month: "long" })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(() => {
                      const { positions, rows } = getConstellationLayout(monthShows);
                      const containerHeight = Math.max(320, rows * 110);
                      return (
                        <div className="relative" style={{ height: containerHeight }}>
                          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                            {positions.slice(1).map((pos, i) => (
                              <line
                                key={i}
                                x1={`${positions[i].xPct}%`}
                                y1={`${positions[i].yPct}%`}
                                x2={`${pos.xPct}%`}
                                y2={`${pos.yPct}%`}
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="1"
                              />
                            ))}
                          </svg>
                          {positions.map((pos, i) => (
                            <div
                              key={i}
                              className="absolute z-10"
                              style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, transform: "translate(-50%, -50%)" }}
                            >
                              <ShowStamp show={pos.show} onClick={() => setSelectedShow(pos.show)} rotation={pos.rotation} isNewest={i === positions.length - 1} />
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()
          )}
        </>
      )}

      {selectedShow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onClick={() => setSelectedShow(null)}>
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
