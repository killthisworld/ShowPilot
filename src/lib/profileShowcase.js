// What each profile includes, shown on the sign-up page when a profile is
// tapped (job 324), so someone can see what they'd get before choosing.
//
// Only list things that exist in the app today. When a feature ships or is
// removed for a profile, change it here too.
//
// DJs have no profile of their own: DJ Tools sits under Artist (and Manager),
// so the Artist / Manager entries carry a highlighted "dj" item and the
// sign-up page tells DJs to pick Artist.
import {
  CalendarDays, Users, ClipboardCheck, FileText, MessageSquare, Hand, Handshake,
  Link2, Wifi, Disc3, Ticket, Luggage, ListMusic, Shirt, Headphones, Zap, StickyNote,
  BookOpen, IdCard, Sparkles,
} from "lucide-react";

export const DJ_COLOR = "#FDE047";

// Every profile gets these on each event; shown as one line under the list.
export const EVERYONE_GETS = "Every profile: one page per event with everyone on it, tasks, chat rooms, and a calendar.";

export const PROFILE_SHOWCASE = {
  venue: {
    pitch: "Run every night at your room from one place, and have the acts and techs fill in what you need.",
    items: [
      { icon: CalendarDays, title: "A page for each event", text: "Load-in and parking, Wi-Fi and power, house gear, hospitality, curfew." },
      { icon: Users, title: "Invite the acts and techs", text: "Send a link, see who has accepted and who hasn't." },
      { icon: Hand, title: "Ask a tech if they're free", text: "They answer I'm in or Can't make it." },
      { icon: Link2, title: "Event form for acts", text: "Acts fill in their advance info themselves, and it lands on the event." },
      { icon: Handshake, title: "Deal terms and paperwork", text: "Keep each event's deal and documents together." },
      { icon: FileText, title: "Create PDFs", text: "Day sheets and packets to send or print." },
    ],
    fit: "Good fit for venues, rooms and promoters running a calendar of shows.",
  },
  band: {
    pitch: "Advance your shows, send techs what they need, and keep the road details in one place.",
    items: [
      { icon: Users, title: "Performers and set times", text: "Build the lineup for each event, with set times and notes for the techs." },
      { icon: ClipboardCheck, title: "Advance checklist", text: "See what's confirmed and what still needs an answer." },
      { icon: Luggage, title: "Travel, lodging and guest list", text: "Keep hotels, travel and who's coming in one spot." },
      { icon: ListMusic, title: "Set list", text: "Keep the set list for each event." },
      { icon: Shirt, title: "Merch", text: "Keep your merch list for each event." },
      { icon: FileText, title: "Create PDFs", text: "Day sheets and packets to send or print." },
    ],
    dj: {
      icon: Disc3,
      title: "DJ Tools: set links and WAV uploads",
      text: "Send each DJ a link to fill in their set and attach WAVs. The files go straight into your own Google Drive, in a folder for each event and artist.",
    },
    fit: "Good fit for artists, bands, DJs and anyone playing the show.",
  },
  manager: {
    pitch: "Run the artist side of the shows you manage, and keep fans in the loop.",
    items: [
      { icon: Users, title: "Performers and set times", text: "Build the lineup for each event, with set times and notes for the techs." },
      { icon: ClipboardCheck, title: "Advance checklist", text: "See what's confirmed and what still needs an answer." },
      { icon: Ticket, title: "Fan page and RSVPs", text: "A public page for the event with RSVPs and countdown emails to the people who sign up." },
      { icon: Luggage, title: "Travel, lodging and guest list", text: "Keep hotels, travel and who's coming in one spot." },
      { icon: Handshake, title: "Deal terms and paperwork", text: "Keep each event's deal and documents together." },
      { icon: FileText, title: "Create PDFs", text: "Day sheets and packets to send or print." },
    ],
    dj: {
      icon: Disc3,
      title: "DJ Tools: set links and WAV uploads",
      text: "Send each DJ a link to fill in their set and attach WAVs. The files go straight into your own Google Drive, in a folder for each event and artist.",
    },
    fit: "Good fit for managers, tour managers and anyone booking acts on someone's behalf.",
  },
  engineer: {
    pitch: "Know what every show needs before you get there, and keep a record of the work you've done.",
    items: [
      { icon: Hand, title: "Asked to work", text: "When a venue asks if you're free, answer I'm in or Can't make it." },
      { icon: Headphones, title: "A console-style home", text: "Your shows as scenes, with each event's status at a glance." },
      { icon: Sparkles, title: "Stage plots and show info", text: "Each act's stage plot and the show details, on your phone." },
      { icon: Link2, title: "Event links", text: "Each event's links, ready to send to acts and venues." },
      { icon: BookOpen, title: "Logbook", text: "A record of the shows you've worked, by date." },
      { icon: IdCard, title: "Your pilot card", text: "A card with your work history that you can share." },
    ],
    fit: "Good fit for front-of-house, monitor and system techs. Made for your phone.",
  },
  lighting: {
    pitch: "Run lighting with everything you need for the show in front of you, on your phone.",
    items: [
      { icon: Hand, title: "Asked to work", text: "When a venue asks if you're free, answer I'm in or Can't make it." },
      { icon: Zap, title: "Cue pads and a GO bar", text: "Your cues as pads. Tap one to load it, then GO." },
      { icon: StickyNote, title: "FX and artist notes", text: "Notes for the whole show and for each act." },
      { icon: Wifi, title: "Show info on your phone", text: "The schedule and details for each show, with you at the venue." },
      { icon: BookOpen, title: "Logbook", text: "A record of the shows you've worked, by date." },
      { icon: IdCard, title: "Your pilot card", text: "A card with your work history that you can share." },
    ],
    fit: "Good fit for lighting designers and operators. Made for your phone.",
  },
};
