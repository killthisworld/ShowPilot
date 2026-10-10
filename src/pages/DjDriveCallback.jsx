import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { driveCall } from "@/lib/djTools";

const G = "#8CFF3D";

// Google sends the DJ back here after they approve (or cancel) the Drive
// connection. The one-time code goes to the server, which keeps the token.
export default function DjDriveCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "working", message: "", returnTo: "/dj", email: "" });
  const started = useRef(false); // the code works once; don't send it twice

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    if (!code) {
      setState({ status: "error", message: params.get("error") === "access_denied" ? "You cancelled connecting Google Drive." : "Google didn't send a connection code.", returnTo: "/dj" });
      return;
    }
    driveCall("finish", { code, state: params.get("state") || "" })
      .then((d) => setState({ status: "done", message: "", returnTo: d?.return_to || "/dj", email: d?.email || "" }))
      .catch((e) => setState({ status: "error", message: e.message, returnTo: "/dj" }));
  }, [params]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center px-6" style={{ fontFamily: SCENE_FONT }}>
      <div className="w-full max-w-sm text-center">
        <div className="text-[10px] tracking-[0.14em] text-white/45" style={{ fontFamily: SCENE_MONO }}>SHOWPILOT · GOOGLE DRIVE</div>
        {state.status === "working" && (
          <>
            <div className="mt-6 mx-auto w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
            <p className="mt-4 text-lg font-semibold text-white/80">Connecting your Google Drive…</p>
          </>
        )}
        {state.status === "done" && (
          <>
            <span className="mt-6 mx-auto w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#8CFF3D24", border: "1px solid #8CFF3D8c", color: G }}><Check className="w-6 h-6" /></span>
            <p className="mt-4 text-2xl font-bold">Google Drive connected</p>
            <p className="mt-1 text-[15px] text-white/55">{state.email ? `${state.email}: ` : ""}artists' WAVs will land in a "Show Pilot" folder in your Drive.</p>
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
            BACK TO DJ TOOLS
          </button>
        )}
      </div>
    </div>
  );
}
