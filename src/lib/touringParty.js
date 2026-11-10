import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

// The touring party (job 73, "On the road" stage 6): your band and crew,
// added once, private to your account.
export const SEES = [
  { id: "all", label: "Everything" },
  { id: "no_money", label: "No money" },
  { id: "day_sheet", label: "Day sheet only" },
];
export const seesLabel = (id) => SEES.find((s) => s.id === id)?.label || "No money";

export const PARTY_CHANGED = "showpilot:party-changed";

export default function useTouringParty() {
  const [party, setParty] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("touring_party").select("*").order("created_at", { ascending: true });
    if (error) { console.error(error); setFailed(true); setParty((p) => p || []); return; }
    setFailed(false);
    setParty(data || []);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(PARTY_CHANGED, load);
    return () => window.removeEventListener(PARTY_CHANGED, load);
  }, [load]);

  return { party: party || [], loading: party === null, failed, reload: load };
}

const digits = (p) => String(p || "").replace(/[^\d+]/g, "");
// Opens Messages with the text filled in (works on iPhone and Android).
export const textLink = (phone, body) => `sms:${digits(phone)}?&body=${encodeURIComponent(body)}`;
export const emailLink = (email, subject, body) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
