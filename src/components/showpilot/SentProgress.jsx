import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Eye } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { fmtDay } from "@/lib/useBookings";
import { wantsLine } from "@/lib/bookingPackage";
import SwipeRow from "@/components/showpilot/SwipeRow";

// Bookings > Sent (job 354): everything you've sent and how far along it is,
// for every non-tech profile.
//   Artist / manager: each booking package, Sent > Opened > Dates offered >
//   Booked (or Passed), plus drafts not sent yet.
//   Venue: packages you answered (You offered dates > They picked > Booked),
//   events you made and invited an act to (Invite sent > Act joined), and
//   your venue package link (opened how many times).
const RED = "#F87171";
const BLUE = "#60A5FA";
const GREEN = "#8CFF3D";
const mono = { fontFamily: "'JetBrains Mono', monospace" };

const dayOf = (iso) => { try { return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); } catch { return ""; } };

// A row of steps: done ones green with a tick, the one it's at in the
// profile's color, the rest grey. `stopped` ends it early (Passed).
function Steps({ steps, at, color, stopped = "" }) {
  return (
    <ol className="flex items-start m-0 p-0 list-none" aria-label={stopped ? `Stopped: ${stopped}` : `${at + 1} of ${steps.length}: ${steps[Math.max(at, 0)]}`}>
      {steps.map((label, i) => {
        const done = !stopped && i < at;
        const here = !stopped && i === at;
        const last = i === steps.length - 1;
        const dot = done || (here && last) ? { background: GREEN, borderColor: GREEN } : here ? { background: `${color}33`, borderColor: color } : { background: "transparent", borderColor: "#3a3a3a" };
        return (
          <li key={label} className="flex-1 min-w-0 flex flex-col items-center gap-1 relative">
            {!last && <span aria-hidden="true" className="absolute top-[9px] left-1/2 w-full h-[2px]" style={{ background: done ? GREEN : "#2a2a2a" }} />}
            <span aria-hidden="true" className="relative z-[1] w-5 h-5 rounded-full border-2 flex items-center justify-center" style={dot}>
              {(done || (here && last)) && <Check className="w-3 h-3 text-[#0d0d0d]" strokeWidth={3.5} />}
            </span>
            <span className="text-[10px] leading-tight text-center px-0.5 tracking-[0.04em]" style={{ ...mono, color: here ? (last ? GREEN : color) : done ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.4)" }}>{label.toUpperCase()}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ to, photo, title, sub, chip, chipColor, children, stopped }) {
  return (
    <Link to={to} className="rounded-[14px] bg-[#151515] border border-[#262626] p-3 flex flex-col gap-3 hover:border-[#3a3a3a]" style={stopped ? { opacity: 0.7 } : undefined}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full shrink-0 overflow-hidden border-2" style={{ borderColor: RED, background: "#2a1c1c" }}>
          {photo && <img src={photo} alt="" className="w-full h-full object-cover" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15.5px] font-semibold text-white truncate">{title}</span>
          <span className="block text-[12.5px] text-white/60 truncate">{sub}</span>
        </span>
        {chip && <span className="shrink-0 text-[10px] font-bold tracking-[0.1em] px-2 py-1 rounded" style={{ ...mono, color: chipColor, background: `${chipColor}1f` }}>{chip}</span>}
      </div>
      {children}
    </Link>
  );
}

// One package I sent.
function senderCard(p) {
  const steps = ["Sent", "Opened", "Dates offered", "Booked"];
  const draft = p.status === "draft";
  const passed = p.status === "declined";
  const at = p.status === "booked" ? 3 : ["offered", "countered"].includes(p.status) ? 2 : p.opened_at ? 1 : 0;
  const to = p.to_name || "a venue";
  let sub;
  if (draft) sub = "Draft · not sent yet";
  else if (passed) sub = `${to} passed`;
  else if (p.status === "booked") sub = `Booked · ${fmtDay(p.picked_date)} · ${to}`;
  else if (p.status === "offered") { const n = (p.offers || []).length; sub = `${to} offered ${n} date${n === 1 ? "" : "s"}`; }
  else if (p.status === "countered") sub = `You sent other dates · waiting on ${to}`;
  else sub = p.opened_at ? `${to} opened it ${dayOf(p.opened_at)} · waiting on them` : `Sent to ${to}${p.sent_at ? ` ${dayOf(p.sent_at)}` : ""} · not opened yet`;
  const chip = draft ? "FINISH IT" : p.status === "offered" ? "PICK DATE" : "";
  return (
    <Card key={p.id} to={`/book/${p.id}`} photo={p.photo_url} title={p.act_name || "A booking package"} sub={sub} chip={chip} chipColor={RED} stopped={passed}>
      {!draft && <Steps steps={steps} at={at} color={RED} stopped={passed ? "Passed" : ""} />}
      {!draft && !passed && p.wants && wantsLine(p.wants) && p.status !== "booked" && <span className="text-[12px] text-white/45 -mt-1">Asked for {wantsLine(p.wants)}</span>}
    </Card>
  );
}

// A package an act sent me that I've answered (venue).
function answeredCard(p) {
  const steps = ["Got it", "You offered dates", "They picked", "Booked"];
  const passed = p.status === "declined";
  const at = p.status === "booked" ? 3 : 1;
  const who = p.sender_name || p.act_name || "The act";
  const sub = passed ? "You passed"
    : p.status === "booked" ? `Booked · ${fmtDay(p.picked_date)}`
    : p.status === "countered" ? `${who} sent other dates · your turn`
    : `Waiting on ${who} to pick`;
  return (
    <Card key={`a-${p.code}`} to={`/p/${p.code}`} photo={p.photo_url} title={p.act_name || "A booking package"} sub={sub} chip={p.status === "countered" ? "ANSWER" : ""} chipColor={BLUE} stopped={passed}>
      <Steps steps={steps} at={at} color={BLUE} stopped={passed ? "Passed" : ""} />
    </Card>
  );
}

// An event I made and invited an act to (venue, New event).
function madeCard(e) {
  const steps = ["Event made", "Invite sent", "Act joined"];
  const at = e.joined > 0 && e.joined >= e.invited ? 2 : e.invited ? 1 : 0;
  const sub = [fmtDay(e.date), !e.invited ? "No act invited yet" : at === 2 ? (e.invited === 1 ? "The act joined" : "Every act joined") : `${e.joined} of ${e.invited} joined`].filter(Boolean).join(" · ");
  return (
    <Card key={`m-${e.id}`} to={e.href} photo={e.photo} title={e.name} sub={sub}>
      <Steps steps={steps} at={at} color={BLUE} />
    </Card>
  );
}

// hidden / keyOf / actionsFor (job 361): Bookings' swipe actions, so a
// draft swiped away here goes the same way as on All bookings.
export default function SentProgress({ data, isVenue, made = [], hidden = null, keyOf = null, actionsFor = null }) {
  const shown = (p, side) => !hidden || !keyOf || !hidden.has(keyOf({ ...p, side }));
  const swipe = (p, side, node) => (actionsFor ? <SwipeRow key={`sw-${p.id || p.code}`} actions={actionsFor({ ...p, side })} label={p.act_name || "Booking"}>{node}</SwipeRow> : node);
  // The venue's package link from My Templates (job 298): opens so far.
  const [shares, setShares] = useState([]);
  useEffect(() => {
    if (!isVenue) return;
    supabase.rpc("my_template_share_stats").then(({ data: d, error }) => { if (!error && Array.isArray(d)) setShares(d); });
  }, [isVenue]);

  const section = (label, items) => (items.length ? (
    <section aria-label={label} className="flex flex-col gap-2.5">
      <h2 className="m-0 text-sm font-bold tracking-[0.08em] text-white/55 flex items-center" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
        {label.toUpperCase()}<span className="ml-auto text-[11px] tracking-[0.1em] text-white/40" style={mono}>{items.length}</span>
      </h2>
      <div className="grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">{items}</div>
    </section>
  ) : null);

  if (isVenue) {
    const answered = (data?.incoming || []).filter((p) => ["offered", "countered", "booked", "declined"].includes(p.status));
    const live = answered.filter((p) => p.status !== "declined");
    const passed = answered.filter((p) => p.status === "declined");
    const nothing = !answered.length && !made.length && !shares.length;
    return (
      <div className="flex flex-col gap-6">
        {shares.length > 0 && (
          <section aria-label="Your venue package" className="flex flex-col gap-2.5">
            <h2 className="m-0 text-sm font-bold tracking-[0.08em] text-white/55" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>YOUR VENUE PACKAGE</h2>
            {shares.map((s) => (
              <Link key={s.code} to="/my-templates" className="rounded-[14px] bg-[#151515] border border-[#262626] p-3 flex items-center gap-3 hover:border-[#3a3a3a]">
                <span className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center" style={{ background: `${BLUE}1f`, color: BLUE }}><Eye className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15.5px] font-semibold truncate">{s.name || "Your venue"}</span>
                  <span className="block text-[12.5px] text-white/60">{s.opened_count ? `Opened ${s.opened_count} time${s.opened_count === 1 ? "" : "s"}${s.last_opened_at ? ` · last ${dayOf(s.last_opened_at)}` : ""}` : "Not opened yet"}</span>
                </span>
              </Link>
            ))}
          </section>
        )}
        {section("Dates you offered", live.map(answeredCard))}
        {section("Events you made", made.map(madeCard))}
        {section("Passed", passed.map(answeredCard))}
        {nothing && <Empty text="Dates you offer on acts' packages, events you make with New event, and your venue package link show up here with how far along they are." />}
      </div>
    );
  }

  const sent = (data?.sent || []).filter((p) => shown(p, "sender"));
  const drafts = (data?.drafts || []).filter((p) => shown(p, "sender"));
  const live = sent.filter((p) => p.status !== "declined");
  const passed = sent.filter((p) => p.status === "declined");
  return (
    <div className="flex flex-col gap-6">
      {section("Sent", live.map(senderCard))}
      {section("Drafts", drafts.map((p) => swipe(p, "sender", senderCard(p))))}
      {section("Passed", passed.map(senderCard))}
      {!sent.length && !drafts.length && <Empty text="Booking packages you send show up here: when they're opened, when dates are offered, and when it's booked." />}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="rounded-xl bg-[#151515] border border-[#262626] p-6 text-center flex flex-col gap-2 items-center">
      <p className="m-0 text-base font-semibold">Nothing sent yet</p>
      <p className="m-0 text-sm text-white/55">{text}</p>
    </div>
  );
}
