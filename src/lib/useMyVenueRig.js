import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { rigHasItems } from "@/lib/lightingRig";

// An LD's own rig for a venue (job 377): the lighting rig on their venue
// template with this venue's name (case and spaces don't matter).
export default function useMyVenueRig(venueName, enabled = true) {
  const [rig, setRig] = useState(null);
  useEffect(() => {
    const name = String(venueName || "").trim().toLowerCase();
    if (!enabled || !name) { setRig(null); return undefined; }
    let off = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("saved_templates").select("name, data").eq("owner_id", user.id).eq("category", "venue");
      const t = (data || []).find((x) => String(x.name || "").trim().toLowerCase() === name && rigHasItems(x.data?.lighting_rig));
      if (!off) setRig(t ? t.data.lighting_rig : null);
    })().catch(() => {});
    return () => { off = true; };
  }, [venueName, enabled]);
  return rig;
}
