// DJ view (job 353): an Artist account with "I'm a DJ" switched on gets a
// simpler app built around collecting performers' sets. The switch lives on
// the account (user_preferences.dj_mode), so phone and desktop follow it.
import { supabase } from "@/api/supabaseClient";

export const isDjMode = (prefs) => prefs?.account_type === "band" && prefs?.dj_mode === true;

// Turn it on or off. Throws a readable message when it can't save (for
// instance before the database update that adds the switch is in).
export async function setDjMode(userId, on) {
  const { error } = await supabase.from("user_preferences").update({ dj_mode: !!on }).eq("user_id", userId);
  if (error) {
    console.error(error);
    if (/dj_mode/.test(error.message || "")) throw new Error("The DJ switch needs a database update first. Try again soon.");
    throw new Error("Couldn't change it. Check your signal and try again.");
  }
}

// "Are you a DJ?" at sign-up. Email sign-up keeps it on the account
// (user_metadata.dj_mode); Google's round trip carries nothing, so it's kept
// here for a short while, like the picked role (lib/pendingAccountType.js).
const KEY = "sp_pending_dj_mode";
const MAX_AGE_MS = 30 * 60 * 1000;
export function setPendingDj(on) {
  try { if (on) localStorage.setItem(KEY, String(Date.now())); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}
export function readPendingDj() {
  try {
    const at = Number(localStorage.getItem(KEY) || 0);
    if (!at) return false;
    if (Date.now() - at > MAX_AGE_MS) { localStorage.removeItem(KEY); return false; }
    return true;
  } catch { return false; }
}
export function clearPendingDj() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
