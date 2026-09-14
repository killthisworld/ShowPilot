import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { MapPin, Calendar, CalendarDays, Plus, Link2, Star } from "lucide-react";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import BandSettingsDrawer from "@/components/showpilot/BandSettingsDrawer";
import BandGigCard from "@/components/showpilot/BandGigCard";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/usePreferences";

export default function BandHome() {
  const navigate = useNavigate();
  const { preferences, reload } = usePreferences();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progressByShowId, setProgressByShowId] = useState({});
  const [currentUserId, setCurrentUserId] = useState(null);
  const [confirmDeleteGig, setConfirmDeleteGig] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    if (gigs.length === 0) return;
    const ids = gigs.map((g) => g.id).filter(Boolean);
    if (ids.length === 0) return;
    supabase
      .rpc("get_gigs_progress", { p_show_ids: ids })
      .then(({ data, error }) => {
        if (error) { console.error(error); return; }
        const map = {};
        (data || []).forEach((row) => { map[row.show_id] = row.progress; });
        setProgressByShowId(map);
      });
  }, [gigs]);

  const openGig = (g) => {
    navigate(`/gig/shared?token=${g.share_token}`);
  };

  const handleCreateEvent = () => navigate("/event/new");

  const gigKey = (g) => (g.is_owned ? g.id : g.share_token);

  const handleArchive = async (gig) => {
    if (gig.is_owned) {
      await supabase.from("shows").update({ archived: true }).eq("id", gig.id);
    } else if (currentUserId) {
      await supabase.from("linked_gigs").update({ archived: true }).eq("user_id", currentUserId).eq("share_token", gig.share_token);
    }
    setGigs((prev) => prev.filter((g) => gigKey(g) !== gigKey(gig)));
  };

  const confirmDelete = async () => {
    if (!confirmDeleteGig) return;
    setDeleting(true);
    try {
      if (confirmDeleteGig.is_owned) {
        await supabase.from("shows").delete().eq("id", confirmDeleteGig.id);
      } else if (currentUserId) {
        await supabase.from("linked_gigs").delete().eq("user_id", currentUserId).eq("share_token", confirmDeleteGig.share_token);
      }
      setGigs((prev) => prev.filter((g) => gigKey(g) !== gigKey(confirmDeleteGig)));
      setConfirmDeleteGig(null);
    } catch (e) {
      console.error(e);
    }
    setDeleting(false);
  };

  const sortedGigs = useMemo(() => {
    return [...gigs].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });
  }, [gigs]);

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
          <div className="space-y-2">
            {sortedGigs.map((g) => (
              <BandGigCard
                key={g.is_owned ? g.id : g.share_token}
                gig={g}
                progress={progressByShowId[g.id]}
                onOpen={openGig}
                onArchive={handleArchive}
                onDeleteRequest={setConfirmDeleteGig}
              />
            ))}
          </div>
        )}
      </div>

      {confirmDeleteGig && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4" onClick={() => setConfirmDeleteGig(null)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-semibold text-base mb-1">
              {confirmDeleteGig.is_owned ? "Delete this event?" : "Remove this link?"}
            </p>
            <p className="text-white/40 text-sm mb-4">
              {confirmDeleteGig.is_owned
                ? `${confirmDeleteGig.event_name || confirmDeleteGig.band_name || "This event"} will be permanently deleted. This can't be undone.`
                : "This just removes it from your list - the event itself isn't affected."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmDeleteGig(null)} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
                Cancel
              </Button>
              <Button onClick={confirmDelete} disabled={deleting} className="flex-1 bg-red-500 text-white hover:bg-red-600">
                {deleting ? "..." : confirmDeleteGig.is_owned ? "Delete" : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <BandBottomTabs />
    </div>
  );
}
