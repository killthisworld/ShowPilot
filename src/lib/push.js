import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

// Lock-screen alerts (job 305): turn them on for this phone. The browser
// makes a push address for Show Pilot's key; it's saved to the account
// (save_push_subscription) and the send-push function sends to it.
// iPhone: only from the home-screen app (iOS 16.4+).

// The public half of Show Pilot's VAPID key (safe to ship; the private half
// is a Supabase secret). Can be overridden with VITE_VAPID_PUBLIC_KEY.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "BKkwkWKrBxihWAX2ZwFGEUtdbYZtpF_F8hzCACR5PQLYckw8OeUhSup6vzyf-UIKAAiao8E_0dKQ43Lx5Z8VKmo";

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

function keyBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// "on" | "off" | "blocked" (said no in the phone's settings) |
// "needs-home-screen" (iPhone in Safari) | "unsupported" | "loading"
export function usePush() {
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const check = useCallback(async () => {
    try {
      if (isIOS() && !standalone()) { setState("needs-home-screen"); return; }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
      if (Notification.permission === "denied") { setState("blocked"); return; }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    } catch { setState("unsupported"); }
  }, []);
  useEffect(() => { check(); }, [check]);

  const turnOn = async () => {
    setBusy(true); setErr("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "off"); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
      const j = sub.toJSON();
      const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent });
      if (error) throw error;
      setState("on");
    } catch (e) {
      console.error(e);
      setErr("Couldn't turn alerts on. Check your signal and try again.");
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true); setErr("");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) { console.error(e); setErr("Couldn't turn alerts off. Try again."); }
    finally { setBusy(false); }
  };

  return { state, busy, err, turnOn, turnOff };
}
