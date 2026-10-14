import { supabase } from "@/api/supabaseClient";

// Account switcher. Each account signed in on this device is remembered
// here (its session plus what to show in the list), so the person can jump
// between, say, their engineer account and their artist account without
// typing a password. The app itself still has one signed-in account at a
// time; switching swaps the session and reloads the app clean.
//
// Sessions live in this browser's storage, same as the one Supabase keeps
// for the signed-in account. Removing an account from the list, or signing
// it out, deletes its saved session.

const KEY = "showpilot_saved_accounts";
// Per-account bits of browser storage that must not carry over to the
// account being switched to.
const PER_ACCOUNT_KEYS = ["showpilot_nav_stack", "showpilot_event_type_colors"];

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((a) => a && a.id && a.refresh_token) : [];
  } catch {
    return [];
  }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  try { window.dispatchEvent(new Event("showpilot:accounts")); } catch {}
}

export function savedAccounts() {
  return read();
}

// Called whenever Supabase reports a session (sign in, token refresh), so
// the saved copy always holds the newest refresh token.
export function rememberSession(session) {
  const u = session?.user;
  if (!u?.id || !session.refresh_token) return;
  const list = read();
  const prev = list.find((a) => a.id === u.id) || {};
  const entry = {
    ...prev,
    id: u.id,
    email: u.email || prev.email || "",
    account_type: prev.account_type || u.user_metadata?.account_type || "",
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    last_used: Date.now(),
  };
  write([entry, ...list.filter((a) => a.id !== u.id)]);
}

// Name, profile type and photo for the list, from the account's settings.
export function rememberProfile(userId, prefs) {
  if (!userId || !prefs) return;
  const list = read();
  const i = list.findIndex((a) => a.id === userId);
  if (i < 0) return;
  const a = list[i];
  const next = {
    ...a,
    name: prefs.display_name || a.name || "",
    account_type: prefs.account_type || a.account_type || "",
    photo: prefs.profile_photo_url || a.photo || "",
  };
  if (JSON.stringify(next) === JSON.stringify(a)) return;
  list[i] = next;
  write(list);
}

export function forgetAccount(userId) {
  write(read().filter((a) => a.id !== userId));
}

function clearPerAccountStorage() {
  for (const k of PER_ACCOUNT_KEYS) {
    try { localStorage.removeItem(k); } catch {}
    try { sessionStorage.removeItem(k); } catch {}
  }
}

// Swap to a saved account. Returns { ok: true } (the page then reloads) or
// { ok: false, email } when that account's sign-in has expired and it needs
// its password again.
export async function switchToAccount(userId) {
  const target = read().find((a) => a.id === userId);
  if (!target) return { ok: false };
  const { data, error } = await supabase.auth.setSession({
    access_token: target.access_token,
    refresh_token: target.refresh_token,
  });
  if (error || !data?.session) {
    forgetAccount(userId);
    return { ok: false, email: target.email };
  }
  rememberSession(data.session);
  clearPerAccountStorage();
  // Start the next screen in this account's colors (see accountTypeStyle).
  try {
    if (target.account_type) localStorage.setItem("showpilot_account_type", target.account_type);
    else localStorage.removeItem("showpilot_account_type");
  } catch {}
  window.location.href = "/";
  return { ok: true };
}

// Sign in to another account on this device. The current account stays in
// the list: it's only signed out here ("local"), so its saved session keeps
// working for switching back.
export async function addAnotherAccount(email) {
  await supabase.auth.signOut({ scope: "local" });
  clearPerAccountStorage();
  window.location.href = `/login?add=1${email ? `&email=${encodeURIComponent(email)}` : ""}`;
}

// Sign the current account out for good: it leaves the list. If another
// saved account is still signed in on this device, go to that one.
export async function signOutCurrent() {
  const { data: { session } } = await supabase.auth.getSession();
  const id = session?.user?.id;
  if (id) forgetAccount(id);
  // A real sign-out of this one account (other saved accounts are other
  // users, so they're untouched).
  await supabase.auth.signOut();
  clearPerAccountStorage();
  const next = read()[0];
  if (next) {
    const r = await switchToAccount(next.id);
    if (r.ok) return;
  }
  window.location.href = "/login";
}
