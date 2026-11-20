import React from "react";
import { isTruss } from "@/lib/lightingRig";

// The lighting rig drawn from above on the 4:3 stage (job 377): trusses as
// lattice beams, fixtures as small lamps in their color. Look-only under a
// stage plot, or the canvas of the rig editor (onItemDown / selected).
export const RIG_W = 400;
export const RIG_H = 300;
const TRUSS = "#8A8F98";

function Lattice({ len, w = 9 }) {
  // A straight truss: two chords and a zigzag, centred on 0,0 along x.
  const half = len / 2;
  const n = Math.max(2, Math.round(len / 10));
  const step = len / n;
  let d = "";
  for (let k = 0; k <= n; k++) d += `${k === 0 ? "M" : "L"}${-half + k * step},${k % 2 ? w / 2 : -w / 2} `;
  return (
    <g>
      <rect x={-half} y={-w / 2} width={len} height={w} fill="rgba(138,143,152,0.12)" />
      <line x1={-half} y1={-w / 2} x2={half} y2={-w / 2} stroke={TRUSS} strokeWidth="1.6" />
      <line x1={-half} y1={w / 2} x2={half} y2={w / 2} stroke={TRUSS} strokeWidth="1.6" />
      <path d={d} fill="none" stroke={TRUSS} strokeWidth="0.9" />
    </g>
  );
}

function Truss({ it }) {
  const L = it.len * RIG_W;
  if (it.type === "truss_straight") return <Lattice len={L} />;
  if (it.type === "truss_box") {
    const W = L, D = L * 0.6;
    return (
      <g>
        <g transform={`translate(0,${-D / 2})`}><Lattice len={W} /></g>
        <g transform={`translate(0,${D / 2})`}><Lattice len={W} /></g>
        <g transform={`translate(${-W / 2},0) rotate(90)`}><Lattice len={D} /></g>
        <g transform={`translate(${W / 2},0) rotate(90)`}><Lattice len={D} /></g>
      </g>
    );
  }
  // Circle: a ring with tick marks.
  const r = L / 2;
  return (
    <g>
      <circle r={r} fill="none" stroke="rgba(138,143,152,0.12)" strokeWidth="9" />
      <circle r={r - 4.5} fill="none" stroke={TRUSS} strokeWidth="1.6" />
      <circle r={r + 4.5} fill="none" stroke={TRUSS} strokeWidth="1.6" />
      <circle r={r} fill="none" stroke={TRUSS} strokeWidth="5" strokeDasharray="1 5" />
    </g>
  );
}

function Fixture({ it }) {
  const c = it.color || "#fff";
  switch (it.type) {
    case "wash":
      return (<g><circle r="11" fill={c} opacity="0.18" /><circle r="7" fill="#111" stroke={c} strokeWidth="2" /><circle r="4" fill={c} opacity="0.85" /></g>);
    case "beam":
      return (<g><circle r="6.5" fill="#111" stroke={c} strokeWidth="2" /><circle r="2" fill={c} /><line x1="0" y1="7" x2="0" y2="20" stroke={c} strokeWidth="1.6" opacity="0.7" /></g>);
    case "par":
      return (<g><circle r="6" fill={c} opacity="0.9" /><circle r="6" fill="none" stroke="#111" strokeWidth="1" /></g>);
    case "strobe":
      return (<g><rect x="-9" y="-5" width="18" height="10" rx="2" fill="#111" stroke={c} strokeWidth="1.8" /><path d="M1,-4 L-3,1 L0,1 L-1,4 L3,-1 L0,-1 Z" fill={c} /></g>);
    case "blinder":
      return (<g><rect x="-9" y="-6" width="18" height="12" rx="2" fill="#111" stroke={c} strokeWidth="1.8" /><circle cx="-4" r="2.6" fill={c} /><circle cx="4" r="2.6" fill={c} /></g>);
    case "led_bar": {
      const L = Math.max(16, it.len * RIG_W);
      return (<g><rect x={-L / 2} y="-3.5" width={L} height="7" rx="2" fill="#111" stroke={c} strokeWidth="1.6" /><line x1={-L / 2 + 4} y1="0" x2={L / 2 - 4} y2="0" stroke={c} strokeWidth="2" strokeDasharray="3 3" /></g>);
    }
    case "person": // someone standing there (job 389)
      return (<g><circle r="9" fill={c} opacity="0.9" /><circle r="9" fill="none" stroke="#111" strokeWidth="1.2" /></g>);
    case "fog":
      return (<g><rect x="-10" y="-6" width="20" height="12" rx="6" fill="#111" stroke={c} strokeWidth="1.6" /><path d="M-6,1 q3,-4 6,0 q3,4 6,0" fill="none" stroke={c} strokeWidth="1.4" /></g>);
    default: // spot (moving head)
      return (<g><circle r="8" fill="#111" stroke={c} strokeWidth="2" /><circle r="3.5" fill={c} /><rect x="-2" y="-11" width="4" height="4" fill={c} opacity="0.8" /></g>);
  }
}

// The size of an item's outline when it's picked.
const boxOf = (it) => {
  const L = it.len * RIG_W;
  if (it.type === "truss_straight") return { w: L + 8, h: 18 };
  if (it.type === "truss_box") return { w: L + 16, h: L * 0.6 + 16 };
  if (it.type === "truss_circle") return { w: L + 18, h: L + 18 };
  if (it.type === "led_bar") return { w: Math.max(16, L) + 10, h: 16 };
  return { w: 28, h: 28 };
};

export default function RigLayer({ rig, selected = null, onItemDown = null, className = "", dim = false }) {
  const items = rig?.items || [];
  // Trusses first, lights on top of them.
  const rank = (t) => (t === "riser" ? 0 : isTruss(t) ? 1 : 2); // risers under it all
  const order = [...items].sort((a, b) => rank(a.type) - rank(b.type));
  return (
    <svg viewBox={`0 0 ${RIG_W} ${RIG_H}`} preserveAspectRatio="none" className={`absolute inset-0 w-full h-full ${onItemDown ? "" : "pointer-events-none"} ${className}`}
      style={{ opacity: dim ? 0.55 : 1, overflow: "visible" }} aria-hidden={!onItemDown}>
      {order.map((it) => {
        const on = selected === it.id;
        const b = boxOf(it);
        return (
          <g key={it.id} transform={`translate(${it.x * RIG_W},${it.y * RIG_H}) rotate(${it.rot || 0})`}
            onPointerDown={onItemDown ? (e) => onItemDown(it.id, e) : undefined}
            style={{ cursor: onItemDown ? "grab" : undefined }}>
            {/* A bigger, invisible target to grab. */}
            {onItemDown && <rect x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h} fill="transparent" />}
            {it.type === "riser"
              ? <rect x={-((it.rw || 8) / (rig?.width_ft || 32)) * RIG_W / 2} y={-((it.rd || 8) / (rig?.depth_ft || 24)) * RIG_H / 2} width={((it.rw || 8) / (rig?.width_ft || 32)) * RIG_W} height={((it.rd || 8) / (rig?.depth_ft || 24)) * RIG_H} fill="#1f1f1f" stroke="#6b7280" strokeWidth="1.5" />
              : isTruss(it.type) ? <Truss it={it} /> : <Fixture it={it} />}
            {on && <rect x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h} rx="5" fill="none" stroke="#8CFF3D" strokeWidth="1.5" strokeDasharray="4 3" />}
          </g>
        );
      })}
    </svg>
  );
}
