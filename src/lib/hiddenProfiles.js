// Parts of ShowPilot that are built but not offered right now.
//
// Launch focus (decided 2026-10-19): audio / lighting techs, manager / artist
// and venue, centered on communication between them. Promoter and booking
// agent have been removed. The fan side is switched off so it can run as its
// own product later; its code, data and any emails already scheduled stay.
//
// To bring something back, change it here. Accounts that already have a
// hidden type keep working as before.
export const FAN_SIDE_OPEN = false;

// The public RSVP page (showpilot.space/rsvp/<link>) and the owner-side
// Fan page editor stay on: events already use them. No fan accounts.
export const FAN_RSVP_OPEN = true;

export const HIDDEN_ACCOUNT_TYPES = FAN_SIDE_OPEN ? [] : ["fan"];

export const isProfileOpen = (accountType) => !HIDDEN_ACCOUNT_TYPES.includes(accountType);
