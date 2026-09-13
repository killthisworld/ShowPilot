import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { MapPin, Calendar, CalendarDays, Plus, Link2, Star } from "lucide-react";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import BandSettingsDrawer from "@/components/showpilot/BandSettingsDrawer";
import { usePreferences } from "@/hooks/usePreferences";

const TABS = [
  { id: "recent", label: "Recent", color: "#8CFF3D" },
  { id: "linked", label: "Linked", color: "#F472B6" },
  { id: "starred", icon: true, color: "#FBBF24" },
];

export default function BandHome() {
  const navigate = useNavigate();
  const { preferences, reload } = usePreferences();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("recent");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: owned } = await supabase
        .from("shows")
        .select("*")
        .eq("owner_id", user.id)
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
        linkedGigs = details.filter(Boolean);
      }

      const ownedGigs = (owned || []).map((s) => ({ ...s, is_owned: true, is_shared_by_me: sharedShowIds.has(s.id) }));
      setGigs([...ownedGigs, ...linkedGigs]);
      setLoading(false);
    };
    load();
  }, []);

  const openGig = (g) => {
    if (g.is_owned) navigate(`/show/${g.id}`);
    else navigate(`/gig/shared?token=${g.share_token}`);
  };

  const handleCreateEvent = () => navigate("/show/new");

  const visibleGigs = useMemo(() => {
    if (activeTab === "starred") return gigs.filter((g) => g.starred);
    if (activeTab === "linked") return gigs.filter((g) => !g.is_owned || g.is_shared_by_me);
    // "recent" - everything, not just the current calendar month
    return gigs;
  }, [gigs, activeTab]);

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
            Show<span className="text-[#8CFF3D]">Pilot</span>
          </h1>
          <button onClick={handleCreateEvent} className="w-9 h-9 rounded-full bg-[#8CFF3D] text-black flex items-center justify-center hover:bg-[#7ae62e] transition-colors">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto">
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
                const color = g.is_owned ? "#8CFF3D" : "#F472B6";
                return (
                  <button
                    key={g.is_owned ? g.id : g.share_token}
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

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-white font-semibold text-sm">Your Shows</h2>
          <div className="flex gap-1">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium"
                  style={
                    active
                      ? { borderColor: tab.color + "80", backgroundColor: tab.color + "1a", color: tab.color }
                      : { borderColor: "#2a2a2a", color: "rgba(255,255,255,0.4)" }
                  }
                >
                  {tab.icon ? (
                    <Star className="w-3.5 h-3.5" fill={active ? "currentColor" : "none"} />
                  ) : (
                    tab.label
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : visibleGigs.length === 0 ? (
          <div className="text-center py-16 bg-[#111] rounded-2xl border border-[#222]">
            {activeTab === "starred" ? (
              <>
                <Star className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-white/40 text-sm">No starred shows yet</p>
              </>
            ) : activeTab === "linked" ? (
              <>
                <Link2 className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-white/40 text-sm">No linked shows yet</p>
              </>
            ) : (
              <>
                <button
                  onClick={handleCreateEvent}
                  className="w-16 h-16 rounded-2xl bg-[#161616] hover:bg-[#1e1e1e] border border-[#222] hover:border-[#8CFF3D]/40 flex items-center justify-center mx-auto mb-4 transition-all group"
                >
                  <Plus className="w-7 h-7 text-white/20 group-hover:text-[#8CFF3D] transition-colors" />
                </button>
                <p className="text-white/40 text-sm">No shows this month</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleGigs.map((g) => {
              const title = g.event_name || g.band_name || "Untitled Gig";
              const location = [g.venue, [g.city, g.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
              const accent = g.is_owned ? "#8CFF3D" : "#F472B6";
              return (
                <div
                  key={g.is_owned ? g.id : g.share_token}
                  onClick={() => openGig(g)}
                  className="w-full text-left bg-[#161616] border border-[#222] rounded-2xl p-4 hover:border-white/20 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {g.starred && <Star className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" />}
                    <p className="text-white font-semibold text-sm truncate flex-1">{title}</p>
                    <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0" style={{ color: accent, backgroundColor: accent + "1a" }}>
                      {!g.is_owned && <Link2 className="w-2.5 h-2.5" />}
                      {g.is_owned ? "Yours" : "Linked"}
                    </span>
                  </div>
                  {location && (
                    <div className="flex items-center gap-1.5 text-white/50 text-xs mt-1 pl-6">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{location}</span>
                    </div>
                  )}
                  {g.date && (
                    <div className="flex items-center gap-1.5 text-white/40 text-xs mt-0.5 pl-6">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>{new Date(g.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BandBottomTabs />
    </div>
  );
}
