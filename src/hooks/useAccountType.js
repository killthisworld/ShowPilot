import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { accountTypeOf } from "@/lib/accountTypeStyle";

// The signed-in account's type ("engineer", "lighting", ...), looked up once
// per visit (job 400): for screens that only need to know which kind of
// account they're showing, not the whole preferences row.
let cached = null;
export default function useAccountType() {
  // Until it's looked up, the type remembered on this device (job 412).
  const [type, setType] = useState(cached || accountTypeOf(null) || null);
  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("user_preferences").select("account_type").eq("user_id", user.id).maybeSingle();
      cached = data?.account_type || "engineer";
      if (alive) setType(cached);
    })().catch(() => {});
    return () => { alive = false; };
  }, []);
  return type;
}
