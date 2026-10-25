import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { fetchMyIcons } from "@/lib/eventIcons";

// The event's photo behind a chat (job 73): rooms and private messages on a
// phone show the event they belong to. Your own icon for the event wins over
// the owner's, same as Home. Dimmed so messages stay easy to read.
//
// The parent must be `relative isolate` with its own background: this sits
// at -z-10, above that background and under everything else.
const cache = {};

// The event's photo URL (your own icon for it first), cached per token.
export function useEventPhoto(token) {
  const [url, setUrl] = useState(() => (token ? cache[token] ?? null : null));

  useEffect(() => {
    if (!token) return undefined;
    if (cache[token] !== undefined) { setUrl(cache[token]); return undefined; }
    let off = false;
    (async () => {
      const [{ data }, mine] = await Promise.all([
        supabase.rpc("get_shared_gig", { p_token: token }),
        fetchMyIcons(),
      ]);
      const next = (data?.id && mine[data.id]) || data?.icon_url || null;
      cache[token] = next;
      if (!off) setUrl(next);
    })().catch(() => {});
    return () => { off = true; };
  }, [token]);

  return url;
}

export default function EventBackdrop({ token }) {
  const url = useEventPhoto(token);

  if (!url) return null;
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
      <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(13,13,13,0.55) 0%, rgba(13,13,13,0.78) 40%, rgba(13,13,13,0.9) 100%)" }} />
    </div>
  );
}
