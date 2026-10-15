import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A fan link holds either a custom name (/rsvp/friday-night-live) or the
// event's token (/rsvp/<token>, or the older /e/<token>). This turns whichever
// it is into the token the rest of the fan page works with.
// state: "loading" | "ok" | "missing"
export default function useFanToken(key) {
  const direct = UUID_RE.test(key || "");
  const [res, setRes] = useState({ key: null, token: null });
  useEffect(() => {
    if (direct || !key) return undefined;
    let alive = true;
    supabase.rpc("resolve_fan_key", { p_key: key }).then(({ data, error }) => {
      if (alive) setRes({ key, token: error || !data ? null : data });
    });
    return () => { alive = false; };
  }, [key, direct]);
  if (direct) return { token: key, state: "ok" };
  if (!key) return { token: null, state: "missing" };
  if (res.key !== key) return { token: null, state: "loading" };
  return res.token ? { token: res.token, state: "ok" } : { token: null, state: "missing" };
}
