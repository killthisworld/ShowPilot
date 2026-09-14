import { MapPin, Ticket, FileSignature, Music, Headphones, Briefcase, Lightbulb } from "lucide-react";

// One place for the color/icon/label per account type, so the "Pilot"
// header, Settings, and anywhere else that shows account type all stay in
// sync with each other and with the same palette used on the sectioned
// gig page and Home progress bar.
export const ACCOUNT_TYPE_STYLES = {
  venue: { label: "Venue", color: "#FB923C", icon: MapPin },
  promoter: { label: "Promoter", color: "#60A5FA", icon: Ticket },
  booking_agent: { label: "Booking Agent", color: "#C026D3", icon: FileSignature },
  manager: { label: "Manager", color: "#EF4444", icon: Briefcase },
  band: { label: "Band", color: "#EF4444", icon: Music },
  engineer: { label: "Audio Engineer", color: "#8CFF3D", icon: Headphones },
  lighting: { label: "Lighting Tech", color: "#8CFF3D", icon: Lightbulb },
};

export function getAccountTypeStyle(accountType) {
  return ACCOUNT_TYPE_STYLES[accountType] || ACCOUNT_TYPE_STYLES.engineer;
}
