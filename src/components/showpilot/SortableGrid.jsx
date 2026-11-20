import React, { useEffect, useRef, useState } from "react";

// Hold and drag to rearrange a grid (job 439), phone and computer.
// Press and hold a tile (or grab its handle) and it lifts; drag it over the
// others and they make room; let go to drop. A quick swipe or scroll does
// what it always does, since the hold is cancelled once the finger moves.
//   items: the things in order; keyOf(item) -> key
//   onMove(key, toIndex): put that one at toIndex
//   render(item, { dragging, handle }): the tile; spread `handle` on a grip
//     element to start dragging from it straight away
const HOLD_MS = 380;
const SLOP = 8;

export default function SortableGrid({ items, keyOf, onMove, render, className = "", extra = null }) {
  const [dragKey, setDragKey] = useState("");
  const [ghost, setGhost] = useState(null); // { x, y, w, h, label }
  const st = useRef({ timer: 0, x0: 0, y0: 0, key: "", el: null, dragged: false, offX: 0, offY: 0 });
  const keys = items.map(keyOf);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const cancelHold = () => { clearTimeout(st.current.timer); st.current.timer = 0; };
  const begin = (key, el, x, y) => {
    cancelHold();
    const r = el.getBoundingClientRect();
    st.current = { ...st.current, key, el, dragged: true, offX: x - r.left, offY: y - r.top };
    setDragKey(key);
    setGhost({ x: r.left, y: r.top, w: r.width, h: r.height });
    try { navigator.vibrate?.(12); } catch { /* not on this phone */ }
  };
  const onDown = (key) => (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget;
    st.current = { ...st.current, x0: e.clientX, y0: e.clientY, key: "", el, dragged: false };
    cancelHold();
    st.current.timer = setTimeout(() => begin(key, el, st.current.x0, st.current.y0), HOLD_MS);
  };
  const handle = (key) => ({
    onPointerDown: (e) => { e.stopPropagation(); begin(key, e.currentTarget.closest("[data-sort-key]"), e.clientX, e.clientY); },
    style: { touchAction: "none", cursor: "grab" },
    "aria-label": "Hold and drag to move",
  });

  useEffect(() => {
    const move = (e) => {
      const s = st.current;
      if (!s.key) {
        if (s.timer && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > SLOP) cancelHold();
        return;
      }
      e.preventDefault?.();
      setGhost((g) => (g ? { ...g, x: e.clientX - s.offX, y: e.clientY - s.offY } : g));
      const under = document.elementsFromPoint(e.clientX, e.clientY).map((n) => n.closest?.("[data-sort-key]")).find((n) => n && n.dataset.sortKey !== s.key);
      if (!under) return;
      const to = keysRef.current.indexOf(under.dataset.sortKey);
      if (to >= 0 && keysRef.current.indexOf(s.key) !== to) onMove(s.key, to);
    };
    const up = () => {
      cancelHold();
      if (st.current.key) {
        st.current.key = "";
        setDragKey("");
        setGhost(null);
        setTimeout(() => { st.current.dragged = false; }, 0);
      }
    };
    // Stop the page scrolling while a tile is being dragged on a phone.
    const touchMove = (e) => { if (st.current.key) e.preventDefault(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("touchmove", touchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("touchmove", touchMove);
    };
  }, [onMove]);

  return (
    <div className={className}>
      {items.map((it) => {
        const key = keyOf(it);
        const dragging = dragKey === key;
        return (
          <div key={key} data-sort-key={key} onPointerDown={onDown(key)}
            onClickCapture={(e) => { if (st.current.dragged) { e.preventDefault(); e.stopPropagation(); } }}
            onContextMenu={(e) => { if (st.current.timer || st.current.key) e.preventDefault(); }}
            className="min-w-0 relative select-none [-webkit-touch-callout:none]"
            style={{ opacity: dragging ? 0.35 : 1, transition: "opacity 0.15s" }}>
            {render(it, { dragging, handle: handle(key) })}
          </div>
        );
      })}
      {extra}
      {ghost && dragKey && (
        <div aria-hidden="true" className="fixed z-[90] pointer-events-none rounded-[12px] shadow-[0_18px_40px_rgba(0,0,0,0.65)]"
          style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h, transform: "scale(1.04) rotate(-1deg)" }}>
          {render(items.find((it) => keyOf(it) === dragKey) || items[0], { dragging: false, handle: {}, ghost: true })}
        </div>
      )}
    </div>
  );
}
