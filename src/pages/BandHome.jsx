import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { CalendarDays, Plus } from "lucide-react";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import BandSettingsDrawer from "@/components/showpilot/BandSettingsDrawer";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/usePreferences";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import { getConstellationLayout, ShowStamp } from "@/lib/constellation";
import GigWeb from "@/pages/GigWeb";

// The home screen for every account type except engineer/lighting (those
// keep the card-list Home.jsx - a tech-production account often tracks many
// shows they don't own a stake in, where a dense scannable list still beats
// a starfield). Every show you own or are linked to becomes one star;
// tapping it doesn't navigate away, it brings the Gig Web hub forward as a
// layer over this screen, so the constellation is always still right there
// underneath when you close it.
export default function BandHome() {
  const navigate = useNavigate();
  const { preferences, reload } = usePreferences();
  const accountStyle = getAccountTypeStyle(preferences?.account_type);
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [webToken, setWebToken] = useState(null);
  const [webVisible, setWebVisible] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setCurrentUserId(user.id);

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

  const handleCreateEvent = () => navigate("/event/new");

  const gigKey = (g) => (g.is_owned ? g.id : g.share_token);

  const sortedGigs = useMemo(() => {
    return [...gigs].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });
  }, [gigs]);

  const { positions, rows } = useMemo(
    () => getConstellationLayout(sortedGigs, { getSeedKey: gigKey }),
    [sortedGigs]
  );
  const containerHeight = sortedGigs.length === 0 ? 220 : Math.max(340, rows * 110);

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
        <div className="flex items-center justify-between mb-1 px-1">
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
        ) : (
          <div className="relative mx-auto" style={{ width: "100%", maxWidth: 400, height: containerHeight }}>
            {positions.map((pos, i) => (
              <div key={gigKey(pos.show)} className="absolute z-10" style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, transform: "translate(-50%, -50%)" }}>
                <ShowStamp
                  color={pos.show.is_owned ? "#8CFF3D" : "#F472B6"}
                  onClick={() => openGig(pos.show)}
                  isNewest={i === positions.length - 1}
                  ariaLabel={pos.show.event_name || pos.show.band_name || "Untitled Gig"}
                />
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
            <GigWeb token={webToken} onClose={closeGig} />
          </div>
        </div>
      )}

      <BandBottomTabs />
    </div>
  );
}
