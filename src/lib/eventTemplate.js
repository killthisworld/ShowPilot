// Event templates (job 434): what a Create event web keeps under a name.
// Not the date, the event name, promo (this show only) or paperwork files.
export const EVENT_KEYS = ["loadIn", "doors", "onStage", "curfew", "crew", "onFile", "people", "acts", "stagePlot", "stagePlotSave"];
export const eventSnapshot = (f) => Object.fromEntries(EVENT_KEYS.filter((k) => f[k] !== undefined && f[k] !== null).map((k) => [k, f[k]]));
export function eventTemplateLine(item) {
  const d = item?.data || {};
  const acts = Array.isArray(d.acts) ? d.acts.length : 0;
  const people = Array.isArray(d.people) ? d.people.length : 0;
  return [
    (d.loadIn || d.doors || d.onStage || d.curfew) && "times",
    acts && (acts === 1 ? d.acts[0].name : `${acts} acts`),
    d.crew && "sound / lights",
    people && `${people} co-host${people === 1 ? "" : "s"}`,
  ].filter(Boolean).join(", ");
}
