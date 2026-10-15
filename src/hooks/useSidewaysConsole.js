import { useEffect, useState } from "react";

// "Console when sideways" (Settings > Customize): when a tech profile turns
// their phone sideways, Home shows their shows as console channel strips;
// upright stays the normal layout. It's a per-device choice (how this phone
// behaves when turned), so it lives in localStorage, on by default.
const KEY = "showpilot_sideways_console";
const EVENT = "showpilot:sideways-console";

export function getSidewaysConsole() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSidewaysConsole(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch { /* private mode: falls back to the default */ }
  window.dispatchEvent(new Event(EVENT));
}

// The setting itself, kept in sync across components.
export function useSidewaysSetting() {
  const [on, setOn] = useState(getSidewaysConsole);
  useEffect(() => {
    const sync = () => setOn(getSidewaysConsole());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return [on, (v) => { setSidewaysConsole(v); setOn(v); }];
}

// A phone held sideways: landscape and short. A desktop window that happens
// to be wide isn't "sideways", so the height cap keeps this to phones.
const QUERY = "(orientation: landscape) and (max-height: 500px)";

export default function useSidewaysConsole(enabledForProfile = true) {
  const [on] = useSidewaysSetting();
  const [landscape, setLandscape] = useState(() => typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const m = window.matchMedia(QUERY);
    const h = (e) => setLandscape(e.matches);
    m.addEventListener("change", h);
    setLandscape(m.matches);
    return () => m.removeEventListener("change", h);
  }, []);
  return enabledForProfile && on && landscape;
}
