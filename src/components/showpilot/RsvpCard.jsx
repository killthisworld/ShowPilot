import React, { useState } from "react";
import { Check, Users } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Remembers this browser's RSVP so a fan who comes back sees they're already
// on the list. Browser storage can be missing or blocked, so every access is
// guarded and the card works the same without it.
const memKey = (token) => `sp-rsvp-${token}`;
const recall = (token) => { try { return JSON.parse(localStorage.getItem(memKey(token)) || "null"); } catch { return null; } };
const remember = (token, v) => { try { localStorage.setItem(memKey(token), JSON.stringify(v)); } catch { /* fine without it */ } };

// Public fan page card for RSVP events (pay at the door). Fans give their
// name, email and party size; the send-fan-event-email function saves the
// RSVP and emails them the event info once. RSVPing again with the same email
// updates the party size instead of adding a second RSVP.
export default function RsvpCard({ token, color, doorPrice }) {
  const saved = recall(token);
  const [done, setDone] = useState(saved); // { name, guests, email, note }
  const [name, setName] = useState(saved?.name || "");
  const [email, setEmail] = useState(saved?.email || "");
  const [guests, setGuests] = useState(saved?.guests || 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const n = name.trim();
    const addr = email.trim();
    if (!n) { setErr("Add your name so the door has you on the list."); return; }
    if (!EMAIL_RE.test(addr)) { setErr("Enter a full email address, like you@example.com."); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("send-fan-event-email", { body: { token, email: addr, name: n, guests } });
    setBusy(false);
    if (error) {
      let message = "Couldn't save your RSVP. Try again.";
      try { const b = await error.context?.json?.(); if (b?.error) message = b.error; } catch { /* default */ }
      setErr(message);
      return;
    }
    const note = data?.emailed
      ? `The details are on their way to ${addr}.`
      : data?.already_emailed
        ? (data?.status === "rsvp_updated" ? "Your RSVP is updated. The details are already in your inbox." : `The details are already in your inbox at ${addr}.`)
        : "We couldn't send the email just now, but your RSVP is saved.";
    const v = { name: n, guests, email: addr, note };
    remember(token, v);
    setDone(v);
  };

  const inputCls = "w-full h-11 px-3 rounded-lg bg-black/40 border border-white/15 text-white text-base placeholder:text-white/30 focus:outline-none focus:border-white/40";

  return (
    <div className="mx-5 mt-3.5 rounded-xl overflow-hidden border" style={{ borderColor: color + "66", boxShadow: `0 0 22px ${color}33` }}>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-[#0d0d0d]" style={{ background: color }}>
        <span className="flex items-center gap-2.5 text-[22px] font-bold tracking-[0.06em]"><Users className="w-6 h-6" /> RSVP</span>
        <span className="text-right leading-tight">
          <span className="block text-[10px] font-bold tracking-[0.12em]" style={{ fontFamily: SCENE_MONO }}>PAY AT THE DOOR</span>
          {doorPrice && <span className="block text-[26px] font-bold leading-none" style={{ fontFamily: SCENE_MONO }}>{doorPrice}</span>}
        </span>
      </div>

      <div className="bg-[#111111]/85 backdrop-blur-md p-4">
        {done ? (
          <>
            <div className="flex items-start gap-2.5">
              <span className="w-[26px] h-[26px] rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: color + "24", border: `1px solid ${color}8c`, color }}><Check className="w-3.5 h-3.5" /></span>
              <div>
                <p className="text-lg font-bold text-white leading-tight">You're on the list, {done.name}.</p>
                <p className="mt-0.5 text-[14px] text-white/60 leading-snug">
                  {done.guests} {done.guests === 1 ? "person" : "people"}{doorPrice ? `, ${doorPrice} each at the door` : ", pay at the door"}. {done.note}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setDone(null)} className="mt-3 text-[13px] text-white/45 hover:text-white/80 underline underline-offset-2">Change party size</button>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <input className={inputCls} placeholder="Your name" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} maxLength={80} />
            <input className={`${inputCls} mt-2`} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} />
            <div className="mt-2 flex gap-2">
              <label className="flex items-center gap-2 h-11 px-3 rounded-lg bg-black/40 border border-white/15 text-white/70 text-sm shrink-0">
                <span className="text-[10px] tracking-[0.12em]" style={{ fontFamily: SCENE_MONO }}>PARTY</span>
                <select value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="bg-transparent text-white text-base focus:outline-none" aria-label="Party size">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n} className="bg-[#111]">{n}</option>)}
                </select>
              </label>
              <button type="submit" disabled={busy} className="flex-1 h-11 rounded-lg text-[17px] font-bold tracking-[0.06em] text-[#0d0d0d] disabled:opacity-60" style={{ background: color }}>
                {busy ? "SAVING..." : "RSVP"}
              </button>
            </div>
            {err && <p className="mt-2 text-[13px] text-[#FF6B6B]">{err}</p>}
            <p className="mt-2 text-[12px] leading-snug text-white/40">We'll email you the date, doors and address once. The host sees your name and party size. No mailing list.</p>
          </form>
        )}
      </div>
    </div>
  );
}
