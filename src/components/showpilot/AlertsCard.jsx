import React from "react";
import { BellRing, BellOff } from "lucide-react";
import { usePush } from "@/lib/push";

// "Lock-screen alerts" switch (job 305), in Me (company phones) and the
// settings drawer (tech accounts). Round 1 sends event announcements and
// time changes.
export default function AlertsCard({ accent = "#8CFF3D", className = "mx-5 mt-4" }) {
  const { state, busy, err, turnOn, turnOff } = usePush();
  if (state === "loading" || state === "unsupported") return null;
  const on = state === "on";
  const sub = {
    on: "On for this phone: announcements and time changes on your events.",
    off: "Get announcements and time changes on your lock screen, even with Show Pilot closed.",
    blocked: "Alerts are blocked for Show Pilot. Turn them on in your phone's Settings, then come back.",
    "needs-home-screen": "On iPhone, add Show Pilot to your home screen first, then open it from there to turn alerts on.",
  }[state];
  return (
    <div className={`${className} rounded-2xl bg-[#161616] border border-[#262626] p-4`} style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: on ? accent + "22" : "#222" }}>
          {on ? <BellRing className="w-5 h-5" style={{ color: accent }} /> : <BellOff className="w-5 h-5 text-white/55" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-white text-[15px] font-semibold">Lock-screen alerts</div>
          <div className="text-white/55 text-[13px] mt-0.5 leading-snug">{sub}</div>
        </div>
        {(state === "on" || state === "off") && (
          <button type="button" role="switch" aria-checked={on} aria-label="Lock-screen alerts" disabled={busy} onClick={on ? turnOff : turnOn}
            className="relative w-[52px] h-[32px] rounded-full shrink-0 transition-colors disabled:opacity-50" style={{ background: on ? accent : "#3a3a3a" }}>
            <span className="absolute top-[3px] w-[26px] h-[26px] rounded-full bg-white transition-all" style={{ left: on ? 23 : 3 }} />
          </button>
        )}
      </div>
      {err && <p className="m-0 mt-2 text-[12.5px] text-red-400">{err}</p>}
    </div>
  );
}
