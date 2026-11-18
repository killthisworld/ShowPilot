// One icon per kind of circle, so every web (the profile web, the event web,
// the intake / package / invite webs; job 327) shows what a circle is for
// instead of only a name or a dot. Keys are the circle's own key; if a key
// isn't listed, the label's words are tried, and a plain list icon is the
// last resort so no circle is ever left bare.
import {
  MapPin, Truck, Clock, Wifi, SlidersHorizontal, Coffee, Handshake, ClipboardList, Mail, MessageSquareText,
  ListChecks, CalendarCheck, Phone, Users, Luggage, ClipboardCheck, Ticket, Shirt, ListMusic, FileText, Folder,
  ListTodo, HandHelping, Disc3, Link2, FolderDown, Megaphone, Music, Headphones, UserCircle, StickyNote,
  CalendarDays, Wallet, DoorOpen, Receipt, Lightbulb, Pin, Mic2, CalendarSearch, Guitar,
} from "lucide-react";

const BY_KEY = {
  // Tech and company profile pages
  tasks: ListTodo, requests: HandHelping, documents: Folder, paperwork: FileText,
  address: MapPin, load_in: Truck, schedule: Clock, wifi_power: Wifi, house_gear: SlidersHorizontal,
  hospitality: Coffee, hosp: Coffee, deal: Handshake, event_link: ClipboardList, link_email: Mail,
  replies: MessageSquareText, task_presets: ListChecks, advance: CalendarCheck, advance_sched: CalendarCheck,
  contact: Phone, lineup: Users, travel: Luggage, guests: ClipboardCheck, merch: Shirt, setlist: ListMusic,
  doors: DoorOpen, tickets: Ticket, marketing: Megaphone, settlement: Receipt, holds: Pin, contract: FileText, deposit: Wallet,
  // Feature corners
  event_form: ClipboardList, dj: Disc3, fan: Ticket, links: Link2, tpl: FolderDown,
  // Intake, package and invite webs
  show: CalendarDays, dates: CalendarSearch, promo: Megaphone, crew: SlidersHorizontal, files: Folder, paper: FileText,
  people: Users, role: UserCircle, artist: Music, members: Guitar, notes: StickyNote,
  // Venue packages
  venue_info: MapPin, venue: MapPin, house: SlidersHorizontal, parking: Truck, power: Wifi,
};

// Words in a label that say what it is, used when the key isn't listed.
const BY_WORD = [
  [/venue|address|location|place/i, MapPin], [/park|load/i, Truck], [/time|schedule|curfew|hours|doors/i, Clock],
  [/wi-?fi|power|internet/i, Wifi], [/gear|console|backline|sound|audio|pa\b/i, SlidersHorizontal],
  [/light/i, Lightbulb], [/hospitality|catering|food|rider|green room/i, Coffee], [/deal|pay|money|fee|draw/i, Handshake],
  [/contact|phone|call/i, Phone], [/hotel|lodging|travel|flight/i, Luggage], [/guest/i, ClipboardCheck],
  [/merch|shirt/i, Shirt], [/set ?list|song/i, ListMusic], [/stage|plot|input|member|band|act|perform|lineup/i, Users],
  [/mic|vocal/i, Mic2], [/note|comment/i, StickyNote], [/promo|market|social|photo|picture/i, Megaphone],
  [/paper|contract|doc|agreement|insurance|w-?9/i, FileText], [/file|folder/i, Folder], [/ticket/i, Ticket],
  [/head|engineer/i, Headphones],
];

export function circleIconFor(key, label) {
  if (key && BY_KEY[key]) return BY_KEY[key];
  const text = String(label || key || "");
  const hit = BY_WORD.find(([re]) => re.test(text));
  return hit ? hit[1] : StickyNote;
}
