// DJ view (job 353): an Artist account with DJ Mode switched on gets a
// simpler app built around collecting performers' sets. The switch lives on
// the account (user_preferences.dj_mode), so phone and desktop follow it.
import { supabase } from "@/api/supabaseClient";

export const isDjMode = (prefs) => prefs?.account_type === "band" && prefs?.dj_mode === true;

// The last answer, kept on this device (job 372): every page loads the
// account again, and until it arrives the tab bar and home would show the
// Artist app for a moment. They use this instead while loading.
const LAST = "sp_dj_mode_last";
export function rememberDj(on) {
  try { if (on) localStorage.setItem(LAST, "1"); else localStorage.removeItem(LAST); } catch { /* private mode */ }
}
export function lastDj() {
  try { return localStorage.getItem(LAST) === "1"; } catch { return false; }
}
// DJ Mode while the account may still be loading: the account once it's
// in, the last answer on this device until then.
export const djNow = (prefs) => (prefs ? isDjMode(prefs) : lastDj());

// Turn it on or off. Throws a readable message when it can't save (for
// instance before the database update that adds the switch is in).
export async function setDjMode(userId, on) {
  const { error } = await supabase.from("user_preferences").update({ dj_mode: !!on }).eq("user_id", userId);
  if (error) {
    console.error(error);
    if (/dj_mode/.test(error.message || "")) throw new Error("The DJ switch needs a database update first. Try again soon.");
    throw new Error("Couldn't change it. Check your signal and try again.");
  }
  rememberDj(!!on);
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
