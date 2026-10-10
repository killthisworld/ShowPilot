import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import GalaxyCanvas from "@/components/showpilot/GalaxyCanvas";

// What the Show Pilot logo on the desktop rail opens: a quiet credits card
// under a night sky, as if lying back and looking straight up. The sky is
// the same GalaxyCanvas the event sky page uses, set a little larger than
// the screen and drifting very slowly (a 4-minute sway), with the odd
// shooting star. Toned toward black (less blue) than the RSVP sky with a
// CSS filter, so the shared component stays untouched. Reduced motion:
// still sky, no drift, no meteors.
export default function About() {
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden isolate"
      style={{ fontFamily: SCENE_FONT, backgroundColor: "#000" }}
    >
      <style>{`
        @keyframes sp-sky-drift { from { transform: translate(-2.5vw, -1.5vh) rotate(-1deg); } to { transform: translate(2.5vw, 1.5vh) rotate(1deg); } }
        @keyframes sp-meteor {
          0%, 92% { opacity: 0; transform: translate(0, 0) rotate(-35deg); }
          93% { opacity: 1; }
          100% { opacity: 0; transform: translate(-420px, 290px) rotate(-35deg); }
        }
        .sp-sky-drift { animation: sp-sky-drift 240s ease-in-out infinite alternate; }
        .sp-meteor { opacity: 0; animation: sp-meteor 11s ease-in infinite both; }
        @media (prefers-reduced-motion: reduce) { .sp-sky-drift, .sp-meteor { animation: none; } .sp-meteor { display: none; } }
      `}</style>
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* A little oversized so the edges never show while it drifts. */}
        <div className="sp-sky-drift absolute" style={{ width: "112vw", height: "112vh", left: "-6vw", top: "-6vh", filter: "saturate(0.35) brightness(0.82) contrast(1.15)" }}>
          <GalaxyCanvas seed="showpilot-about" />
        </div>
        <span className="sp-meteor absolute h-px w-[140px]" style={{ top: "18%", left: "78%", background: "linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,255,255,0))", animationDelay: "3s" }} />
        <span className="sp-meteor absolute h-px w-[100px]" style={{ top: "8%", left: "40%", background: "linear-gradient(90deg, rgba(200,215,255,0.8), rgba(200,215,255,0))", animationDelay: "8.5s", animationDuration: "17s" }} />
        {/* A soft vignette keeps the text area calm. */}
        <span className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.5), rgba(0,0,0,0) 60%)" }} />
      </div>
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
