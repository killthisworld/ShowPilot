// Public fan page links. An event with a custom link is just <site>/<name>
// (for example showpilot.space/friday-night-live). One without is
// <site>/rsvp/<token>. Older /e/<token> and /rsvp/<name> links keep working.
//
// Set VITE_PUBLIC_URL (for example https://showpilot.space) in the hosting
// environment once that domain points at the app; until then links use
// whichever address the app is open on.
const base = () => String(import.meta.env.VITE_PUBLIC_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "");

export const fanPath = (slug, token) => (slug ? `/${slug}` : `/rsvp/${token}`);
export const fanUrl = (slug, token) => (slug || token ? `${base()}${fanPath(slug, token)}` : "");

// What a custom link may contain. The database enforces the same rule.
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
export const cleanSlug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, SLUG_MAX);
export const trimSlug = (s) => cleanSlug(s).replace(/-+$/, "");
// Names that would collide with real pages of the app (or ones we may add).
// Keep in sync with supabase/fan_slug_root_migration.sql.
export const RESERVED_SLUGS = [
  "login", "logout", "register", "signup", "signin", "forgot-password", "reset-password", "email-change",
  "shared", "tm-intake", "opener-intake", "logbook", "gig", "gigs", "linked", "about", "dj", "pilot",
  "band", "show", "shows", "calendar", "experience", "archived", "manager-links", "band-profile",
  "my-templates", "event", "events", "eventbrite", "api", "app", "admin", "auth", "assets", "static",
  "home", "settings", "profile", "help", "support", "privacy", "terms", "pricing", "contact", "new",
  "invite", "web", "fan", "fans", "sky", "www", "showpilot", "records",
];
export const slugProblem = (s) => {
  if (!s) return "";
  if (RESERVED_SLUGS.includes(s)) return "That name is used by Show Pilot. Pick another.";
  if (s.length < SLUG_MIN) return `Use at least ${SLUG_MIN} characters.`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) return "Only letters, numbers and single hyphens.";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return "Pick something more readable.";
  return "";
};
