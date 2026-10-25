import React from "react";
import GalaxyCanvas from "@/components/showpilot/GalaxyCanvas";
import SpaceDrift from "@/components/showpilot/SpaceDrift";

// The About page's night sky (GalaxyCanvas swaying slowly + SpaceDrift's
// moving stars and shooting stars), sized to fill its parent instead of the
// window. Used behind desktop chats. The parent must be `relative isolate`:
// this sits at -z-10. `dim` darkens it a little so messages stay easy to
// read. Reduced motion: a still sky.
export default function NightSky({ seed = "showpilot-about", dim = 0.2 }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" style={{ backgroundColor: "#000" }}>
      <style>{`
        @keyframes sp-panel-sky-drift { from { transform: translate(-2.5%, -1.5%) rotate(-1deg); } to { transform: translate(2.5%, 1.5%) rotate(1deg); } }
        .sp-panel-sky-drift { animation: sp-panel-sky-drift 120s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) { .sp-panel-sky-drift { animation: none; } }
      `}</style>
      {/* A little oversized so the edges never show while it drifts. */}
      <div className="sp-panel-sky-drift absolute" style={{ width: "112%", height: "112%", left: "-6%", top: "-6%", filter: "saturate(0.35) brightness(0.82) contrast(1.15)" }}>
        <GalaxyCanvas seed={seed} />
      </div>
      <SpaceDrift />
      {dim > 0 && <span className="absolute inset-0" style={{ background: `rgba(0,0,0,${dim})` }} />}
    </div>
  );
}
