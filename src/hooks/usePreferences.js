import { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { readPendingAccountType, clearPendingAccountType } from "@/lib/pendingAccountType";

// Several components load preferences at once; only one of them needs to
// copy a Google sign-up's role onto the account.
let accountTypeSynced = false;

const DEFAULT_GENRE_TAGS = [
  { name: "Rock", color: "#EF4444" },
  { name: "Indie", color: "#3B82F6" },
  { name: "Pop", color: "#EC4899" },
  { name: "Jazz", color: "#EAB308" },
  { name: "Electronic", color: "#8B5CF6" },
];

const DEFAULT_MIX_BUS_PRESETS = [
  { bus_type: "IEM", color: "#EAB308" },
  { bus_type: "Monitor", color: "#F97316" },
];

export function usePreferences() {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPreferences(null);
        setLoading(false);
        return;
      }

      const { data: existing, error: fetchError } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        // The account is set up; a role remembered for a Google sign-up is
        // no longer needed (and never changes an existing account).
        clearPendingAccountType();
        setPreferences(existing);
      } else {
        // Email sign-up stores the role on the account; Google sign-up
        // can't, so fall back to the role picked on Create account.
        const pendingType = readPendingAccountType();
        const accountType = user.user_metadata?.account_type || pendingType || "engineer";
        const { data: created, error: upsertError } = await supabase
          .from("user_preferences")
          .upsert(
            {
              user_id: user.id,
              genre_tags: DEFAULT_GENRE_TAGS,
              mix_bus_presets: DEFAULT_MIX_BUS_PRESETS,
              display_name: "",
              username: null,
              account_type: accountType,
            },
            { onConflict: "user_id" }
          )
          .select()
          .single();

        if (upsertError) throw upsertError;
        // Keep the account's own record in step, so the role survives even if
        // this settings row were ever recreated.
        if (pendingType && !user.user_metadata?.account_type && !accountTypeSynced) {
          accountTypeSynced = true;
          supabase.auth.updateUser({ data: { account_type: accountType } }).then(({ error }) => { if (error) console.error(error); });
        }
        setPreferences(created);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return { preferences, loading, reload: load, setPreferences };
}
