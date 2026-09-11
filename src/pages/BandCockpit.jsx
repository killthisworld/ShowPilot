import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Users, Link2, Wallet, MapPin, Calendar, X } from "lucide-react";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";

const PINK = "#F472B6";

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < (str || "").length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function getConstellationLayout(shows) {
  const n = shows.length;
  if (n === 0) return { positions: [], rows: 0, cols: 0 };
  const cols = Math.max(3, Math.ceil(Math.sqrt(n * 1.5)));
  const rows = Math.ceil(n / cols) + 1;
  const centerCol = (cols - 1) / 2;
  const centerRow = (rows - 1) / 2;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ col: c, row: r, dist: Math.hypot(c - centerCol, r - centerRow) });
    }
  }
  cells.sort((a, b) => a.dist - b.dist);
  const sorted = [...shows].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const positions = sorted.map((show, idx) => {
    const cell = cells[idx] || cells[cells.length - 1];
    const seed = hashString(show.share_token || `${show.band_name}-${show.date}-${idx}`);
    const jitterX = (seededRandom(seed) - 0.5) * 0.6;
    const jitterY = (seededRandom(seed + 1) - 0.5) * 0.6;
    const rotation = (seededRandom(seed + 2) - 0.5) * 14;
    const xPct = ((cell.col + 0.5 + jitterX) / cols) * 100;
    const yPct = ((cell.row + 0.5 + jitterY) / rows) * 100;
    return { show, xPct, yPct, rotation };
  });
  return { positions, rows, cols };
}

function ShowStamp({ show, onClick, isNewest }) {
  const color = PINK;
  return (
    <button onClick={onClick} className="group relative flex items-center justify-center transition-transform duration-300 hover:scale-150" style={{ width: 56, height: 56 }}>
      {isNewest && (
        <style>{`
          @keyframes starPulseGlow { 0%, 100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.6); opacity: 1; } }
          @keyframes starPulseCore { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.35); } }
        `}</style>
      )}
      <div
        className="absolute rounded-full transition-opacity duration-300 group-hover:opacity-100"
        style={{
          width: isNewest ? 50 : 40, height: isNewest ? 50 : 40,
          background: `radial-gradient(circle, ${color}88 0%, transparent 70%)`,
          filter: "blur(5px)", opacity: 0.85,
          animation: isNewest ? "starPulseGlow 3s ease-in-out infinite" : undefined,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: isNewest ? 11 : 9, height: isNewest ? 11 : 9,
          background: `radial-gradient(circle at 35% 30%, #ffffff, ${color})`,
          boxShadow: isNewest ? `0 0 14px 5px ${color}ee, 0 0 30px 12px ${color}88` : `0 0 8px 2px ${color}cc, 0 0 18px 7px ${color}55`,
          animation: isNewest ? "starPulseCore 3s ease-in-out infinite" : undefined,
        }}
      />
    </button>
  );
}

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

  const { positions } = useMemo(() => getConstellationLayout(pastGigs), [pastGigs]);

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
                  <ShowStamp show={pos.show} onClick={() => setSelectedGig(pos.show)} isNewest={i === positions.length - 1} />
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
