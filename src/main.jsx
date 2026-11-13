import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Lets the app open with no signal (job 73, On the road stage 9). Live site only.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.error("Service worker", e));
  });
}

// Pick up a new version (job 73, 2026-11-13). A home-screen app can stay open
// for days on an old copy, so when Show Pilot comes back to the front (and
// every 30 minutes) it checks whether the live site's app file changed, and
// reloads into the new one, never while someone is typing.
if (import.meta.env.PROD) {
  const mine = () => document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute("src");
  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== "visible" || navigator.onLine === false) return;
    checking = true;
    try {
      const html = await (await fetch("/", { cache: "no-store" })).text();
      const live = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/)?.[1];
      const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (live && mine() && live !== mine() && !typing) window.location.reload();
    } catch { /* no signal: try next time */ }
    checking = false;
  };
  document.addEventListener("visibilitychange", check);
  setInterval(check, 30 * 60 * 1000);
}
