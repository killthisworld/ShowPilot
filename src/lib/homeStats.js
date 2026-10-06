// The one-line status strip under the home screen's filters. What it shows
// depends on who's looking: each role gets the three numbers it actually
// acts on, computed from fields that role's section already tracks.
//
// `gigs` is whatever the home screen loaded (owned + linked); `progress` is
// the optional show_id -> { open_tasks, ... } map BandHome already fetches.

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function weekBounds() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: todayStr(), end: f(sunday) };
}

const blank = (v) => !v || (typeof v === "string" && v.trim() === "");

const GREEN = "#8CFF3D";
const AMBER = "#F59E0B";
const BLUE = "#60A5FA";

export function buildStatusStrip(accountType, gigs = [], progress = {}) {
  const today = todayStr();
  const { end } = weekBounds();
  const upcoming = gigs.filter((g) => g.date && g.date >= today);
  const thisWeek = upcoming.filter((g) => g.date <= end);
  const owned = upcoming.filter((g) => g.is_owned !== false);

  switch (accountType) {
    case "venue":
      return [
        { label: "NIGHTS THIS WEEK", value: thisWeek.length, color: "#fff" },
        { label: "NEED INFO", value: owned.filter((g) => blank(g.wifi_network) || blank(g.console) || blank(g.power_notes)).length, color: AMBER },
        { label: "UPCOMING", value: upcoming.length, color: "#FB923C" },
      ];
    case "promoter": {
      const onSale = owned.filter((g) => !blank(g.promoter_info?.ticket_link));
      const cap = owned.reduce((a, g) => a + (parseInt(String(g.promoter_info?.capacity || "").replace(/[^0-9]/g, ""), 10) || 0), 0);
      return [
        { label: "ON SALE", value: onSale.length, color: GREEN },
        { label: "NO TICKET LINK", value: owned.length - onSale.length, color: AMBER },
        { label: "TOTAL CAP", value: cap >= 1000 ? `${(cap / 1000).toFixed(1)}K` : cap, color: "#fff" },
      ];
    }
    case "booking_agent": {
      const signed = owned.filter((g) => /signed/i.test(g.booking_agent_info?.contract_status || "") && !/unsigned/i.test(g.booking_agent_info?.contract_status || ""));
      const awaiting = owned.filter((g) => !blank(g.booking_agent_info?.contract_status) && !signed.includes(g));
      return [
        { label: "SIGNED", value: signed.length, color: GREEN },
        { label: "AWAITING", value: awaiting.length, color: BLUE },
        { label: "NO DEAL YET", value: owned.filter((g) => blank(g.booking_agent_info?.deal_terms)).length, color: AMBER },
      ];
    }
    case "band":
    case "manager":
      return [
        { label: "THIS WEEK", value: thisWeek.length, color: "#fff" },
        { label: "NEED ADVANCE", value: owned.filter((g) => blank(g.manager_info?.advancing_notes)).length, color: AMBER },
        { label: "OPEN TASKS", value: upcoming.reduce((a, g) => a + (progress[g.id]?.open_tasks || 0), 0), color: BLUE },
      ];
    default: {
      // Audio engineer / lighting tech
      const thirty = new Date();
      thirty.setDate(thirty.getDate() + 30);
      const t30 = `${thirty.getFullYear()}-${String(thirty.getMonth() + 1).padStart(2, "0")}-${String(thirty.getDate()).padStart(2, "0")}`;
      const monthKey = today.slice(0, 7);
      return [
        { label: "THIS WEEK", value: thisWeek.length, color: "#fff" },
        { label: "NEXT 30 DAYS", value: upcoming.filter((g) => g.date <= t30).length, color: GREEN },
        { label: "WORKED THIS MO", value: gigs.filter((g) => g.date?.startsWith(monthKey) && g.date < today && g.is_owned !== false).length, color: BLUE },
      ];
    }
  }
}

// ---- Role banks ---------------------------------------------------------
// The colored bank buttons under the filters on the non-tech home. Every
// role gets ALL plus the buckets it actually works through, derived from
// the same fields as the status strip. `test` runs against one gig.
const isSigned = (g) => /signed/i.test(g.booking_agent_info?.contract_status || "") && !/unsigned/i.test(g.booking_agent_info?.contract_status || "");
const isOwnedUpcoming = (g) => g.is_owned !== false && g.date && g.date >= todayStr();
const venueReady = (g) => !blank(g.wifi_network) && !blank(g.console) && !blank(g.power_notes);

export function getRoleBanks(accountType, accentColor) {
  const all = { id: "all", label: "ALL", color: accentColor, test: () => true };
  switch (accountType) {
    case "venue":
      return [
        all,
        { id: "todo", label: "TO DO", color: AMBER, test: (g) => isOwnedUpcoming(g) && !venueReady(g) },
        { id: "ready", label: "READY", color: GREEN, test: (g) => isOwnedUpcoming(g) && venueReady(g) },
        { id: "linked", label: "LINKED", color: "#F472B6", test: (g) => g.is_owned === false || g.is_shared_by_me },
      ];
    case "promoter":
      return [
        all,
        { id: "notix", label: "NO TIX", color: AMBER, test: (g) => isOwnedUpcoming(g) && blank(g.promoter_info?.ticket_link) },
        { id: "sale", label: "ON SALE", color: GREEN, test: (g) => isOwnedUpcoming(g) && !blank(g.promoter_info?.ticket_link) },
        { id: "settle", label: "SETTLE", color: "#F472B6", test: (g) => g.is_owned !== false && g.date && g.date < todayStr() && blank(g.promoter_info?.settlement_notes) },
      ];
    case "booking_agent":
      return [
        all,
        { id: "nodeal", label: "NO DEAL", color: AMBER, test: (g) => isOwnedUpcoming(g) && blank(g.booking_agent_info?.deal_terms) },
        { id: "sent", label: "SENT", color: BLUE, test: (g) => isOwnedUpcoming(g) && !blank(g.booking_agent_info?.contract_status) && !isSigned(g) },
        { id: "signed", label: "SIGNED", color: GREEN, test: (g) => isOwnedUpcoming(g) && isSigned(g) },
      ];
    default: // band, manager
      return [
        all,
        { id: "advance", label: "ADVANCE", color: AMBER, test: (g) => isOwnedUpcoming(g) && blank(g.manager_info?.advancing_notes) },
        { id: "ready", label: "READY", color: GREEN, test: (g) => isOwnedUpcoming(g) && !blank(g.manager_info?.advancing_notes) },
        { id: "linked", label: "LINKED", color: "#F472B6", test: (g) => g.is_owned === false || g.is_shared_by_me },
      ];
  }
}
