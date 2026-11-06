import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { FAN_RSVP_OPEN } from "@/lib/hiddenProfiles";

// Fan messages for the Chats page (job 236): one thread per event you own
// that fans have messaged (get_fan_message_threads), unread first.
export default function useFanThreads() {
  const [threads, setThreads] = useState([]);
  const reload = useCallback(() => {
    if (!FAN_RSVP_OPEN) return Promise.resolve();
    return supabase.rpc("get_fan_message_threads").then(({ data, error }) => {
      if (error) { console.error(error); return; }
      setThreads(Array.isArray(data) ? data : []);
    });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { threads, reload };
}
