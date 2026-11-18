// The circles on an event's web. Manager and Artist are one profile held by two
// kinds of people, and so are Audio and Lighting, so each pair is its own
// circle but still shares one section of the event underneath: the same edit
// permissions, tasks, requests and chat. Only the pages and the "who's on it"
// light are separate.
export const WEB_ROLES = ["venue", "manager", "band", "engineer", "lighting"];

// Circle -> the section of the event it belongs to.
export const SECTION_OF = { venue: "venue", manager: "manager", band: "manager", engineer: "engineer", lighting: "engineer" };

// Circle -> the account types that can hold it.
export const HOLDERS = { venue: ["venue"], manager: ["manager"], band: ["band"], engineer: ["engineer"], lighting: ["lighting"] };

// Circle -> every account type that works its section (either half of a pair).
export const SECTION_HOLDERS = { venue: ["venue"], manager: ["manager", "band"], band: ["manager", "band"], engineer: ["engineer", "lighting"], lighting: ["engineer", "lighting"] };

// The circles on the event web (job 340): Manager and Artist share one circle,
// and so do Audio and Lighting, so the web has three. Each circle lists its
// sides; the web shows only the sides that are actually on the event.
export const WEB_CIRCLES = ["venue", "manager", "engineer"];
export const CIRCLE_SIDES = { venue: ["venue"], manager: ["manager", "band"], engineer: ["engineer", "lighting"] };

export const WEB_LABELS = { venue: "Venue", manager: "Management", band: "Artist", engineer: "Audio", lighting: "Lighting" };

export const sectionOf = (role) => SECTION_OF[role] || role;
