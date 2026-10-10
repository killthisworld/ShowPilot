import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import GalaxyCanvas from "@/components/showpilot/GalaxyCanvas";
import SpaceDrift from "@/components/showpilot/SpaceDrift";

// The frame every sign-in / sign-up screen sits in: the same night sky as
// the About page (GalaxyCanvas toned toward black, SpaceDrift on top), the
// app icon and wordmark, and one console panel. Reduced motion: still sky.
// `compact` trims the logo for taller steps so they still fit a laptop screen.
export default function AuthShell({ children, width = 420, compact = false }) {
  return (
    <div
      className={`min-h-screen relative overflow-hidden isolate flex flex-col items-center justify-center px-4 ${compact ? "py-6" : "py-10"}`}
      style={{ fontFamily: SCENE_FONT, backgroundColor: "#000" }}
    >
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute" style={{ width: "112vw", height: "112vh", left: "-6vw", top: "-6vh", filter: "saturate(0.35) brightness(0.8) contrast(1.15)" }}>
          <GalaxyCanvas seed="showpilot-boarding" />
        </div>
        <SpaceDrift />
        <span className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0.62), rgba(0,0,0,0) 65%)" }} />
      </div>

      <div className={`flex flex-col items-center ${compact ? "gap-2 mb-5" : "gap-3 mb-7"}`}>
        <img
          src="/icon-512.png"
          alt=""
          width={64}
          height={64}
          className={compact ? "w-12 h-12 rounded-[12px]" : "w-16 h-16 rounded-[16px]"}
          style={{ boxShadow: "0 0 0 1px rgba(140,255,61,0.5), 0 0 44px rgba(140,255,61,0.25)" }}
        />
        <h1 className={`text-white font-bold tracking-wide leading-none ${compact ? "text-3xl" : "text-4xl"}`}>
          Show<span className="text-[#8CFF3D]">Pilot</span>
        </h1>
      </div>

      <div className="w-full" style={{ maxWidth: width }}>{children}</div>
    </div>
  );
}

// The console panel the forms live in (same panel as the desktop Cockpit).
export function AuthPanel({ children, className = "" }) {
  return (
    <div
      className={`w-full bg-[#121212]/95 backdrop-blur-sm border border-[#262626] rounded-xl ${className}`}
      style={{ boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}
    >
      {children}
    </div>
  );
}

export function AuthHead({ step, title, sub, aside }) {
  return (
    <div className="px-6 pt-5 pb-4 border-b border-dashed border-[#2a2a2a] flex items-start justify-between gap-4">
      <div className="min-w-0">
        {step && <div className="text-[11px] tracking-[0.14em] text-white/45 mb-1.5" style={{ fontFamily: SCENE_MONO }}>{step}</div>}
        <h2 className="text-white text-[28px] font-bold leading-[1.05] tracking-wide">{title}</h2>
        {sub && <p className="text-white/55 text-base mt-1.5 leading-snug">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

const inputClass =
  "w-full h-11 px-3.5 rounded-lg bg-[#0b0b0b] border border-[#2a2a2a] text-white text-base placeholder:text-white/25 outline-none transition-colors focus:border-[#8CFF3D] focus:shadow-[0_0_0_3px_rgba(140,255,61,0.15)]";

// Label + input. `password` adds the show/hide eye; `labelAside` sits at the
// right of the label row (e.g. "Forgot password?").
export function AuthField({ label, labelAside, password = false, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] tracking-[0.12em] text-white/50" style={{ fontFamily: SCENE_MONO }}>{label.toUpperCase()}</span>
        {labelAside}
      </span>
      <span className="relative block">
        <input {...props} type={password ? (shown ? "text" : "password") : props.type} className={`${inputClass} ${password ? "pr-11" : ""}`} />
        {password && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md flex items-center justify-center text-white/35 hover:text-white/70"
          >
            {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </span>
    </label>
  );
}

export function AuthButton({ children, color = "#8CFF3D", ...props }) {
  return (
    <button
      {...props}
      className="w-full h-12 rounded-lg text-lg font-bold tracking-wide text-[#0d0d0d] transition-[filter,opacity] hover:brightness-110 disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      style={{ background: color, boxShadow: `0 0 18px ${color}44` }}
    >
      {children}
    </button>
  );
}

export function AuthGoogle({ onClick }) {
  return (
    <>
      <div className="flex items-center gap-3 my-5">
        <div className="h-px flex-1 bg-[#262626]" />
        <span className="text-xs text-white/35">or</span>
        <div className="h-px flex-1 bg-[#262626]" />
      </div>
      <button
        type="button"
        onClick={onClick}
        className="w-full h-11 rounded-lg border border-[#2f2f2f] text-white/85 text-base font-semibold hover:bg-white/5 hover:border-[#3a3a3a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        Continue with Google
      </button>
    </>
  );
}

export function AuthFoot({ children }) {
  return <div className="px-6 py-4 border-t border-dashed border-[#2a2a2a] text-center text-[15px] text-white/50">{children}</div>;
}
