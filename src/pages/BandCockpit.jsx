import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Users, Link2, Wallet, MapPin, Calendar, X } from "lucide-react";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import { getConstellationLayout, ShowStamp } from "@/lib/constellation";

const PINK = "#F472B6";

export default function BandCockpit() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("logbook");
  const [loading, setLoading] = useState(true);
  const [pastGigs, setPastGigs] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [pilotsByWallet, setPilotsByWallet] = useState({});
  const [openWalletId, setOpenWalletId] = useState(null);
  const [selectedGig, setSelectedGig] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [linksRes, walletsRes, pilotsRes] = await Promise.all([
        supabase.from("linked_gigs").select("share_token").eq("user_id", user.id).eq("archived", false),
        supabase.from("wallets").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }),
        supabase.from("fellow_pilots").select("*").eq("owner_id", user.id),
      ]);

      if (linksRes.data) {
        const details = await Promise.all(
          linksRes.data.map(async (link) => {
            const { data } = await supabase.rpc("get_shared_gig", { p_token: link.share_token });
            return data ? { ...data, share_token: link.share_token } : null;
          })
        );
        const today = new Date().toISOString().slice(0, 10);
        setPastGigs(details.filter((g) => g && g.date && g.date < today));
      }

      if (walletsRes.data) setWallets(walletsRes.data);
      if (pilotsRes.data) {
        const grouped = {};
        pilotsRes.data.forEach((p) => {
          if (!grouped[p.wallet_id]) grouped[p.wallet_id] = [];
          grouped[p.wallet_id].push(p);
        });
        setPilotsByWallet(grouped);
      }

      setLoading(false);
    };
    load();
  }, []);

  const { positions } = useMemo(
    () => getConstellationLayout(pastGigs, { getSeedKey: (show) => show.share_token }),
    [pastGigs]
  );

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto">
          <h1 className="text-white font-bold text-lg mb-3">Cockpit</h1>
          <div className="flex gap-1.5">
            <button
              onClick={() => setTab("logbook")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${tab === "logbook" ? "bg-pink-500/15 text-pink-400" : "text-white/40 hover:text-white/60"}`}
            >
              <Link2 className="w-3.5 h-3.5" /> Logbook
            </button>
            <button
              onClick={() => setTab("fellow")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${tab === "fellow" ? "bg-[#8CFF3D]/15 text-[#8CFF3D]" : "text-white/40 hover:text-white/60"}`}
            >
              <Users className="w-3.5 h-3.5" /> Fellow Pilots
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
        </div>
      ) : tab === "logbook" ? (
        <div className="px-4 pt-6 max-w-lg mx-auto">
          <p className="text-white/40 text-xs mb-4">Shows Played</p>
          {pastGigs.length === 0 ? (
            <div className="text-center py-16 bg-[#111] rounded-2xl border border-[#222]">
              <Link2 className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">No shows played yet</p>
              <p className="text-white/25 text-xs mt-1 px-6">Past shows you're linked to will show up here as stars.</p>
            </div>
          ) : (
            <div className="relative w-full" style={{ height: `${Math.max(320, positions.length * 40)}px` }}>
              {positions.map((pos, i) => (
                <div key={pos.show.share_token} className="absolute" style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)` }}>
                  <ShowStamp
                    color={PINK}
                    onClick={() => setSelectedGig(pos.show)}
                    isNewest={i === positions.length - 1}
                    ariaLabel={pos.show.band_name || pos.show.venue}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pt-6 max-w-lg mx-auto space-y-3">
          {wallets.length === 0 ? (
            <div className="text-center py-16 bg-[#111] rounded-2xl border border-[#222]">
              <Wallet className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">No wallets yet</p>
              <p className="text-white/25 text-xs mt-1 px-6">Save someone's digital card from their profile to start a wallet.</p>
            </div>
          ) : (
            wallets.map((w) => {
              const cards = pilotsByWallet[w.id] || [];
              const isOpen = openWalletId === w.id;
              return (
                <div key={w.id} className="bg-[#161616] border border-[#222] rounded-2xl overflow-hidden">
                  <button onClick={() => setOpenWalletId(isOpen ? null : w.id)} className="w-full flex items-center justify-between p-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: w.color || "#8CFF3D" }} />
                      <span className="text-white font-medium text-sm">{w.name}</span>
                    </div>
                    <span className="text-white/30 text-xs">{cards.length} saved</span>
                  </button>
                  {isOpen && cards.length > 0 && (
                    <div className="px-4 pb-4 space-y-2">
                      {cards.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => navigate(`/pilot/${p.card_share_token}`)}
                          className="w-full flex items-center gap-3 bg-[#111] rounded-xl p-3 text-left hover:bg-[#1a1a1a]"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#222] flex items-center justify-center shrink-0 overflow-hidden">
                            {p.profile_photo_url ? (
                              <img src={p.profile_photo_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Users className="w-4 h-4 text-white/30" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium truncate">{p.display_name || "Unnamed"}</p>
                            {p.job_title && <p className="text-white/40 text-xs truncate">{p.job_title}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {selectedGig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onClick={() => setSelectedGig(null)}>
          <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-white font-bold text-xl">{selectedGig.event_name || selectedGig.band_name || "Untitled"}</h2>
              <button onClick={() => setSelectedGig(null)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2.5 text-sm mb-4">
              {selectedGig.venue && (
                <div className="flex items-center gap-2 text-white/70">
                  <MapPin className="w-4 h-4 text-white/30 shrink-0" />
                  <span>{selectedGig.venue}{selectedGig.city ? `, ${[selectedGig.city, selectedGig.state].filter(Boolean).join(", ")}` : ""}</span>
                </div>
              )}
              {selectedGig.date && (
                <div className="flex items-center gap-2 text-white/70">
                  <Calendar className="w-4 h-4 text-white/30 shrink-0" />
                  <span>{new Date(selectedGig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => navigate(`/gig/shared?token=${selectedGig.share_token}`)}
              className="w-full bg-pink-500/15 text-pink-400 font-medium text-sm py-2.5 rounded-xl hover:bg-pink-500/25 transition-colors"
            >
              View Full Details
            </button>
          </div>
        </div>
      )}

      <BandBottomTabs />
    </div>
  );
}
