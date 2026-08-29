import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { User, Mail, Phone, Briefcase, Check, RotateCw, Wallet, Plus, ArrowLeft } from "lucide-react";
import Soundwave from "@/components/showpilot/Soundwave";
import ColorPicker from "@/components/showpilot/ColorPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SOUNDWAVE_TEMPLATES = {
  black: { bg: "#000000", wave: "#FFFFFF" },
  white: { bg: "#FFFFFF", wave: "#000000" },
  green: { bg: "#8CFF3D", wave: "#000000" },
};

export default function PilotCardView() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletColor, setNewWalletColor] = useState("#8CFF3D");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data?.user || null));

    supabase.rpc("get_pilot_card_by_token", { p_token: token }).then(({ data, error }) => {
      if (error || !data || data.length === 0) {
        setError("This pilot card link isn't valid.");
      } else {
        setCard(data[0]);
      }
      setLoading(false);
    });
  }, [token]);

  const openWalletPicker = async () => {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("owner_id", currentUser.id)
      .order("created_at", { ascending: true });
    if (error) console.error(error);
    else setWallets(data || []);
    setShowWalletPicker(true);
  };

  const saveToWallet = async (walletId) => {
    if (!currentUser || !card) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("fellow_pilots").insert({
        owner_id: currentUser.id,
        pilot_user_id: card.user_id,
        wallet_id: walletId,
        display_name: card.display_name,
        job_title: card.job_title,
        contact_email: card.contact_email,
        contact_phone: card.contact_phone,
        profile_photo_url: card.profile_photo_url,
        card_bg_color: card.card_bg_color,
        card_bg_image_url: card.card_bg_image_url,
        card_text_color: card.card_text_color,
        soundwave_template: card.soundwave_template,
        card_share_token: token,
      });
      if (error) throw error;
      setSaved(true);
      setShowWalletPicker(false);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const createWalletAndSave = async () => {
    if (!currentUser || !newWalletName.trim()) return;
    setSaving(true);
    try {
      const { data: wallet, error: walletError } = await supabase
        .from("wallets")
        .insert({ owner_id: currentUser.id, name: newWalletName.trim(), color: newWalletColor })
        .select()
        .single();
      if (walletError) throw walletError;
      await saveToWallet(wallet.id);
      setCreatingWallet(false);
      setNewWalletName("");
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">{error || "Card not found"}</p>
        </div>
      </div>
    );
  }

  const textColor = card.card_text_color || "#FFFFFF";
  const template = SOUNDWAVE_TEMPLATES[card.soundwave_template] || SOUNDWAVE_TEMPLATES.black;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{
        backgroundColor: "#0d0d0d",
        backgroundImage: "url(/pilot-card-bg.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <button
        onClick={() => navigate(-1)}
        className="fixed top-5 left-5 z-30 p-2 rounded-full bg-black/30 backdrop-blur-sm text-white/70 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      {/* Wallet picker modal */}
      {showWalletPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowWalletPicker(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-base mb-3">Add to Wallet</h3>

            {!creatingWallet ? (
              <>
                <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                  {wallets.length === 0 && (
                    <p className="text-xs text-white/30 text-center py-3">No wallets yet — create one below</p>
                  )}
                  {wallets.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => saveToWallet(w.id)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 bg-[#1a1a1a] hover:bg-[#222] rounded-xl p-3 transition-colors text-left"
                    >
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                      <span className="text-white text-sm font-medium">{w.name}</span>
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setCreatingWallet(true)}
                  className="w-full border-[#8CFF3D]/30 text-[#8CFF3D]/80 hover:bg-[#8CFF3D]/10 hover:text-[#8CFF3D]"
                >
                  <Plus className="w-4 h-4 mr-2" /> Create New Wallet
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-white/50 text-xs block mb-1">Wallet Name</label>
                  <Input
                    value={newWalletName}
                    onChange={(e) => setNewWalletName(e.target.value)}
                    placeholder="e.g. Coachella"
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <ColorPicker value={newWalletColor} onChange={setNewWalletColor} label="Color" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCreatingWallet(false)} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
                    Back
                  </Button>
                  <Button
                    onClick={createWalletAndSave}
                    disabled={saving || !newWalletName.trim()}
                    className="flex-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold"
                  >
                    {saving ? "Saving..." : "Create & Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showBack ? (
        <div
          onClick={() => navigate(`/logbook/public?token=${token}`)}
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-[#222] aspect-[16/10] flex items-center justify-center cursor-pointer p-8"
          style={{ backgroundColor: template.bg }}
          title="View Logbook"
        >
          <div className="w-2/3 max-w-[220px] h-14">
            <Soundwave seed={card.user_id || "pilot"} color={template.wave} />
          </div>
        </div>
      ) : (
        <div
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-[#222] aspect-[16/10] relative flex flex-col justify-end p-6"
          style={{
            backgroundColor: card.card_bg_color || "#111111",
            backgroundImage: card.card_bg_image_url ? `url(${card.card_bg_image_url})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <div className="relative z-10 flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-full bg-white/10 border-2 flex items-center justify-center overflow-hidden shrink-0" style={{ borderColor: textColor }}>
              {card.profile_photo_url ? (
                <img src={card.profile_photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6" style={{ color: textColor }} />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-lg truncate" style={{ color: textColor }}>{card.display_name || "ShowPilot User"}</p>
              {card.job_title && (
                <p className="text-sm opacity-80 truncate flex items-center gap-1" style={{ color: textColor }}>
                  <Briefcase className="w-3 h-3 shrink-0" /> {card.job_title}
                </p>
              )}
            </div>
          </div>
          <div className="relative z-10 space-y-1">
            {card.contact_email && (
              <p className="text-xs flex items-center gap-1.5 opacity-90" style={{ color: textColor }}>
                <Mail className="w-3 h-3 shrink-0" /> {card.contact_email}
              </p>
            )}
            {card.contact_phone && (
              <p className="text-xs flex items-center gap-1.5 opacity-90" style={{ color: textColor }}>
                <Phone className="w-3 h-3 shrink-0" /> {card.contact_phone}
              </p>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setShowBack(!showBack)}
        className="w-full max-w-sm mt-3 py-2.5 rounded-xl border border-[#2a2a2a] text-white/60 hover:bg-[#161616] text-sm flex items-center justify-center gap-2"
      >
        <RotateCw className="w-3.5 h-3.5" /> Flip Card
      </button>

      <div className="w-full max-w-sm mt-3">
        {currentUser ? (
          saved ? (
            <div className="flex items-center justify-center gap-2 py-3 text-[#8CFF3D] text-sm font-medium">
              <Check className="w-4 h-4" /> Saved to your Fellow Pilots
            </div>
          ) : (
            <button
              onClick={openWalletPicker}
              className="w-full bg-[#8CFF3D] text-black font-semibold py-3 rounded-xl hover:bg-[#7ae62e] transition-colors flex items-center justify-center gap-2"
            >
              <Wallet className="w-4 h-4" /> Add to Wallet
            </button>
          )
        ) : (
          <p className="text-center text-white/40 text-sm">
            <Link to="/login" className="text-[#8CFF3D] hover:underline">Log in</Link> to save this pilot to your Fellow Pilots
          </p>
        )}
      </div>
    </div>
  );
}
