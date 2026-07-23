import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { User, Mail, Phone, Briefcase, Check, RotateCw } from "lucide-react";
import Soundwave from "@/components/showpilot/Soundwave";

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

  const handleSave = async () => {
    if (!currentUser || !card) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("fellow_pilots").insert({
        owner_id: currentUser.id,
        pilot_user_id: card.user_id,
        display_name: card.display_name,
        job_title: card.job_title,
        contact_email: card.contact_email,
        contact_phone: card.contact_phone,
        profile_photo_url: card.profile_photo_url,
        card_bg_color: card.card_bg_color,
        card_bg_image_url: card.card_bg_image_url,
        card_text_color: card.card_text_color,
      });
      if (error) throw error;
      setSaved(true);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
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
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 py-10">
      {showBack ? (
        <div
          onClick={() => navigate(`/pilot/${token}/history`)}
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-[#222] aspect-[16/10] flex items-center justify-center cursor-pointer p-8"
          style={{ backgroundColor: template.bg }}
          title="View work history"
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
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-[#8CFF3D] text-black font-semibold py-3 rounded-xl hover:bg-[#7ae62e] transition-colors"
            >
              {saving ? "Saving..." : "+ Save to Fellow Pilots"}
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
