import React, { useEffect, useState } from "react";
import { Share, PlusSquare, X } from "lucide-react";

// "Put Show Pilot on your home screen" (job 73, On the road stage 9).
// Hidden when it's already opened from the home screen, on a computer, or
// once dismissed. Android / Chrome get a real Add button; iPhone gets the
// two taps Safari needs (Apple doesn't let a site do it for you).
const DISMISS = "sp-homescreen-dismissed";

const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || "");

let deferred = null; // Chrome's install prompt, caught as early as possible
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
}

export default function HomeScreenCard({ accent = "#8CFF3D" }) {
  const [hidden, setHidden] = useState(() => {
    try { if (localStorage.getItem(DISMISS)) return true; } catch { /* ignore */ }
    return standalone() || !isPhone();
  });
  const [prompt, setPrompt] = useState(deferred);

  useEffect(() => {
    const got = (e) => { e.preventDefault(); deferred = e; setPrompt(e); };
    window.addEventListener("beforeinstallprompt", got);
    return () => window.removeEventListener("beforeinstallprompt", got);
  }, []);

  if (hidden) return null;
  const dismiss = () => { try { localStorage.setItem(DISMISS, "1"); } catch { /* ignore */ } setHidden(true); };
  const add = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice.catch(() => ({}));
    deferred = null; setPrompt(null);
    if (outcome === "accepted") setHidden(true);
  };

  return (
    <div className="mx-5 mt-4 rounded-2xl bg-[#161616] border border-[#262626] p-4 relative" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <button type="button" onClick={dismiss} aria-label="Not now" className="absolute top-2 right-2 w-9 h-9 grid place-items-center text-white/40 hover:text-white">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <img src="/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0">
          <div className="text-white text-[15px] font-semibold">Put Show Pilot on your home screen</div>
          <div className="text-white/55 text-[13px] mt-0.5">Opens like an app, and your day sheet and guest list work with no signal.</div>
        </div>
      </div>
      {prompt ? (
        <button type="button" onClick={add} className="mt-3 w-full h-11 rounded-xl text-[14px] font-semibold text-black" style={{ background: accent }}>
          Add to home screen
        </button>
      ) : isIOS() ? (
        <div className="mt-3 text-white/75 text-[13px] leading-relaxed">
          In Safari, tap <Share className="inline w-4 h-4 -mt-0.5 mx-0.5" aria-label="Share" /> then <span className="whitespace-nowrap"><PlusSquare className="inline w-4 h-4 -mt-0.5 mx-0.5" aria-hidden /> Add to Home Screen</span>.
        </div>
      ) : (
        <div className="mt-3 text-white/75 text-[13px] leading-relaxed">
          In your browser's menu, tap <span className="whitespace-nowrap">Add to Home screen</span> (or Install app).
        </div>
      )}
    </div>
  );
}
