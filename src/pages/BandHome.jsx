import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Link2, MapPin, Calendar, LogOut, User } from "lucide-react";

export default function BandHome() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
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

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-4 max-w-lg mx-auto">
          <h1 className="text-white font-bold text-lg">
            Show<span className="text-[#8CFF3D]">Pilot</span>
          </h1>
          <button onClick={handleSignOut} className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs">
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Link2 className="w-4 h-4 text-[#8CFF3D]" />
          <h2 className="text-white font-semibold text-sm">Your Shows</h2>
        </div>
        <p className="text-white/40 text-xs mb-4">
          Gigs an engineer has shared with you show up here once you've saved them.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : gigs.length === 0 ? (
          <div className="text-center py-16 bg-[#111] rounded-2xl border border-[#222]">
            <Link2 className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No shows yet</p>
            <p className="text-white/25 text-xs mt-1 px-6">
              Ask your engineer to send you a share link, then save it here from that page.
            </p>
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
                  className="w-full text-left bg-[#161616] border border-[#222] rounded-2xl p-4 hover:border-[#8CFF3D]/40 transition-colors"
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

        <div className="bg-[#111] border border-[#222] rounded-2xl p-4 flex items-center gap-3 mt-6 opacity-60">
          <User className="w-5 h-5 text-white/30 shrink-0" />
          <div>
            <p className="text-white/50 text-sm font-medium">Band Profile</p>
            <p className="text-white/25 text-xs">Reusable tech rider & stage plot — coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
