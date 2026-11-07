import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

// Booking packages for the company layout (job 246): the ones I sent and the
// ones sent to me (as a venue), from one shared copy so Needs me, the rail,
// the calendar row and the Bookings page make one request between them.
//   needs = what's waiting on ME: a venue's new packages to answer, and a
//           sender's packages where the venue offered dates to pick from.
let cache = null; // { data, at }
let inflight = null;
const listeners = new Set();
const FRESH_MS = 20000;

const rpc = async (fn) => {
  const { data, error } = await supabase.rpc(fn);
  if (error) { console.error(fn, error); return null; }
  return Array.isArray(data) ? data : [];
};

function shape(sent, incoming) {
  const s = (sent || []).filter((p) => p.status !== "draft");
  const inc = incoming || [];
  const needs = [
    ...inc.filter((p) => p.status === "sent").map((p) => ({ ...p, side: "venue", href: `/p/${p.code}`, need: "Offer dates or pass" })),
    ...s.filter((p) => p.status === "offered").map((p) => ({ ...p, side: "sender", href: `/book/${p.id}`, need: "Pick a date" })),
  ];
  return { sent: s, drafts: (sent || []).filter((p) => p.status === "draft"), incoming: inc, needs };
}

function load(force = false) {
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = Promise.all([rpc("list_my_booking_packages"), rpc("list_incoming_booking_packages")]).then(([sent, incoming]) => {
    inflight = null;
    // Before the migration is in (or on a failed call), nothing shows.
    const data = sent === null && incoming === null ? (cache?.data || shape([], [])) : shape(sent, incoming);
    cache = { data, at: Date.now() };
    listeners.forEach((fn) => fn(data));
    return data;
  });
  return inflight;
}

export default function useBookings(enabled = true) {
  const [data, setData] = useState(() => cache?.data ?? null);
  useEffect(() => {
    if (!enabled) return undefined;
    const on = (d) => setData(d);
    listeners.add(on);
    load().then(on);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { listeners.delete(on); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled]);
  const reload = useCallback(() => load(true), []);
  return { data, loading: data === null, reload };
}

export const fmtDay = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");
