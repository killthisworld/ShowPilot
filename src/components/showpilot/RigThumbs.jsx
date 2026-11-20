import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";

const Stage3D = lazy(() => import("@/components/showpilot/Stage3D"));
const KEY = "sp-rigthumb:";
const ver = (s) => String(s.updated_at || "");

// Pictures of the LD's stages as they were built (job 396): each stage is
// drawn once, off screen, in 3D - trusses, lights with their beams, risers,
// people and instruments - and kept in this browser until it changes.
//   const [thumbs, drawer] = useRigThumbs(stages)  // stages: [{ id, rig, updated_at }]
//   thumbs[id] -> image URL; render {drawer} somewhere on the page.
export default function useRigThumbs(stages) {
  const [shots, setShots] = useState({}); // id -> { at, url }
  const list = useMemo(() => (stages || []).filter((s) => s && s.id && s.rig && (s.rig.items || []).length), [stages]);
  // The ones kept from before, if they're still current.
  useEffect(() => {
    const got = {};
    list.forEach((s) => {
      try {
        const c = JSON.parse(localStorage.getItem(KEY + s.id) || "null");
        if (c && c.at === ver(s) && c.url) got[s.id] = c;
      } catch { /* no storage: draw it */ }
    });
    if (Object.keys(got).length) setShots((t) => ({ ...got, ...t }));
  }, [list]);
  // One at a time: the first stage without a current picture.
  const next = list.find((s) => shots[s.id]?.at !== ver(s));
  const drawer = next ? (
    <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: 480, height: 360, pointerEvents: "none" }}>
      <Suspense fallback={null}>
        <Stage3D key={`${next.id}:${ver(next)}`} rig={next.rig} labels={false} mode="view"
          onSnapshot={(url) => {
            const shot = { at: ver(next), url: url || "" };
            setShots((t) => ({ ...t, [next.id]: shot }));
            if (url) { try { localStorage.setItem(KEY + next.id, JSON.stringify(shot)); } catch { /* full or blocked: just this visit */ } }
          }} />
      </Suspense>
    </div>
  ) : null;
  const thumbs = useMemo(() => Object.fromEntries(Object.entries(shots).filter(([, v]) => v.url).map(([k, v]) => [k, v.url])), [shots]);
  return [thumbs, drawer];
}
