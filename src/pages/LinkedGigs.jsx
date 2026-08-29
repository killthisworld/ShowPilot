import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Link2, MapPin, Calendar, Archive, X } from "lucide-react";
import BottomTabs from "@/components/showpilot/BottomTabs";

const ACTION_WIDTH = 144;

function SwipeableGigCard({ gig, onOpen, onArchive, onRemove }) {
  const [offset, setOffset] = useState(0);
  const startXRef = useRef(null);
  const draggingRef = useRef(false);

  const handleTouchStart = (e) => {
    startXRef.current = e.touches[0].clientX;
    draggingRef.current = false;
  };

  const handleTouchMove = (e) => {
    if (startXRef.current === null) return;
    const delta = e.touches[0].clientX - startXRef.current;
    if (Math.abs(delta) > 5) draggingRef.current = true;
    const base = offset === -ACTION_WIDTH ? -ACTION_WIDTH : 0;
    const next = Math.min(0, Math.max(-ACTION_WIDTH, base + delta));
    setOffset(next);
  };

  const handleTouchEnd = () => {
    startXRef.current = null;
    setOffset((prev) => (prev < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0));
  };

  const handleClick = () => {
    if (draggingRef.current) return;
    if (offset !== 0) { setOffset(0); return; }
    onOpen();
  };

  const title = gig.event_name || gig.band_name || "Untitled Gig";
  const location = [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_WIDTH }}>
        <button
          onClick={() => { setOffset(0); onArchive(); }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-white/10 text-white/70 hover:text-white text-[11px] font-medium"
        >
          <Archive className="w-4 h-4" />
          Archive
        </button>
        <button
          onClick={() => { setOffset(0); onRemove(); }}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-red-500/20 text-red-400 hover:text-red-300 text-[11px] font-medium"
        >
          <X className="w-4 h-4" />
          Remove
        </button>
      </div>

      <button
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{ transform: `translateX(${offset}px)`, transition: startXRef.current ? "none" : "transform 0.2s ease" }}
        className="relative w-full text-left bg-[#161616] border border-pink-400/20 rounded-2xl p-4 hover:border-pink-400/40"
      >
        <p className="text-white font-semibold text-sm truncate">{title}</p>
        {location && (
          <div className="flex items-center gap-1.5 text-white/50 text-xs mt-1">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{location}</span>
          </div>
        )}
        {gig.date && (
          <div className="flex items-center gap-1.5 text-white/40 text-xs mt-0.5">
            <Calendar className="w-3 h-3 shrink-0" />
            <span>{new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
        )}
      </button>
    </div>
  );
}

export default function LinkedGigs() {
  const navigate = useNavigate();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: links, error } = await supabase
        .from("linked_gigs")
        .select("share_token, linked_at")
        .eq("user_id", user.id)
        .eq("archived", false)
        .order("linked_at", { ascending: false });

      if (error || !links) {
        console.error(error);
        setLoading(false);
        return;
      }

      const details = await Promise.all(
        links.map(async (link) => {
          const { data } = await supabase.rpc("get_shared_gig", { p_token: link.share_token });
          return data ? { ...data, share_token: link.share_token } : null;
        })
      );

      setGigs(details.filter(Boolean));
      setLoading(false);
    };
    load();
  }, []);

  const archiveGig = async (shareToken) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    try {
      const { error } = await supabase
        .from("linked_gigs")
        .update({ archived: true })
        .eq("user_id", user.id)
        .eq("share_token", shareToken);
      if (error) throw error;
      setGigs((prev) => prev.filter((g) => g.share_token !== shareToken));
    } catch (e) {
      console.error(e);
    }
  };

  const removeGig = async (shareToken) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    try {
      const { error } = await supabase
        .from("linked_gigs")
        .delete()
        .eq("user_id", user.id)
        .eq("share_token", shareToken);
      if (error) throw error;
      setGigs((prev) => prev.filter((g) => g.share_token !== shareToken));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-pink-400" />
            <h1 className="text-white font-bold text-lg">Linked</h1>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto">
        <p className="text-white/40 text-xs mb-4">Gigs that others have given you access to.</p>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-pink-400/30 border-t-pink-400 rounded-full animate-spin" />
          </div>
        ) : gigs.length === 0 ? (
          <div className="text-center py-16">
            <Link2 className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No linked gigs yet</p>
            <p className="text-white/25 text-xs mt-1">Gigs someone shares with you will show up here once you save them.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {gigs.map((g) => (
              <SwipeableGigCard
                key={g.share_token}
                gig={g}
                onOpen={() => navigate(`/gig/shared?token=${g.share_token}`)}
                onArchive={() => archiveGig(g.share_token)}
                onRemove={() => removeGig(g.share_token)}
              />
            ))}
          </div>
        )}
      </div>

      <BottomTabs />
    </div>
  );
}
