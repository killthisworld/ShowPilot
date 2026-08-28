import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Link2, MapPin, Calendar } from "lucide-react";
import BottomTabs from "@/components/showpilot/BottomTabs";

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
            {gigs.map((g) => {
              const title = g.event_name || g.band_name || "Untitled Gig";
              const location = [g.venue, [g.city, g.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
              return (
                <button
                  key={g.share_token}
                  onClick={() => navigate(`/gig/shared?token=${g.share_token}`)}
                  className="w-full text-left bg-[#161616] border border-pink-400/20 rounded-2xl p-4 hover:border-pink-400/40 transition-colors"
                >
                  <p className="text-white font-semibold text-sm truncate">{title}</p>
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

      <BottomTabs />
    </div>
  );
}
