import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { DJ_COLOR } from "@/lib/djTools";
import MultitrackQuestion, { ServiceQuestions } from "@/components/showpilot/MultitrackQuestion";
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
    // Plain box, like Additional services (job 264).
    <div className="bg-[#111] rounded-2xl p-4">
      <p className="text-white text-sm font-semibold">Do you have tracks to send?</p>
      <p className="text-white/45 text-xs mt-1">Backing tracks or a DJ set. You'll add them right after you send this form.</p>
      <div className="grid grid-cols-2 gap-2 mt-3" role="radiogroup" aria-label="Tracks to send">
        {[[true, "Yes"], [false, "No"]].map(([v, text]) => {
          const on = value === v;
          return (
            <button key={text} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : v)}
              className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${on ? "border-[#8CFF3D]/60 bg-[#8CFF3D]/10 text-[#8CFF3D]" : "border-[#2a2a2a] text-white/60 hover:text-white"}`}>
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
// extraServices: the engineer's own services (job 265), asked after multi-track.
export function intakeCorners({ services, extraServices = [], asksTracks, form, update, icons }) {
  const mtDone = form.multitrack_interest === true || form.multitrack_interest === false;
  const trDone = form.has_tracks === true || form.has_tracks === false;
  return {
    corner: services ? { label: "Additional services", icon: icons.services, done: mtDone,
      body: () => (
        <>
          <MultitrackQuestion value={form.multitrack_interest ?? null} onChange={(v) => update("multitrack_interest", v)} />
          <ServiceQuestions services={extraServices} answers={form.service_answers || []} onChange={(v) => update("service_answers", v)} />
        </>
      ) } : null,
    cornerBL: asksTracks ? { label: "Tracks", icon: icons.tracks, done: trDone,
      body: () => <TracksQuestion value={form.has_tracks ?? null} onChange={(v) => update("has_tracks", v)} /> } : null,
  };
}

// Right after sending, for an act that has tracks: their set form for this
// event (made on the server).
// Returns null (so the page shows its usual Sent screen) when there's no slot.
// afterSent: shown under the set's Sent screen (the intake's feedback form; job 227).
export function IntakeTracksAfter({ token, kind, sentLine, fallback, afterSent = null }) {
  const [slot, setSlot] = useState(undefined); // undefined = loading, null = none
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

  // Straight into their set form (no "Now your tracks" banner or "I'll do
  // this later"; Jay, Nov 6). Sending it is one time and ends on the Sent sky.
  return <DjSetUpload tokenOverride={slot} afterSent={afterSent} />;
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
