import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";

// The act you're working on (job 73, "one act vs many" stage 2; rule in
// claude/design-principle-one-act-vs-many.md). Only for accounts that can
// manage more than one act (the plan's acts_limit isn't 1) and have saved
// two or more acts in My Templates. One-act accounts never see any of it.
//
// Picking an act narrows Calendar, Dates and Needs me to the events that act
// is on (its name in the event's lineup). Events with no lineup yet stay in
// every act's view so nothing goes missing. The pick is remembered on this
// device.

const KEY = "sp-current-act";
export const ACT_CHANGED = "showpilot:act-changed";
const norm = (s) => String(s || "").trim().toLowerCase();

function readPick() {
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}
export function pickAct(name) {
  try { if (name) localStorage.setItem(KEY, name); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(ACT_CHANGED));
}

// { multi, acts: [{ name, photo_url }], current } - current is "" for all acts.
let cache = null; // one load per page visit, shared by every screen
// My Templates calls this after saving or deleting a template, so a new act
// shows up in the switcher.
export function forgetActs() { cache = null; }
export function useActs() {
  const [state, setState] = useState(cache || { multi: false, acts: [], loaded: false });
  const [pick, setPick] = useState(readPick);
  useEffect(() => {
    const on = () => setPick(readPick());
    window.addEventListener(ACT_CHANGED, on);
    return () => window.removeEventListener(ACT_CHANGED, on);
  }, []);
  useEffect(() => {
    if (cache) return undefined;
    let off = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [plan, tpls] = await Promise.all([
        supabase.rpc("get_my_template_plan"),
        supabase.from("saved_templates").select("name, data").eq("owner_id", user.id).eq("category", "artist"),
      ]);
      const limit = plan.data ? plan.data.acts_limit : 1;
      const acts = (tpls.data || [])
        .filter((t) => (t.name || "").trim())
        .map((t) => ({ name: t.name.trim(), photo_url: t.data?.photo_url || "" }))
        .sort((a, b) => a.name.localeCompare(b.name));
      cache = { multi: limit !== 1 && acts.length > 1, acts, loaded: true };
      if (!off) setState(cache);
    })();
    return () => { off = true; };
  }, []);
  const current = state.multi && state.acts.some((a) => norm(a.name) === norm(pick)) ? pick : "";
  return { ...state, current };
}

// The events the current act is on. Linked events carry their lineup
// (get_shared_gig's bands); your own events' act names come from show_bands.
export function useActGigs(gigs) {
  const { multi, current } = useActs();
  const [ownNames, setOwnNames] = useState({}); // show id -> [names]
  const ownedIds = useMemo(() => (gigs || []).filter((g) => g.is_owned !== false && g.id && !Array.isArray(g.bands)).map((g) => g.id), [gigs]);
  const idsKey = ownedIds.join(",");
  useEffect(() => {
    if (!multi || !ownedIds.length) return undefined;
    let off = false;
    supabase.from("show_bands").select("show_id, band_name").in("show_id", ownedIds).then(({ data, error }) => {
      if (error) { console.error(error); return; }
      if (off) return;
      const map = {};
      (data || []).forEach((r) => { (map[r.show_id] = map[r.show_id] || []).push(r.band_name); });
      setOwnNames(map);
    });
    return () => { off = true; };
  }, [multi, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (!multi || !current) return gigs;
    const want = norm(current);
    return (gigs || []).filter((g) => {
      const names = Array.isArray(g.bands) ? g.bands.map((b) => b.band_name) : ownNames[g.id] || [];
      const named = names.filter((n) => norm(n));
      return !named.length || named.some((n) => norm(n) === want);
    });
  }, [gigs, multi, current, ownNames]);
}
