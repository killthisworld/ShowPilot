// Offer templates (job 429; named since job 434, see lib/namedTemplates.js):
// everything an offer carries except the dates and who it goes to: the
// venue's profile, the deal, room, hospitality, logistics and documents, plus
// the usual times (set time, load-in, billing) each new date starts from.
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
export const OFFER_KEYS = ["profile", "deal", "room", "hosp", "logi", "files"];

export function snapshotOf(data, wants) {
  const out = {};
  OFFER_KEYS.forEach((k) => { if (data?.[k] !== undefined) out[k] = data[k]; });
  const d0 = (Array.isArray(wants?.dates) ? wants.dates : [])[0] || {};
  const times = { set_time: d0.set_time || "", load_in: d0.load_in || "", billing: d0.billing || "" };
  return { data: out, times };
}

// "With the deal, 1 document, your usual times"
export function offerTemplateLine(item) {
  const o = item?.data || {};
  const any = (x) => x && typeof x === "object" && Object.values(x).some((v) => has(v));
  const docs = Array.isArray(o.files) ? o.files.length : 0;
  const parts = [any(o.deal) && "the deal", any(o.room) && "the room", any(o.hosp) && "hospitality", any(o.logi) && "logistics", docs && `${docs} document${docs === 1 ? "" : "s"}`, item?.times?.set_time && "your usual times"].filter(Boolean);
  return parts.length ? `With ${parts.join(", ")}` : "";
}
