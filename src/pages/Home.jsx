import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { Link } from "react-router-dom";
import { Search, Plus, SlidersHorizontal, X, Star, Zap, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ShowCard from "@/components/showpilot/ShowCard";
import BottomTabs from "@/components/showpilot/BottomTabs";
import SettingsDrawer from "@/components/showpilot/SettingsDrawer";
import { usePreferences } from "@/hooks/usePreferences";

// Status tabs config
const STATUS_TABS = [
  { id: "not_started", label: "New", shortLabel: "New", activeBg: "bg-white/10", activeText: "text-white", dot: "bg-white/30" },
  { id: "in_progress", label: "Frequent", shortLabel: "Frequent", activeBg: "bg-blue-500/15", activeText: "text-blue-400", dot: "bg-blue-400" },
  { id: "complete", label: "Worked", shortLabel: "Worked", activeBg: "bg-[#8CFF3D]/15", activeText: "text-[#8CFF3D]", dot: "bg-[#8CFF3D]" },
  { id: "starred", label: "Starred", shortLabel: "★", activeBg: "bg-amber-500/15", activeText: "text-amber-400", dot: null },
];

export default function Home() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("not_started");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef(null);
  const { preferences, reload } = usePreferences();

  useEffect(() => {
    let isMounted = true;

    async function loadShows() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("shows")
        .select("*")
        .eq("owner_id", user.id)
        .order("date", { ascending: false });

      if (error) {
        console.error("Error loading shows:", error);
      } else if (isMounted) {
        setShows(data || []);
      }
      if (isMounted) setLoading(false);
    }

    loadShows();
    return () => { isMounted = false; };
  }, []);

  const years = useMemo(() => {
    const yrs = [...new Set(shows.map((s) => s.date?.slice(0, 4)).filter(Boolean))];
    return yrs.sort().reverse();
  }, [shows]);

  const genres = useMemo(() => [...new Set(shows.map((s) => s.genre_tag).filter(Boolean))], [shows]);
  const venues = useMemo(() => [...new Set(shows.map((s) => s.venue).filter(Boolean))].sort(), [shows]);

  // Parse city and state from location field "City, State"
  const cities = useMemo(() => {
    const all = shows.map((s) => s.location?.split(",")[0]?.trim()).filter(Boolean);
    return [...new Set(all)].sort();
  }, [shows]);
  const states = useMemo(() => {
    const all = shows.map((s) => s.location?.split(",")[1]?.trim()).filter(Boolean);
    return [...new Set(all)].sort();
  }, [shows]);

  // Predictive suggestions: band names + venues + locations matching current search
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

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // This week's shows (Mon–Sun of current week)
  const thisWeekShows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Get Monday of this week
    const dayOfWeek = today.getDay(); // 0=Sun
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return shows
      .filter((s) => {
        if (!s.date) return false;
        const d = new Date(s.date + "T00:00:00");
        return d >= today && d <= sunday;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [shows]);

  const weekLabel = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(monday)} – ${fmt(sunday)}`;
  }, []);

  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // Shows within the next 4 days (upcoming feed)
  const upcomingShows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 4);
    return shows
      .filter((s) => {
        if (!s.date) return false;
        const d = new Date(s.date);
        return d >= today && d <= soon;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [shows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return shows.filter((s) => {
      // If searching, show all results across all tabs/statuses
      if (!q) {
        // Tab filter
        if (activeTab === "starred") {
          if (!s.starred) return false;
        } else {
          if (s.starred) return false;
          if (s.status !== activeTab) return false;
        }
      } else {
        // Search mode: match band name, venue, or location
        if (!s.band_name?.toLowerCase().includes(q) && !s.venue?.toLowerCase().includes(q) && !s.location?.toLowerCase().includes(q)) return false;
      }
      // Dropdown filters always apply
      if (yearFilter !== "all" && !s.date?.startsWith(yearFilter)) return false;
      if (monthFilter !== "all" && s.date) {
        const m = new Date(s.date).getMonth();
        if (m !== parseInt(monthFilter)) return false;
      }
      if (genreFilter !== "all" && s.genre_tag !== genreFilter) return false;
      if (venueFilter !== "all" && s.venue !== venueFilter) return false;
      if (cityFilter !== "all" && !s.location?.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (stateFilter !== "all" && !s.location?.toLowerCase().includes(stateFilter.toLowerCase())) return false;
      return true;
    });
  }, [shows, search, activeTab, yearFilter, monthFilter, genreFilter, venueFilter, cityFilter, stateFilter]);

  const genreTagMap = useMemo(() => {
    const map = {};
    (preferences?.genre_tags || []).forEach(t => { map[t.name] = t.color; });
    return map;
  }, [preferences]);

  const hasActiveFilters = yearFilter !== "all" || monthFilter !== "all" || genreFilter !== "all" || venueFilter !== "all" || cityFilter !== "all" || stateFilter !== "all";
  const clearFilters = () => { setYearFilter("all"); setMonthFilter("all"); setGenreFilter("all"); setVenueFilter("all"); setCityFilter("all"); setStateFilter("all"); };

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <SettingsDrawer preferences={preferences} onPreferencesUpdate={reload} />
          <h1 className="text-lg font-bold text-white tracking-tight">
            Show<span className="text-[#8CFF3D]">Pilot</span>
          </h1>
          <Link to="/show/new">
            <Button size="sm" className="bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-8 w-8 p-0 rounded-xl">
              <Plus className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* Search row */}
        <div className="px-4 pb-2 max-w-lg mx-auto">
          <div className="flex gap-2">
            <div className="relative flex-1" ref={searchRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search bands, venues..."
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterOpen(!filterOpen)}
              className={`h-10 w-10 p-0 rounded-xl border-[#222] ${filterOpen ? "bg-[#8CFF3D] text-black border-[#8CFF3D]" : "bg-[#161616] text-white/50"}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
          </div>

          {filterOpen && (
            <div className="flex gap-2 mt-2 flex-wrap">
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="h-8 bg-[#1a1a1a] border-[#2a2a2a] text-white text-xs w-auto min-w-[80px] rounded-lg">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={monthFilter} onValueChange={setMonthFilter}>
                <SelectTrigger className="h-8 bg-[#1a1a1a] border-[#2a2a2a] text-white text-xs w-auto min-w-[80px] rounded-lg">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={genreFilter} onValueChange={setGenreFilter}>
                <SelectTrigger className="h-8 bg-[#1a1a1a] border-[#2a2a2a] text-white text-xs w-auto min-w-[80px] rounded-lg">
                  <SelectValue placeholder="Genre" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                  <SelectItem value="all">All Genres</SelectItem>
                  {genres.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={venueFilter} onValueChange={setVenueFilter}>
                <SelectTrigger className="h-8 bg-[#1a1a1a] border-[#2a2a2a] text-white text-xs w-auto min-w-[90px] rounded-lg">
                  <SelectValue placeholder="Venue" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                  <SelectItem value="all">All Venues</SelectItem>
                  {venues.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="h-8 bg-[#1a1a1a] border-[#2a2a2a] text-white text-xs w-auto min-w-[80px] rounded-lg">
                  <SelectValue placeholder="City" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="h-8 bg-[#1a1a1a] border-[#2a2a2a] text-white text-xs w-auto min-w-[80px] rounded-lg">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                  <SelectItem value="all">All States</SelectItem>
                  {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" className="h-8 text-white/40 hover:text-white px-2" onClick={clearFilters}>
                  <X className="w-3 h-3 mr-1" /> Clear
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Status Tabs */}
        <div className="px-4 pb-3 max-w-lg mx-auto">
          <div className="flex gap-1 bg-[#111] rounded-xl p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id ? `${tab.activeBg} ${tab.activeText}` : "text-white/35 hover:text-white/60"
                }`}
              >
                <span>{tab.shortLabel}</span>
                {tab.id === "starred"
                  ? <Star className="w-3 h-3" fill={activeTab === "starred" ? "currentColor" : "none"} />
                  : tab.dot && <span className={`w-1.5 h-1.5 rounded-full ${tab.dot}`} />
                }
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* This Week Banner */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-3.5 h-3.5 text-white/40" />
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">This Week</p>
            <span className="ml-auto text-[10px] text-white/25">{weekLabel}</span>
          </div>
          {thisWeekShows.length === 0 ? (
            <p className="text-white/30 text-sm">No shows scheduled this week — enjoy the break.</p>
          ) : (
            <div className="space-y-2">
              {thisWeekShows.map((show) => {
                const d = new Date(show.date + "T00:00:00");
                const today = new Date(); today.setHours(0,0,0,0);
                const diff = Math.round((d - today) / 86400000);
                const dayLabel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : DAY_NAMES[d.getDay()];
                return (
                  <Link key={show.id} to={`/show/${show.id}`} className="flex items-center gap-3 hover:bg-white/5 rounded-xl px-2 py-1.5 -mx-2 transition-colors">
                    <div className="w-14 shrink-0">
                      <p className={`text-xs font-bold ${diff === 0 ? "text-[#8CFF3D]" : diff === 1 ? "text-amber-400" : "text-white/50"}`}>{dayLabel}</p>
                      <p className="text-[10px] text-white/25">{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                    </div>
                    <div className="w-px h-7 bg-[#222] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{show.band_name}</p>
                      {show.venue && <p className="text-white/35 text-xs truncate">{show.venue}</p>}
                    </div>
                    {show.starred && <Star className="w-3 h-3 text-amber-400 shrink-0" fill="currentColor" />}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Feed */}
      {upcomingShows.length > 0 && (
        <div className="px-4 pt-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-3.5 h-3.5 text-[#8CFF3D]" />
            <p className="text-xs text-[#8CFF3D] uppercase tracking-wider font-semibold">Coming Up</p>
          </div>
          <div className="space-y-2">
            {upcomingShows.map((show) => {
              const d = new Date(show.date);
              const today = new Date(); today.setHours(0,0,0,0);
              const diff = Math.round((d - today) / 86400000);
              const label = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `In ${diff} days`;
              return (
                <Link key={show.id} to={`/show/${show.id}`} className="flex items-center gap-3 bg-[#0f1a07] border border-[#8CFF3D]/20 rounded-xl px-4 py-3 hover:border-[#8CFF3D]/40 transition-all">
                  <div className="text-center min-w-[52px]">
                    <p className="text-[#8CFF3D] text-xs font-bold">{label}</p>
                    <p className="text-white/40 text-[10px]">{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  </div>
                  <div className="w-px h-8 bg-[#8CFF3D]/20" />
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{show.band_name}</p>
                    {show.venue && <p className="text-white/40 text-xs truncate">{show.venue}</p>}
                  </div>
                  {show.starred && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-auto" fill="currentColor" />}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Shows List */}
      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Link to="/show/new" className="w-16 h-16 rounded-2xl bg-[#161616] hover:bg-[#1e1e1e] border border-[#222] hover:border-[#8CFF3D]/40 flex items-center justify-center mx-auto mb-4 transition-all group">
              {activeTab === "starred"
                ? <Star className="w-7 h-7 text-white/20 group-hover:text-amber-400 transition-colors" />
                : <Plus className="w-7 h-7 text-white/20 group-hover:text-[#8CFF3D] transition-colors" />
              }
            </Link>
            <p className="text-white/40 text-sm mb-1">
              {activeTab === "starred" ? "No starred shows" : shows.length === 0 ? "No shows yet" : `No ${activeTab.replace("_", " ")} shows`}
            </p>
            <p className="text-white/25 text-xs">
              {activeTab === "starred" ? "Star a show to find it quickly here" : shows.length === 0 ? "Tap + to create your first show" : "Tap + to add one"}
            </p>
          </div>
        ) : (
          filtered.map((show) => <ShowCard key={show.id} show={show} genreTagMap={genreTagMap} />)
        )}
      </div>

      <BottomTabs />
    </div>
  );
}
