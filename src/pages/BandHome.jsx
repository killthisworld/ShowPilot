import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Link2, MapPin, Calendar, CalendarDays, Plus } from "lucide-react";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import BandSettingsDrawer from "@/components/showpilot/BandSettingsDrawer";
import { usePreferences } from "@/hooks/usePreferences";
import { clearNewShowDraft } from "@/hooks/usePersistedState";

export default function BandHome() {
  const navigate = useNavigate();
  const { preferences, reload } = usePreferences();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Events this account created and owns directly.
      const { data: owned } = await supabase
        .from("shows")
        .select("*")
        .eq("owner_id", user.id)
        .order("date", { ascending: true });

      // Events someone else created and shared with this account.
      const { data: links } = await supabase
        .from("linked_gigs")
        .select("share_token, linked_at")
        .eq("user_id", user.id)
        .eq("archived", false)
        .order("linked_at", { ascending: false });

      let linkedGigs = [];
      if (links) {
        const details = await Promise.all(
          links.map(async (link) => {
            const { data } = await supabase.rpc("get_shared_gig", { p_token: link.share_token });
            return data ? { ...data, share_token: link.share_token, is_owned: false } : null;
          })
        );
        linkedGigs = details.filter(Boolean);
      }

      const ownedGigs = (owned || []).map((s) => ({ ...s, is_owned: true }));
      setGigs([...ownedGigs, ...linkedGigs]);
      setLoading(false);
    };
    load();
  }, []);

  const openGig = (g) => {
    if (g.is_owned) navigate(`/show/${g.id}`);
    else navigate(`/gig/shared?token=${g.share_token}`);
  };

  const handleCreateEvent = () => {
    clearNewShowDraft();
    navigate("/show/new");
  };

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
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-white font-semibold text-sm">Your Shows</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : gigs.length === 0 ? (
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
          <div className="space-y-2">
            {gigs.map((g) => {
              const title = g.event_name || g.band_name || "Untitled Gig";
              const location = [g.venue, [g.city, g.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
              const accent = g.is_owned ? "#8CFF3D" : "#F472B6";
              return (
                <button
                  key={g.is_owned ? g.id : g.share_token}
                  onClick={() => openGig(g)}
                  className="w-full text-left bg-[#161616] border border-[#222] rounded-2xl p-4 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold text-sm truncate flex-1">{title}</p>
                    <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0" style={{ color: accent, backgroundColor: accent + "1a" }}>
                      {!g.is_owned && <Link2 className="w-2.5 h-2.5" />}
                      {g.is_owned ? "Yours" : "Linked"}
                    </span>
                  </div>
                  {location && (
                    <div className="flex items-center gap-1.5 text-white/50 text-xs mt-1">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{location}</span>
                    </div>
                  )}
                  {g.date && (
                    <div className="flex items-center gap-1.5 text-white/40 text-xs mt-0.5">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>{new Date(g.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <BandBottomTabs />
    </div>
  );
}
