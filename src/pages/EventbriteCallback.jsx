import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { eventbriteCall } from "@/lib/eventbrite";

const G = "#8CFF3D";

// Eventbrite sends the host back here after they approve (or cancel) the
// connection. We hand the one-time code to the server, which swaps it for a
// token and registers the sales webhook, then send the host back to where
// they started.
export default function EventbriteCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "working", message: "", returnTo: "/" });
  const started = useRef(false); // the code works once; don't send it twice

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    if (!code) {
      setState({ status: "error", message: params.get("error") === "access_denied" ? "You cancelled connecting Eventbrite." : "Eventbrite didn't send a connection code.", returnTo: "/" });
      return;
    }
    eventbriteCall("finish", { code, state: params.get("state") || "" })
      .then((d) => setState({ status: "done", message: "", returnTo: d?.return_to || "/" }))
      .catch((e) => setState({ status: "error", message: e.message, returnTo: "/" }));
  }, [params]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center px-6" style={{ fontFamily: SCENE_FONT }}>
      <div className="w-full max-w-sm text-center">
        <div className="text-[10px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>SHOWPILOT · EVENTBRITE</div>
        {state.status === "working" && (
          <>
            <div className="mt-6 mx-auto w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
            <p className="mt-4 text-lg font-semibold text-white/80">Connecting your Eventbrite account…</p>
          </>
        )}
        {state.status === "done" && (
          <>
            <span className="mt-6 mx-auto w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#8CFF3D24", border: "1px solid #8CFF3D8c", color: G }}><Check className="w-6 h-6" /></span>
            <p className="mt-4 text-2xl font-bold">Eventbrite connected</p>
            <p className="mt-1 text-[15px] text-white/55">Open the event's Fan page settings and pick which Eventbrite event it sells through.</p>
          </>
        )}
        {state.status === "error" && (
          <>
            <p className="mt-6 text-2xl font-bold">Not connected</p>
            <p className="mt-1 text-[15px] text-white/55">{state.message}</p>
          </>
        )}
        {state.status !== "working" && (
          <button type="button" onClick={() => navigate(state.returnTo, { replace: true })} className="mt-6 w-full py-[11px] rounded-[10px] text-base font-bold tracking-[0.06em]" style={{ background: G, color: "#0d0d0d" }}>
            BACK TO EVENT
          </button>
        )}
      </div>
    </div>
  );
}
