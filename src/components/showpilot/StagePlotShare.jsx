import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { SCENE_MONO } from "@/lib/sceneStyle";
import { toast } from "@/components/ui/use-toast";

const AMBER = "#FFB400";

// The audio engineer sends the event's stage plot to the LD (job 400): who
// stands where and what they play, every act. The LD gets it on their event.
export function SendPlotToLdButton({ acts, show, className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Send the stage plot to my LD" title="Send to my LD" className={className} style={{ color: AMBER }}>
        <Lightbulb className="w-[18px] h-[18px]" />
      </button>
      {open && <SendPlotToLd acts={acts} show={show} onClose={() => setOpen(false)} />}
    </>
  );
}

function SendPlotToLd({ acts, show, onClose }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const placed = (acts || []).filter((a) => (a.band_members || []).length);
  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("send_stage_plot", {
      p_email: email.trim(),
      p_acts: placed.map((a) => ({ band_name: a.band_name || "", band_members: a.band_members || [] })),
      p_show_id: show?.id || null, p_event_name: show?.event_name || show?.band_name || null, p_date: show?.date || null, p_venue: show?.venue || null,
    });
    setBusy(false);
    if (error) { toast({ title: "Couldn't send it", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Stage plot sent to your LD", description: data?.has_account ? "It's waiting on their event." : "They'll see it once they sign in to ShowPilot with that email." });
    onClose();
  };
  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/75 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-label="Send the stage plot to your LD" onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="text-[10px] tracking-[0.18em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>SEND TO MY LD</div>
            <div className="text-white text-[17px] font-semibold">The stage plot, for their 3D stage</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-1 flex items-center justify-center text-white/50"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-white/55 text-[13px] leading-snug">
          {placed.length ? `${placed.map((a) => a.band_name || "An act").join(", ")}: who stands where and what they play.` : "No one is on the stage plot yet."} Your LD loads it onto their 3D stage from their event.
        </p>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your LD's email" aria-label="Your LD's email"
          className="h-11 rounded-xl bg-[#0e0e0e] border border-[#2c2c2c] px-3 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#FFB400]/60" />
        <button type="button" onClick={send} disabled={busy || !placed.length || !/^\S+@\S+\.\S+$/.test(email.trim())}
          className="h-11 rounded-xl font-bold text-[14.5px] disabled:opacity-40" style={{ background: AMBER, color: "#111" }}>{busy ? "Sending…" : "Send"}</button>
      </div>
    </div>,
    document.body
  );
}

// The LD's side (job 400): stage plots audio engineers sent, on the event.
// The one for this event's date first; Load puts the members on the acts.
//   onLoad(acts) -> merges them into the event's acts
export function StagePlotInbox({ date = null, onLoad }) {
  const [shares, setShares] = useState(null);
  const load = async () => {
    const { data, error } = await supabase.rpc("my_stage_plot_shares");
    setShares(error ? [] : data || []);
  };
  useEffect(() => { load(); }, []);
  if (!shares || !shares.length) return null;
  const sorted = [...shares].sort((a, b) => (b.event_date === date) - (a.event_date === date));
  const done = async (s, use) => {
    if (use) onLoad(s.acts || []);
    await supabase.rpc("use_stage_plot_share", { p_id: s.id });
    setShares((list) => list.filter((x) => x.id !== s.id));
    if (use) toast({ title: "Stage plot loaded onto your acts", description: "Save the event to keep it." });
  };
  return (
    <div className="rounded-[12px] border p-2.5 flex flex-col gap-2" style={{ borderColor: AMBER + "66", background: "#1a1408" }}>
      <div className="text-[10px] tracking-[0.18em]" style={{ fontFamily: SCENE_MONO, color: AMBER }}>STAGE PLOTS SENT TO YOU</div>
      {sorted.slice(0, 4).map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-white text-[13.5px] font-semibold truncate">{(s.acts || []).map((a) => a.band_name).filter(Boolean).join(", ") || "Stage plot"}</div>
            <div className="text-white/50 text-[12px] truncate">{s.from_name || "Your audio engineer"}{s.event_date ? ` · ${s.event_date}` : ""}{s.venue ? ` · ${s.venue}` : ""}{s.event_date === date ? " · this event" : ""}</div>
          </div>
          <button type="button" onClick={() => done(s, false)} className="h-9 px-2 text-[12.5px] text-white/45 hover:text-white">Dismiss</button>
          <button type="button" onClick={() => done(s, true)} className="h-9 px-3 rounded-[8px] text-[13px] font-bold" style={{ background: AMBER, color: "#111" }}>Load</button>
        </div>
      ))}
    </div>
  );
}
