import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import SpaceDrift from "@/components/showpilot/SpaceDrift";

// /fan/unsubscribe?t=<token>  (public, no login)
// The "Stop these emails" link in the weekly "new shows near you" email
// (job 93). Turns the email off for that fan; local shows in the app stay on.
export default function FanUnsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const [state, setState] = useState("working"); // working | done | bad
  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) { setState("bad"); return; }
    supabase.rpc("unsubscribe_fan_digest", { p_token: token }).then(({ data, error }) => setState(!error && data ? "done" : "bad"));
  }, [token]);

  return (
    <div className="min-h-[100dvh] relative isolate overflow-hidden flex items-center justify-center px-5 text-white" style={{ fontFamily: SCENE_FONT, background: "#000" }}>
      <div aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none"><SpaceDrift /></div>
      <div className="w-full max-w-sm rounded-2xl px-6 py-7 text-center" style={{ background: "rgba(16,20,52,0.82)", border: "1px solid #2b2f5a" }}>
        <div className="text-[11px] tracking-[0.16em]" style={{ fontFamily: SCENE_MONO, color: "#b7bbe6" }}>SHOW PILOT · LOCAL SHOWS</div>
        {state === "working" && <div className="mx-auto mt-6 w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
        {state === "done" && (
          <>
            <h1 className="mt-3 text-[26px] font-bold leading-tight">You're unsubscribed</h1>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "#b7bbe6" }}>No more weekly emails. Local shows still show up in Discover, and you can turn the email back on in Me anytime.</p>
          </>
        )}
        {state === "bad" && (
          <>
            <h1 className="mt-3 text-[26px] font-bold leading-tight">That link didn't work</h1>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "#b7bbe6" }}>Turn the weekly email off in your fan profile under Me instead.</p>
          </>
        )}
        <a href="/" className="inline-block mt-5 px-5 py-2.5 rounded-xl text-[15px] font-bold" style={{ background: "#8CFF3D", color: "#0d0d0d" }}>Open Show Pilot</a>
      </div>
    </div>
  );
}
