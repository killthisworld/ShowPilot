import React, { useEffect, useState } from "react";
import { CheckCircle, Copy, Check } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { DJ_COLOR, slotLink } from "@/lib/djTools";
import MultitrackQuestion from "@/components/showpilot/MultitrackQuestion";
import DjSetUpload from "@/pages/DjSetUpload";

// Tracks on the intake form (job 74, Nov 5; supabase/intake_tracks_migration.sql).
// The link's sender ticked "Ask for tracks?"; the act answers "Do you have
// tracks to send?" and, if Yes, gets their DJ set form straight after sending.
// kind: "tm" (main Performer Intake link) or "opener".

// Does this link ask for tracks? false until known, and false if the
// migration isn't there yet.
export function useAsksTracks(token, kind) {
  const [asks, setAsks] = useState(false);
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    supabase.rpc("intake_asks_tracks", { p_token: token, p_kind: kind }).then(({ data, error }) => {
      if (alive && !error) setAsks(!!data);
    });
    return () => { alive = false; };
  }, [token, kind]);
  return asks;
}

export function TracksQuestion({ value, onChange }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "#1c1a0e", border: `1px solid ${DJ_COLOR}55` }}>
      <p className="text-white text-sm font-semibold">Do you have tracks to send?</p>
      <p className="text-white/45 text-xs mt-1">Backing tracks or a DJ set. You'll add them right after you send this form.</p>
      <div className="grid grid-cols-2 gap-2 mt-3" role="radiogroup" aria-label="Tracks to send">
        {[[true, "Yes"], [false, "No"]].map(([v, text]) => {
          const on = value === v;
          return (
            <button key={text} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : v)}
              className="h-11 rounded-xl border text-sm font-semibold transition-colors"
              style={on ? { borderColor: DJ_COLOR, background: DJ_COLOR + "1a", color: DJ_COLOR } : { borderColor: "#2a2a2a", color: "rgba(255,255,255,0.6)" }}>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The intake web's optional boxes (job 224): Additional services in the top
// right, Tracks in the bottom left, each only when the link asks for it.
export function intakeCorners({ services, asksTracks, form, update, icons }) {
  const mtDone = form.multitrack_interest === true || form.multitrack_interest === false;
  const trDone = form.has_tracks === true || form.has_tracks === false;
  return {
    corner: services ? { label: "Additional services", icon: icons.services, done: mtDone,
      body: () => <MultitrackQuestion value={form.multitrack_interest ?? null} onChange={(v) => update("multitrack_interest", v)} /> } : null,
    cornerBL: asksTracks ? { label: "Tracks", icon: icons.tracks, done: trDone,
      body: () => <TracksQuestion value={form.has_tracks ?? null} onChange={(v) => update("has_tracks", v)} /> } : null,
  };
}

// Right after sending, for an act that has tracks: their set form for this
// event (made on the server), with "I'll do this later" and the saved link.
// Returns null (so the page shows its usual Sent screen) when there's no slot.
export function IntakeTracksAfter({ token, kind, sentLine, fallback }) {
  const [slot, setSlot] = useState(undefined); // undefined = loading, null = none
  const [later, setLater] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.rpc("intake_dj_slot", { p_token: token, p_kind: kind }).then(({ data, error }) => {
      if (!alive) return;
      if (error) console.error(error);
      setSlot(!error && data ? data : null);
    });
    return () => { alive = false; };
  }, [token, kind]);

  if (slot === undefined) {
    return <div className="min-h-[100dvh] bg-[#0d0d0d] flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" /></div>;
  }
  if (!slot) return fallback;
  const link = slotLink(slot);
  const copy = () => { navigator.clipboard?.writeText(link).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (later) {
    return (
      <div className="min-h-[100dvh] bg-[#0d0d0d] text-white flex items-center justify-center px-5">
        <div className="max-w-sm w-full text-center flex flex-col gap-4">
          <CheckCircle className="w-14 h-14 mx-auto" style={{ color: "#8CFF3D" }} />
          <h2 className="text-[28px] font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Sent!</h2>
          <p className="text-white/60 text-[15px]">{sentLine} Your tracks can wait: this link opens your set any time.</p>
          <button type="button" onClick={copy} className="h-11 rounded-xl border text-[14px] font-semibold flex items-center justify-center gap-2" style={{ borderColor: DJ_COLOR + "88", color: DJ_COLOR }}>
            {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy my set link</>}
          </button>
          <a href={link} className="text-white/55 text-[14px] underline underline-offset-4">Open my set now</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#0d0d0d] text-white">
      <div className="max-w-[560px] mx-auto px-4 pt-5">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: "#8CFF3D14", border: "1px solid #8CFF3D44" }}>
          <CheckCircle className="w-4 h-4 shrink-0" style={{ color: "#8CFF3D" }} />
          <span className="text-[13px] text-white/80">{sentLine} Now your tracks:</span>
        </div>
      </div>
      <div className="max-w-[560px] mx-auto px-4 pt-4">
        <DjSetUpload tokenOverride={slot} embedded onDone={() => {}} />
      </div>
      <div className="max-w-[560px] mx-auto px-4 pb-10 text-center">
        <button type="button" onClick={() => setLater(true)} className="text-white/50 hover:text-white text-[14px] underline underline-offset-4">I'll do this later</button>
      </div>
    </div>
  );
}

// An act that answered No: remembered for the sender.
export function rememberNoTracks(token, kind) {
  supabase.rpc("intake_no_tracks", { p_token: token, p_kind: kind }).then(({ error }) => { if (error && error.code !== "PGRST202") console.error(error); });
}

// "Tracks: Yes / No / No answer" on the link lists (Manage Links, event Links).
export function TracksChip({ value, small = false }) {
  const label = value === true ? "Tracks: yes" : value === false ? "Tracks: no" : "Tracks: no answer";
  const on = value === true;
  return (
    <span className={`inline-block font-bold uppercase tracking-wide rounded-full ${small ? "text-[9px] px-1.5 py-0.5 mt-1" : "text-[10px] px-2 py-0.5 mt-1.5"}`}
      style={on ? { background: DJ_COLOR + "26", color: DJ_COLOR } : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
      {label}
    </span>
  );
}
