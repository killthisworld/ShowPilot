import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Headphones, Lightbulb } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import PilotCardView from "@/pages/PilotCardView";
import SameAsAudioCheck from "@/components/showpilot/SameAsAudioCheck";
import { sectionPhoto } from "@/lib/sectionPhotos";
import { SCENE_MONO } from "@/lib/sceneStyle";

// Engineers on call (jobs 205 / 206), under the date on the tech phone event page.
// Audio and Lighting side by side, each a profile picture (tap -> their digital
// card) with their name under it; when the audio
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

  // One tech: their picture (tap for their digital card) with name and job under it.
  const Person = ({ s }) => {
    const card = s.userId ? cards[s.userId] : null;
    const name = s.name || card?.display_name || (s.key === "audio" ? "Audio engineer" : "Lighting tech");
    const photo = card?.profile_photo_url || sectionPhoto(s.role, gig) || "";
    const Icon = s.key === "audio" ? Headphones : Lightbulb;
    const label = s.key === "audio" ? (lightsToo ? "AUDIO + LIGHTS" : "AUDIO") : "LIGHTING";
    const token = card?.card_share_token || null;
    const pic = (
      <span className="w-[72px] h-[72px] rounded-full overflow-hidden flex items-center justify-center border-2" style={{ borderColor: G + "88", background: "#141414" }}>
        {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <Icon className="w-7 h-7" style={{ color: G }} />}
      </span>
    );
    return (
      <div className="flex flex-col items-center text-center w-[110px] min-w-0">
        {token ? (
          <button type="button" onClick={() => setOpenCard(token)} aria-label={`Open ${name}'s digital card`} className="rounded-full active:scale-95 transition-transform">
            {pic}
          </button>
        ) : pic}
        <span className="mt-2 block w-full text-white text-[14px] font-semibold leading-tight truncate">{name}</span>
        <span className="mt-0.5 block text-[9.5px] tracking-[0.14em]" style={{ fontFamily: SCENE_MONO, color: G }}>{label}</span>
      </div>
    );
  };

  // Only audio on call: offer "Also running lights" beside them.
  const showLightsBox = !!spots.audio && !spots.lighting && (lightsToo || canEdit);

  return (
    <div className="pt-1 pb-2">
      <div className="mb-3 text-[10.5px] tracking-[0.16em] text-white/45" style={{ fontFamily: SCENE_MONO }}>ENGINEERS ON CALL</div>
      <div className="flex items-center gap-6">
        {people.map((s) => <Person key={s.key} s={s} />)}
        {showLightsBox && (
          <div className="flex-1 flex justify-center pb-6">
            <SameAsAudioCheck label="Also running lights" checked={lightsToo} disabled={!canEdit} onChange={(v) => onSetLightsToo?.(v)} />
          </div>
        )}
      </div>
      {openCard && createPortal(<PilotCardView token={openCard} onClose={() => setOpenCard(null)} />, document.body)}
    </div>
  );
}
