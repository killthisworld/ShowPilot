import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";

// Announcements and time changes (job 73, "On the road" stage 2). Read
// through get_my_announcements: everything on your events you haven't seen
// yet, plus what you sent recently with how many have seen it.
export const ANNOUNCEMENTS_CHANGED = "showpilot:announcements-changed";

export default function useAnnouncements() {
  const [list, setList] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_announcements");
    if (error) { console.error(error); setList((l) => l || []); return; }
    setList(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener(ANNOUNCEMENTS_CHANGED, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(ANNOUNCEMENTS_CHANGED, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const markSeen = useCallback(async (id) => {
    setList((l) => (l || []).filter((a) => a.id !== id));
    const { error } = await supabase.rpc("mark_announcement_seen", { p_id: id });
    if (error) { console.error(error); load(); }
  }, [load]);

  return {
    unseen: (list || []).filter((a) => !a.mine && !a.seen),
    sent: (list || []).filter((a) => a.mine),
    loading: list === null,
    reload: load,
    markSeen,
  };
}
