import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Headphones, Lightbulb, IdCard } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import PilotCardView from "@/pages/PilotCardView";
import SameAsAudioCheck from "@/components/showpilot/SameAsAudioCheck";
import { sectionPhoto } from "@/lib/sectionPhotos";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Engineers on call (job 205), under the date on the tech phone event page.
// Audio and Lighting each with their picture and digital card; when the audio
// engineer also runs lights (engineer_info.lighting.same_as_audio) just the
// audio engineer, with "Also running lights" ticked. A crew spot nobody filled
// in falls back to the event's owner when that's their job (an audio engineer's
// own event -> they're on audio). People who can edit the Audio / Lighting
// section can tick "Also running lights" right here (onSetLightsToo).
const G = "#8CFF3D";

export default function OnCallStrip({ gig, ownerType, canEdit = false, onSetLightsToo }) {
  const ei = gig?.engineer_info || {};
  const lightsToo = !!ei.lighting?.same_as_audio;
  const ownerId = gig?.owner_id || null;

  // Who is in each spot: their contact info, else the owner when it's their job.
  const spots = useMemo(() => {
    const spot = (key, role) => {
      const info = ei[key] || {};
      const filled = info.contact_name || info.card_user_id;
      if (filled) return { key, role, name: info.contact_name || "", phone: info.contact_phone || "", userId: info.card_user_id || null };
      if (ownerId && ownerType === (key === "audio" ? "engineer" : "lighting")) return { key, role, name: "", phone: "", userId: ownerId, owner: true };
      return null;
    };
    return { audio: spot("audio", "engineer"), lighting: lightsToo ? null : spot("lighting", "lighting") };
  }, [ei, ownerId, ownerType, lightsToo]);

  // Their ShowPilot cards (name, picture, card link).
  const [cards, setCards] = useState({});
  const ids = [spots.audio?.userId, spots.lighting?.userId].filter(Boolean).join(",");
  useEffect(() => {
    if (!ids) return;
    let off = false;
    supabase
      .from("user_preferences")
      .select("user_id, display_name, card_share_token, profile_photo_url")
      .in("user_id", ids.split(","))
      .then(({ data }) => {
        if (off) return;
        const map = {};
        (data || []).forEach((r) => { map[r.user_id] = r; });
        setCards(map);
      });
    return () => { off = true; };
  }, [ids]);

  const [openCard, setOpenCard] = useState(null);

  const people = [spots.audio, spots.lighting].filter(Boolean);
  // Nobody on audio or lights yet, and nothing to tick: say nothing.
  if (people.length === 0) return null;

  const Person = ({ s }) => {
    const card = s.userId ? cards[s.userId] : null;
    const name = s.name || card?.display_name || (s.key === "audio" ? "Audio engineer" : "Lighting tech");
    const photo = card?.profile_photo_url || sectionPhoto(s.role, gig) || "";
    const Icon = s.key === "audio" ? Headphones : Lightbulb;
    const label = s.key === "audio" ? (lightsToo ? "AUDIO + LIGHTS" : "AUDIO") : "LIGHTING";
    const showLightsBox = s.key === "audio" && !spots.lighting && (lightsToo || canEdit);
    return (
      <div className="flex items-center gap-3 py-2">
        <span className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center border" style={{ borderColor: G + "66", background: "#141414" }}>
          {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <Icon className="w-5 h-5" style={{ color: G }} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: G }}>{label}</span>
          <span className="block text-white text-[15px] font-semibold truncate">{name}</span>
          {showLightsBox && (
            <span className="block mt-1">
              <SameAsAudioCheck label="Also running lights" checked={lightsToo} disabled={!canEdit} onChange={(v) => onSetLightsToo?.(v)} />
            </span>
          )}
        </span>
        {card?.card_share_token && (
          <button
            type="button"
            onClick={() => setOpenCard(card.card_share_token)}
            aria-label={`Open ${name}'s digital card`}
            className="shrink-0 h-10 px-3 rounded-[10px] border flex items-center gap-1.5 text-[12px] font-semibold"
            style={{ borderColor: G + "55", color: G, background: G + "12" }}
          >
            <IdCard className="w-4 h-4" /> Card
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-[#242424] bg-[#111] px-3.5 py-1.5">
      <div className="pt-2 text-[10.5px] tracking-[0.16em] text-white/45" style={{ fontFamily: SCENE_MONO }}>ENGINEERS ON CALL</div>
      <div className="divide-y divide-[#1f1f1f]">
        {people.map((s) => <Person key={s.key} s={s} />)}
      </div>
      {openCard && createPortal(<PilotCardView token={openCard} onClose={() => setOpenCard(null)} />, document.body)}
    </div>
  );
}
