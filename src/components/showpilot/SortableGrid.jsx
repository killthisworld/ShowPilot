import React, { useEffect, useRef, useState } from "react";

// Drag to rearrange a grid (job 439; job 446), phone and computer.
//   Phone: press and hold a tile (or grab its handle straight away), then
//   drag; a quick swipe or scroll does what it always does.
//   Computer: just drag it, any direction; a short drag to the left that
//   stays inside its row is the row's swipe.
// It lifts, the others make room as it passes, and it drops where you let go.
// While a drag is on, document.body.dataset.sorting is "1" so a SwipeRow
// inside leaves it alone.
//   items: the things in order; keyOf(item) -> key
//   onMove(key, toIndex): put that one at toIndex
//   render(item, { dragging, handle }): the tile; spread `handle` on a grip
//     element to start dragging from it straight away
const HOLD_MS = 380;
const SLOP = 8;

export default function SortableGrid({ items, keyOf, onMove, render, className = "", extra = null }) {
  const [dragKey, setDragKey] = useState("");
  const [ghost, setGhost] = useState(null); // { x, y, w, h, label }
  const st = useRef({ timer: 0, x0: 0, y0: 0, key: "", el: null, dragged: false, offX: 0, offY: 0, pendKey: "", mouse: false, touch: false });
  const keys = items.map(keyOf);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const cancelHold = () => { clearTimeout(st.current.timer); st.current.timer = 0; };
  const begin = (key, el, x, y) => {
    cancelHold();
    const r = el.getBoundingClientRect();
    st.current = { ...st.current, key, el, dragged: true, offX: x - r.left, offY: y - r.top };
    try { document.body.dataset.sorting = "1"; } catch { /* ignore */ }
    setDragKey(key);
    setGhost({ x: r.left, y: r.top, w: r.width, h: r.height });
    try { navigator.vibrate?.(12); } catch { /* not on this phone */ }
  };
  const onDown = (key) => (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget;
    const mouse = e.pointerType === "mouse";
    st.current = { ...st.current, x0: e.clientX, y0: e.clientY, key: "", el, dragged: false, pendKey: key, mouse, touch: e.pointerType === "touch", pending: true, rect: el.getBoundingClientRect() };
    cancelHold();
    // A finger holds first; a mouse decides as it moves (job 456).
    if (!mouse) st.current.timer = setTimeout(() => begin(key, el, st.current.x0, st.current.y0), HOLD_MS);
  };
  const handle = (key) => ({
    onPointerDown: (e) => { e.stopPropagation(); st.current.touch = e.pointerType === "touch"; begin(key, e.currentTarget.closest("[data-sort-key]"), e.clientX, e.clientY); },
    style: { touchAction: "none", cursor: "grab" },
    "aria-label": "Hold and drag to move",
  });

  useEffect(() => {
    const dragTo = (x, y) => {
      const s = st.current;
      setGhost((g) => (g ? { ...g, x: x - s.offX, y: y - s.offY } : g));
      const under = document.elementsFromPoint(x, y).map((n) => n.closest?.("[data-sort-key]")).find((n) => n && n.dataset.sortKey !== s.key);
      if (!under) return;
      const to = keysRef.current.indexOf(under.dataset.sortKey);
      if (to >= 0 && keysRef.current.indexOf(s.key) !== to) onMove(s.key, to);
    };
    const move = (e) => {
      const s = st.current;
      if (!s.key) {
        if (!s.pending) return;
        const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
        if (Math.hypot(dx, dy) <= SLOP) return;
        if (s.mouse) {
          // A mouse drags straight away in any direction. A drag to the left
          // that stays inside its own row is the swipe; once it leaves the
          // row (or goes up or down), it's a drag after all (job 456).
          const r = s.rect || { left: -1e9, right: 1e9, top: -1e9, bottom: 1e9 };
          const inside = e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6;
          const leftSwipe = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dy) < 16 && inside;
          if (!leftSwipe && s.el && s.pendKey) { s.pending = false; begin(s.pendKey, s.el, s.x0, s.y0); dragTo(e.clientX, e.clientY); }
          return;
        }
        s.pending = false;
        cancelHold();
        return;
      }
      e.preventDefault?.();
      dragTo(e.clientX, e.clientY);
    };
    const up = () => {
      cancelHold();
      st.current.pending = false;
      if (st.current.key) {
        st.current.key = "";
        st.current.touch = false;
        try { delete document.body.dataset.sorting; } catch { /* ignore */ }
        setDragKey("");
        setGhost(null);
        setTimeout(() => { st.current.dragged = false; }, 0);
      }
    };
    // A phone may hand the touch to scrolling (pointercancel); while a drag
    // is on, follow the touch itself and keep the page still.
    const cancel = () => { if (st.current.key && st.current.touch) return; up(); };
    const touchMove = (e) => {
      if (!st.current.key) return;
      e.preventDefault();
      const t = e.touches?.[0];
      if (t) dragTo(t.clientX, t.clientY);
    };
    const touchEnd = () => { if (st.current.key) up(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", touchEnd);
    window.addEventListener("touchcancel", touchEnd);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchEnd);
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
