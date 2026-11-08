import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { positionColor, positionOfMember } from "@/lib/stagePositions";

// Your own instruments for the stage (job 274): [{ id, label, color, icon }]
// made with the gear in "What do they play?". Signed in: saved to
// user_preferences.custom_stage_positions; not signed in (an intake link):
// kept on this device. A member given one stores it on themselves
// (position "other" + position_label / position_color / position_icon), so
// their stage looks the same wherever it's shown.
const LOCAL = "sp_custom_stage_positions";
let cache; // undefined = not loaded
const EVT = "sp-custom-positions";

const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || "[]"); } catch { return []; } };

export function useCustomPositions() {
  const [list, setList] = useState(cache || []);
  useEffect(() => {
    let off = false;
    const sync = () => { if (!off) setList(cache || []); };
    window.addEventListener(EVT, sync);
    if (cache === undefined) {
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        let l = readLocal();
        if (user) {
          const { data, error } = await supabase.from("user_preferences").select("custom_stage_positions").eq("user_id", user.id).maybeSingle();
          if (!error && Array.isArray(data?.custom_stage_positions)) l = data.custom_stage_positions;
        }
        cache = l;
        try { window.dispatchEvent(new CustomEvent(EVT)); } catch {}
      })().catch(() => { cache = readLocal(); sync(); });
    }
    return () => { off = true; window.removeEventListener(EVT, sync); };
  }, []);
  const save = async (next) => {
    const clean = (next || []).filter((p) => String(p.label || "").trim()).slice(0, 40);
    cache = clean;
    try { window.dispatchEvent(new CustomEvent(EVT)); } catch {}
    try { localStorage.setItem(LOCAL, JSON.stringify(clean)); } catch {}
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("user_preferences").upsert({ user_id: user.id, custom_stage_positions: clean }, { onConflict: "user_id" });
      if (error) throw error;
    }
  };
  return [list, save];
}

// A member's look on the stage: position, color, icon and label, using their
// own instrument's color / icon when they have one.
export function memberLook(m, getInstruments, colors) {
  const pos = positionOfMember(m, getInstruments);
  return {
    pos,
    color: (pos === "other" && m?.position_color) || positionColor(pos, colors),
    icon: (pos === "other" && m?.position_icon) || pos,
  };
}

// Give a member one of your own instruments.
export const withCustomPosition = (m, p) => ({ ...m, position: "other", position_label: p.label, position_color: p.color, position_icon: p.icon });
