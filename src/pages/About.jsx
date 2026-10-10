import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// What the Show Pilot logo on the desktop rail opens: a quiet credits card
// on the same dotted board surface the desktop pages use.
export default function About() {
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative"
      style={{
        fontFamily: SCENE_FONT,
        backgroundColor: "#0d0d0d",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.3px)",
        backgroundSize: "22px 22px",
      }}
    >
      <button
        type="button"
        onClick={back}
        className="absolute top-5 left-5 flex items-center gap-1.5 text-white/50 hover:text-white text-sm font-semibold px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex flex-col items-center text-center gap-6">
        <img
          src="/icon-512.png"
          alt="Show Pilot"
          width={112}
          height={112}
          className="w-28 h-28 rounded-[26px]"
          style={{ boxShadow: "0 0 0 1px rgba(140,255,61,0.5), 0 0 60px rgba(140,255,61,0.25)" }}
        />
        <h1 className="text-white font-bold text-5xl tracking-wide leading-none">
          Show<span className="text-[#8CFF3D]">Pilot</span>
        </h1>
        <div className="w-12 h-px bg-[#2a2a2a]" />
        <p className="text-white/80 text-2xl font-semibold tracking-wide">Founded by Klean Studios</p>
        <p className="text-[#8CFF3D] text-sm tracking-[0.3em]" style={{ fontFamily: SCENE_MONO }}>EST. 2026</p>
      </div>
    </div>
  );
}
