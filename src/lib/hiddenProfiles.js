// Profiles that are built but not offered right now (decided 2026-10-19):
// ShowPilot launches on the back-of-house core - audio / lighting techs,
// manager / artist, and fans. Venue, promoter and booking agent keep all
// their code, colors and data; they just can't be chosen by new people.
//
// To bring one back, remove it from this list. Nothing else changes.
// Accounts that already have one of these types keep working as before.
export const HIDDEN_ACCOUNT_TYPES = ["venue", "promoter", "booking_agent"];

export const isProfileOpen = (accountType) => !HIDDEN_ACCOUNT_TYPES.includes(accountType);
