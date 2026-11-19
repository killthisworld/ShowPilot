import React, { useRef, useState } from "react";

// Swipe a row left to show its actions (job 361), like the gig cards on the
// Manager / Artist home. Works with a finger or a mouse drag; a vertical
// drag scrolls the page as usual. A tap on an open row closes it instead of
// opening the link inside. The actions are real buttons: tabbing to one
// slides the row open.
//   actions: [{ label, icon: LucideIcon, color, onClick }]
const ACTION_W = 84;

export default function SwipeRow({ actions = [], children, radius = 14, label = "" }) {
  const width = ACTION_W * actions.length;
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const moved = useRef(false);

  if (!actions.length) return children;

  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x0: e.clientX, y0: e.clientY, start: x, axis: null };
    moved.current = false;
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") setDragging(true);
    }
    if (d.axis !== "x") return;
    moved.current = true;
    setX(Math.max(-width, Math.min(0, d.start + dx)));
  };
  const up = () => {
    if (!drag.current) return;
    const wasX = drag.current.axis === "x";
    drag.current = null;
    setDragging(false);
    if (wasX) setX((v) => (v < -width / 2 ? -width : 0));
  };
  // A drag isn't a tap; a tap on an open row just closes it.
  const clickCapture = (e) => {
    if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; return; }
    if (x !== 0) { e.preventDefault(); e.stopPropagation(); setX(0); }
  };

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: radius }} role="group" aria-label={label || undefined}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width }}>
        {actions.map(({ label: text, icon: Icon, color, onClick }) => (
          <button
            key={text}
            type="button"
            onFocus={() => setX(-width)}
            onBlur={() => setX(0)}
            onClick={(e) => { e.stopPropagation(); setX(0); onClick?.(); }}
            className="flex-1 flex flex-col items-center justify-center gap-1 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
            style={{ background: `${color}26`, color }}
          >
            {Icon && <Icon className="w-5 h-5" />}
            <span className="leading-tight text-center px-1">{text}</span>
          </button>
        ))}
      </div>
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        onClickCapture={clickCapture}
        onDragStart={(e) => e.preventDefault()}
        className="relative select-none"
        style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform 0.2s ease-out", touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}
