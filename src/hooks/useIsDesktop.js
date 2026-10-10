import { useState, useEffect } from "react";

// True at laptop/desktop widths (1024px+). Pages that have a separate
// one-screen desktop layout branch on this; phones keep their own layout.
export default function useIsDesktop() {
  const q = "(min-width: 1024px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = (e) => setOn(e.matches);
    m.addEventListener("change", h);
    setOn(m.matches);
    return () => m.removeEventListener("change", h);
  }, []);
  return on;
}
