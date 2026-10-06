import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { CalendarDays, Plus, Search, MapPin, Link2, SlidersHorizontal, X } from "lucide-react";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import BandSettingsDrawer from "@/components/showpilot/BandSettingsDrawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/hooks/usePreferences";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import GigWeb from "@/pages/GigWeb";
import GigWrapCelebration from "@/components/showpilot/GigWrapCelebration";
import StatusStrip from "@/components/showpilot/StatusStrip";
import { buildStatusStrip, getRoleBanks } from "@/lib/homeStats";
import { SCENE_MONO } from "@/lib/sceneStyle";
import EventTypeIcon from "@/components/showpilot/EventTypeIcon";
import { fetchMyIcons } from "@/lib/eventIcons";
import { eventTypeColor, buildEventTypeOptions, matchesEventType, buildGenreOptions, matchesGenre, addCustomEventType, addGenreTag, ADD_NEW_VALUE } from "@/lib/eventTypes";

// The home screen for every account type except engineer/lighting (those
// keep the card-list Home.jsx). This used to be a starfield constellation -
// a nice hero, but feedback from an actual venue owner made the problem
// obvious: a venue running hundreds of shows a year can't find anything in
// an unlabeled field of dots. The star idea itself wasn't wrong, it was
// just in the wrong place - it's kept exactly as before over in Logbook,
// which is a "look back on what happened" view where a loose field of
// stamps is the point. Here, where the job is "find and open a specific
// upcoming show," that's a search box and a labeled, month-grouped list.
// Tapping a row doesn't navigate away, it brings the Gig Web hub forward
// as a layer over this screen, same as always.
export default function BandHome() {
  const navigate = useNavigate();
  const { preferences, reload } = usePreferences();
  const accountStyle = getAccountTypeStyle(preferences?.account_type);
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [webToken, setWebToken] = useState(null);
  const [webVisible, setWebVisible] = useState(false);
  const [search, setSearch] = useState("");
  // Same search + filter panel, in the same spot, as the tech Home: a
  // search box with a sliders toggle in the sticky header, and a
  // Year / Month / Genre / Event Type / Venue / City / State panel under it.
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeBank, setActiveBank] = useState("all");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const searchRef = useRef(null);
  // show_id -> { confirmed_roles, total_roles, open_tasks }, from
  // get_gigs_home_progress - best-effort like the wrap queue below, a
  // failed/slow fetch just means rows render without their progress
  // ring rather than blocking the list.
  const [progressByShow, setProgressByShow] = useState({});
  // The post-show "web comes together into a star" celebration - queued
  // shows the viewer hasn't seen their wrap-up for yet (get_unseen_gig_wraps),
  // played one at a time; get_unseen_gig_wraps already only returns shows
  // not yet in gig_wrap_views for this viewer, so nothing else needs to
  // track "already seen" client-side.
  const [wrapQueue, setWrapQueue] = useState([]);

  // Pulled out of the mount effect so it can be re-run after Gig Web
  // reports an owned show got archived or deleted there - otherwise that
  // row would keep sitting in the list, stale, until the next full page
  // load.
  const loadGigs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setCurrentUserId(user.id);

    const { data: owned } = await supabase
      .from("shows")
      .select("*")
      .eq("owner_id", user.id)
      .eq("archived", false)
      .order("date", { ascending: true });

    const { data: links } = await supabase
      .from("linked_gigs")
      .select("share_token, linked_at, starred")
      .eq("user_id", user.id)
      .eq("archived", false)
      .order("linked_at", { ascending: false });

    // Which of this account's own events have been shared with anyone
    // else - these belong in "Linked" too, since sharing is a two-way
    // relationship, not just something that happens to other people's
    // events.
    const { data: sentInvites } = await supabase
      .from("gig_invites")
      .select("show_id")
      .eq("created_by", user.id);
    const sharedShowIds = new Set((sentInvites || []).map((i) => i.show_id));

    let linkedGigs = [];
    if (links) {
      const details = await Promise.all(
        links.map(async (link) => {
          const { data } = await supabase.rpc("get_shared_gig", { p_token: link.share_token });
          return data ? { ...data, share_token: link.share_token, is_owned: false, starred: link.starred } : null;
        })
      );
      const myIcons = await fetchMyIcons();
      linkedGigs = details.filter(Boolean).map((g) => ({ ...g, icon_url: myIcons[g.id] || g.icon_url }));
    }

    const ownedGigs = (owned || []).map((s) => ({ ...s, is_owned: true, is_shared_by_me: sharedShowIds.has(s.id) }));
    const allGigs = [...ownedGigs, ...linkedGigs];
    setGigs(allGigs);
    setLoading(false);

    // Best-effort, same as the rest of this load - a stale/missing RPC
    // just means no celebration plays this visit, never something that
    // should block the list itself from loading.
    const { data: unseen, error: unseenError } = await supabase.rpc("get_unseen_gig_wraps");
    if (!unseenError && unseen?.length) setWrapQueue(unseen);

    // One bulk call for every visible show's progress - both owned and
    // linked, same "just needs the id" shape get_shared_gig already
    // returns for linked gigs - rather than a query per row.
    const progressIds = allGigs.map((g) => g.id).filter(Boolean);
    if (progressIds.length > 0) {
      const { data: progressRows, error: progressError } = await supabase.rpc("get_gigs_home_progress", { p_show_ids: progressIds });
      if (!progressError && progressRows) {
        const map = {};
        progressRows.forEach((row) => { map[row.show_id] = row; });
        setProgressByShow(map);
      }
    }
  };
  useEffect(() => { loadGigs(); }, []);

  const openGig = (g) => {
    setWebToken(g.share_token);
    // Mounts with the layer already positioned off-screen, then flips to
    // its resting position next frame - a plain Tailwind transition, no
    // animation config to add, but still reads as "brought to the front"
    // rather than a hard cut.
    requestAnimationFrame(() => requestAnimationFrame(() => setWebVisible(true)));
  };
  const closeGig = () => {
    setWebVisible(false);
    setTimeout(() => setWebToken(null), 250);
  };

  // Called once the celebration finishes (the formed star rises and
  // fades) - a show that's wrapped is a show that's over, so this is also
  // the moment it actually becomes a Logbook entry: mark it done (only
  // the owner can - a claimed-but-not-owned show's Logbook copy doesn't
  // key off `done` at all, see Logbook.jsx), record that this viewer has
  // seen the wrap-up, then take them straight there to see it land.
  const finishWrap = async (wrap) => {
    setWrapQueue((q) => q.slice(1));
    const matchedGig = gigs.find((g) => g.id === wrap.id || g.share_token === wrap.share_token);
    if (matchedGig?.is_owned) {
      try {
        const { error } = await supabase.from("shows").update({ done: true }).eq("id", wrap.id);
        if (error) throw error;
      } catch (e) {
        console.error(e);
      }
    }
    try {
      await supabase.rpc("mark_gig_wrap_seen", { p_show_id: wrap.id });
    } catch (e) {
      console.error(e);
    }
    navigate("/logbook", { state: { landOnShowId: wrap.id, landOnDate: wrap.date } });
  };

  const handleCreateEvent = () => navigate("/event/new");

  const gigKey = (g) => (g.is_owned ? g.id : g.share_token);

  const sortedGigs = useMemo(() => {
    return [...gigs].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });
  }, [gigs]);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const years = useMemo(
    () => [...new Set(sortedGigs.map((g) => g.date?.slice(0, 4)).filter(Boolean))].sort().reverse(),
    [sortedGigs]
  );
  const genres = useMemo(() => buildGenreOptions(sortedGigs, preferences?.genre_tags), [sortedGigs, preferences?.genre_tags]);
  // Built-ins + custom types the user added + any type already on an event.
  const eventTypes = useMemo(
    () => buildEventTypeOptions(sortedGigs, preferences?.custom_event_types),
    [sortedGigs, preferences?.custom_event_types]
  );
  const venues = useMemo(() => [...new Set(sortedGigs.map((g) => g.venue).filter(Boolean))].sort(), [sortedGigs]);
  const cities = useMemo(() => [...new Set(sortedGigs.map((g) => g.city?.trim()).filter(Boolean))].sort(), [sortedGigs]);
  const states = useMemo(() => [...new Set(sortedGigs.map((g) => g.state?.trim()).filter(Boolean))].sort(), [sortedGigs]);

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const candidates = new Set();
    sortedGigs.forEach((g) => {
      const title = g.event_name || g.band_name;
      if (title?.toLowerCase().includes(q)) candidates.add(title);
      if (g.venue?.toLowerCase().includes(q)) candidates.add(g.venue);
      if (g.city?.toLowerCase().includes(q)) candidates.add(g.city);
    });
    return [...candidates].slice(0, 6);
  }, [search, sortedGigs]);

  const roleBanks = useMemo(() => getRoleBanks(preferences?.account_type, accountStyle.color), [preferences?.account_type, accountStyle.color]);
  const bankCounts = useMemo(() => {
    const counts = {};
    roleBanks.forEach((b) => { counts[b.id] = b.id === "all" ? sortedGigs.length : sortedGigs.filter(b.test).length; });
    return counts;
  }, [roleBanks, sortedGigs]);
  const activeBankDef = roleBanks.find((b) => b.id === activeBank) || roleBanks[0];

  const filteredGigs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedGigs.filter((g) => {
      if (q) {
        const hit =
          (g.event_name || "").toLowerCase().includes(q) ||
          (g.band_name || "").toLowerCase().includes(q) ||
          g.venue?.toLowerCase().includes(q) ||
          g.city?.toLowerCase().includes(q) ||
          g.state?.toLowerCase().includes(q);
        if (!hit) return false;
      }
      // The selected bank narrows the list unless the user is searching (search spans everything, like the tech Home).
      if (!q && !activeBankDef.test(g)) return false;
      if (yearFilter !== "all" && !g.date?.startsWith(yearFilter)) return false;
      if (monthFilter !== "all") {
        if (!g.date || new Date(g.date + "T00:00:00").getMonth() !== parseInt(monthFilter)) return false;
      }
      if (!matchesGenre(g, genreFilter)) return false;
      if (!matchesEventType(g, eventTypeFilter)) return false;
      if (venueFilter !== "all" && g.venue !== venueFilter) return false;
      if (cityFilter !== "all" && g.city?.trim() !== cityFilter) return false;
      if (stateFilter !== "all" && g.state?.trim() !== stateFilter) return false;
      return true;
    });
  }, [sortedGigs, search, activeBankDef, yearFilter, monthFilter, genreFilter, eventTypeFilter, venueFilter, cityFilter, stateFilter]);

  // "Add new..." at the bottom of the Genre / Event Type dropdowns. Saves to
  // the user's preferences (the same lists the event forms use) and
  // reloads them, so the new entry appears everywhere those lists do.
  const handleAddNew = async (kind) => {
    const label = kind === "genre" ? "genre" : "event type";
    const input = window.prompt(`Add a new ${label}:`);
    if (!input || !input.trim()) return;
    try {
      const saved = kind === "genre" ? await addGenreTag(preferences, input) : await addCustomEventType(preferences, input);
      if (saved) await reload();
    } catch (e) {
      console.error(e);
      window.alert(`Couldn't save the new ${label}. Please try again.`);
    }
  };
  const onGenreChange = (v) => (v === ADD_NEW_VALUE ? handleAddNew("genre") : setGenreFilter(v));
  const onEventTypeChange = (v) => (v === ADD_NEW_VALUE ? handleAddNew("eventType") : setEventTypeFilter(v));

  const hasActiveFilters = yearFilter !== "all" || monthFilter !== "all" || genreFilter !== "all" || eventTypeFilter !== "all" || venueFilter !== "all" || cityFilter !== "all" || stateFilter !== "all";
  const clearFilters = () => {
    setYearFilter("all"); setMonthFilter("all"); setGenreFilter("all"); setEventTypeFilter("all");
    setVenueFilter("all"); setCityFilter("all"); setStateFilter("all");
  };

  // Grouped by month, soonest first - the same organizing idea Logbook
  // already uses for looking back, just running forward instead. This is
  // what actually scales to hundreds of shows: a venue can jump straight
  // to "October" instead of hunting through an undifferentiated field.
  const monthGroups = useMemo(() => {
    const groups = {};
    const undated = [];
    filteredGigs.forEach((g) => {
      if (!g.date) { undated.push(g); return; }
      const key = g.date.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(g);
    });
    const entries = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
    if (undated.length > 0) entries.push(["undated", undated]);
    return entries;
  }, [filteredGigs]);

  const monthLabel = (key) =>
    key === "undated" ? "No Date" : new Date(key + "-01T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const stripCells = useMemo(
    () => buildStatusStrip(preferences?.account_type, gigs, progressByShow),
    [preferences?.account_type, gigs, progressByShow]
  );

  const thisWeekGigs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return gigs
      .filter((g) => {
        if (!g.date) return false;
        const d = new Date(g.date + "T00:00:00");
        return d >= today && d <= sunday;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [gigs]);

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

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-4 max-w-lg mx-auto">
          <BandSettingsDrawer preferences={preferences} onPreferencesUpdate={reload} />
          <h1 className="text-white font-bold text-lg">
            Show<span style={{ color: accountStyle.color }}>Pilot</span>
          </h1>
          <button onClick={handleCreateEvent} className="w-9 h-9 rounded-full bg-[#8CFF3D] text-black flex items-center justify-center hover:bg-[#7ae62e] transition-colors">
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Search row - same as the tech Home */}
        <div className="px-4 pb-3 max-w-lg mx-auto">
          <div className="flex gap-2">
            <div className="relative flex-1" ref={searchRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search shows, venues..."
                className="pl-9 h-10 bg-[#161616] border-[#222] text-white placeholder:text-white/25 rounded-xl"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-xl z-50 overflow-hidden">
                  {suggestions.map((sg, i) => (
                    <button key={i} onMouseDown={() => { setSearch(sg); setShowSuggestions(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-[#222] flex items-center gap-2">
                      <Search className="w-3 h-3 text-white/30" />
                      <span>{sg}</span>
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
              <Select value={genreFilter} onValueChange={onGenreChange}>
                <SelectTrigger className="h-8 bg-[#1a1a1a] border-[#2a2a2a] text-white text-xs w-auto min-w-[80px] rounded-lg">
                  <SelectValue placeholder="Genre" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                  <SelectItem value="all">All Genres</SelectItem>
                  {genres.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  <SelectItem value={ADD_NEW_VALUE} className="text-[#8CFF3D]">+ Add new…</SelectItem>
                </SelectContent>
              </Select>
              <Select value={eventTypeFilter} onValueChange={onEventTypeChange}>
                <SelectTrigger className="h-8 bg-[#1a1a1a] border-[#2a2a2a] text-white text-xs w-auto min-w-[90px] rounded-lg">
                  <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                  <SelectItem value="all">All Event Types</SelectItem>
                  {eventTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  <SelectItem value={ADD_NEW_VALUE} className="text-[#8CFF3D]">+ Add new…</SelectItem>
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
                  {states.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
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

        {/* Role banks - colored buttons for the buckets this profile works through */}
        <div className="px-4 pb-3 max-w-lg mx-auto">
          <div className="flex gap-1.5">
            {roleBanks.map((bank) => {
              const active = activeBankDef.id === bank.id;
              return (
                <button
                  key={bank.id}
                  onClick={() => setActiveBank(bank.id)}
                  className="flex-1 min-w-0 flex flex-col items-center gap-1.5 pt-2 pb-1.5 rounded-lg transition-all"
                  style={{
                    background: active ? bank.color : bank.color + "24",
                    border: `1px solid ${active ? bank.color : bank.color + "66"}`,
                    boxShadow: active ? `0 0 14px ${bank.color}66` : "none",
                  }}
                >
                  <span className="w-[22px] h-1 rounded-sm" style={{ background: active ? "#0d0d0d" : bank.color }} />
                  <span className="text-xs font-bold tracking-[0.06em]" style={{ color: active ? "#0d0d0d" : bank.color }}>{bank.label}</span>
                  <span className="text-[10px]" style={{ fontFamily: SCENE_MONO, color: active ? "rgba(13,13,13,0.7)" : "rgba(255,255,255,0.55)" }}>{bankCounts[bank.id] || 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {!loading && gigs.length > 0 && (
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <StatusStrip cells={stripCells} />
        </div>
      )}

      <div className="px-4 pt-3 max-w-lg mx-auto">
        <div className="bg-[#111] border border-white/25 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-3.5 h-3.5 text-white/40" />
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">This Week</p>
            <span className="ml-auto text-[10px] text-white/25">{weekLabel}</span>
          </div>
          {thisWeekGigs.length === 0 ? (
            <p className="text-white/30 text-sm">No shows scheduled this week — enjoy the break.</p>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {thisWeekGigs.map((g) => {
                const d = new Date(g.date + "T00:00:00");
                const title = g.event_name || g.band_name || "Untitled Gig";
                const color = eventTypeColor(g.event_type) || (g.is_owned ? "#8CFF3D" : "#F472B6");
                return (
                  <button
                    key={gigKey(g)}
                    onClick={() => openGig(g)}
                    className="flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 hover:brightness-110 transition-all shrink-0 text-left"
                    style={{ backgroundColor: color + "1a", borderLeft: `2px solid ${color}` }}
                  >
                    <span className="text-xs font-semibold truncate max-w-[90px]" style={{ color }}>{title}</span>
                    <span className="text-[9px] text-white/40">{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-white font-semibold text-sm">Your Shows</h2>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-white/35"><span className="w-1.5 h-1.5 rounded-full bg-[#8CFF3D]" /> Owned</span>
            <span className="flex items-center gap-1 text-[10px] text-white/35"><span className="w-1.5 h-1.5 rounded-full bg-[#F472B6]" /> Linked</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : sortedGigs.length === 0 ? (
          <div className="text-center py-16 bg-[#111] rounded-2xl border border-[#222]">
            <button
              onClick={handleCreateEvent}
              className="w-16 h-16 rounded-2xl bg-[#161616] hover:bg-[#1e1e1e] border border-[#222] hover:border-[#8CFF3D]/40 flex items-center justify-center mx-auto mb-4 transition-all group"
            >
              <Plus className="w-7 h-7 text-white/20 group-hover:text-[#8CFF3D] transition-colors" />
            </button>
            <p className="text-white/40 text-sm">No shows yet</p>
          </div>
        ) : monthGroups.length === 0 ? (
          <p className="text-center text-white/30 text-sm py-12">No shows match your search or filters</p>
        ) : (
          <div className="space-y-4">
            {monthGroups.map(([monthKey, monthGigs]) => (
              <div key={monthKey}>
                <p className="text-[#8CFF3D]/80 font-bold text-xs uppercase tracking-wide mb-1.5 px-1">{monthLabel(monthKey)}</p>
                <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl divide-y divide-[#1f1f1f] overflow-hidden">
                  {monthGigs.map((g) => {
                    const color = g.is_owned ? "#8CFF3D" : "#F472B6";
                    const typeColor = eventTypeColor(g.event_type);
                    const d = g.date ? new Date(g.date + "T00:00:00") : null;
                    const prog = progressByShow[g.id];
                    const ringDeg = prog ? Math.round((prog.confirmed_roles / Math.max(prog.total_roles, 1)) * 360) : 0;
                    return (
                      <button
                        key={gigKey(g)}
                        type="button"
                        onClick={() => openGig(g)}
                        className="relative w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/[0.03] transition-colors"
                      >
                        {typeColor && <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: typeColor }} />}
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <EventTypeIcon type={g.event_type} imageUrl={g.icon_url} />
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium truncate">{g.event_name || g.band_name || "Untitled Gig"}</p>
                          <div className="flex items-center gap-1 text-white/35 text-xs mt-0.5 truncate">
                            {g.venue && (
                              <span className="flex items-center gap-0.5 truncate">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{[g.venue, g.city].filter(Boolean).join(", ")}</span>
                              </span>
                            )}
                            {typeColor && (
                              <span className="shrink-0 ml-1 text-[9px] font-semibold tracking-wide px-1.5 py-px rounded" style={{ color: typeColor, background: typeColor + "1f" }}>
                                {g.event_type.toUpperCase()}
                              </span>
                            )}
                            {!g.is_owned && (
                              <span className="flex items-center gap-0.5 text-pink-400/70 shrink-0 ml-1">
                                <Link2 className="w-3 h-3" /> Linked
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {d && (
                            <span className="text-white/40 text-xs font-medium">
                              {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {prog && (
                            <div className="flex items-center gap-1" title={`${prog.confirmed_roles}/${prog.total_roles} roles confirmed${prog.open_tasks ? ` · ${prog.open_tasks} open task${prog.open_tasks === 1 ? "" : "s"}` : ""}`}>
                              <span className="text-white/30 text-[9px] font-medium">{prog.confirmed_roles}/{prog.total_roles}</span>
                              <span
                                className="relative w-3.5 h-3.5 rounded-full shrink-0"
                                style={{ background: `conic-gradient(#8CFF3D ${ringDeg}deg, #242424 0deg)` }}
                              >
                                {prog.open_tasks > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 w-[7px] h-[7px] rounded-full bg-[#FACC15] border border-[#111111]" />
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {webToken && (
        // The transform (translate-y, for the slide-up entrance) lives on
        // this outer layer only - never combined with overflow-y-auto on
        // the same element. A transform makes its box the containing
        // block for any position:fixed descendant, so pairing it with
        // overflow here would drag Gig Web's own fixed bottom tab bar
        // along with the scroll instead of leaving it pinned to the
        // viewport. The inner div below owns the scrolling instead, and
        // has no transform of its own, so it doesn't hijack anything.
        <div
          className={`fixed inset-0 z-[60] bg-[#0d0d0d] transition-all duration-300 ease-out ${webVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="h-full overflow-y-auto">
            <GigWeb token={webToken} onClose={closeGig} onGigChanged={loadGigs} />
          </div>
        </div>
      )}

      {/* The post-show celebration, one at a time from the queue. Sits
          above the Gig Web overlay (z-80 vs z-60) since it should never
          be possible for both to be visible at once in practice, but if
          it ever were, the celebration is the one that should win. */}
      {wrapQueue.length > 0 && (
        <GigWrapCelebration
          key={wrapQueue[0].id}
          wrap={wrapQueue[0]}
          onDone={() => finishWrap(wrapQueue[0])}
        />
      )}

      <BandBottomTabs />
    </div>
  );
}
