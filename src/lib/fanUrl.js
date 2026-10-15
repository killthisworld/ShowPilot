// Public fan page links. New links look like <site>/rsvp/<name>, where <name>
// is the custom link the owner picked, or the event's token when they haven't
// picked one. Older /e/<token> links keep working.
//
// Set VITE_PUBLIC_URL (for example https://showpilot.space) in the hosting
// environment once that domain points at the app; until then links use
// whichever address the app is open on.
const base = () => String(import.meta.env.VITE_PUBLIC_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "");

export const fanPath = (slug, token) => `/rsvp/${slug || token}`;
export const fanUrl = (slug, token) => (slug || token ? `${base()}${fanPath(slug, token)}` : "");

// What a custom link may contain. The database enforces the same rule.
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
export const cleanSlug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, SLUG_MAX);
export const trimSlug = (s) => cleanSlug(s).replace(/-+$/, "");
export const slugProblem = (s) => {
  if (!s) return "";
  if (s.length < SLUG_MIN) return `Use at least ${SLUG_MIN} characters.`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) return "Only letters, numbers and single hyphens.";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return "Pick something more readable.";
  return "";
};
