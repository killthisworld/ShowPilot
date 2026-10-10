// The role picked on Create account ("What do you do?") has to survive the
// round trip to Google when someone signs up with "Continue with Google":
// email sign-up stores it on the account (user_metadata.account_type), but
// the Google redirect carries nothing. So it's kept here for a short while
// and read when the new account's user_preferences row is first created.
const KEY = "sp_pending_account_type";
const MAX_AGE_MS = 30 * 60 * 1000;

export function setPendingAccountType(accountType) {
  try { localStorage.setItem(KEY, JSON.stringify({ accountType, at: Date.now() })); } catch {}
}

export function readPendingAccountType() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { accountType, at } = JSON.parse(raw);
    if (!accountType || Date.now() - at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return accountType;
  } catch {
    return null;
  }
}

export function clearPendingAccountType() {
  try { localStorage.removeItem(KEY); } catch {}
}
