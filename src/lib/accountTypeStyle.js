import { MapPin, Ticket, FileSignature, Music, Headphones, Briefcase, Lightbulb, Star } from "lucide-react";

// One place for the color/icon/label per account type, so the "Pilot"
// header, Settings, and anywhere else that shows account type all stay in
// sync with each other and with the same palette used on the sectioned
// gig page and Home progress bar.
export const ACCOUNT_TYPE_STYLES = {
  venue: { label: "Venue", color: "#F2FF00", icon: MapPin },
  promoter: { label: "Promoter", color: "#60A5FA", icon: Ticket },
  booking_agent: { label: "Booking Agent", color: "#C026D3", icon: FileSignature },
  manager: { label: "Manager", color: "#EF4444", icon: Briefcase },
  band: { label: "Artist", color: "#EF4444", icon: Music },
  engineer: { label: "Audio Engineer", color: "#8CFF3D", icon: Headphones },
  lighting: { label: "Lighting Tech", color: "#8CFF3D", icon: Lightbulb },
  // Fans: starlight, the color of their star and key in the event sky.
  fan: { label: "Fan", color: "#E4E0FF", icon: Star },
};

// The account type is remembered on this device, so screens that draw before
// preferences have loaded (the "Pilot" in the home header) start in the right
// color instead of flashing the engineer green first.
const TYPE_CACHE_KEY = "showpilot_account_type";
let cachedType = (() => {
  try { return localStorage.getItem(TYPE_CACHE_KEY) || null; } catch { return null; }
})();

export function rememberAccountType(accountType) {
  const t = ACCOUNT_TYPE_STYLES[accountType] ? accountType : null;
  if (t === cachedType) return;
  cachedType = t;
  try {
    if (t) localStorage.setItem(TYPE_CACHE_KEY, t); else localStorage.removeItem(TYPE_CACHE_KEY);
  } catch { /* private mode: the flash just comes back */ }
}

export function getAccountTypeStyle(accountType) {
  return ACCOUNT_TYPE_STYLES[accountType] || ACCOUNT_TYPE_STYLES[cachedType] || ACCOUNT_TYPE_STYLES.engineer;
}
