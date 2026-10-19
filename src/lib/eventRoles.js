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

export const WEB_LABELS = { venue: "Venue", manager: "Manager", band: "Artist", engineer: "Audio", lighting: "Lighting" };

export const sectionOf = (role) => SECTION_OF[role] || role;
