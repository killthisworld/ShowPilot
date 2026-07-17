import { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";

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
        setPreferences(existing);
      } else {
        const { data: created, error: upsertError } = await supabase
          .from("user_preferences")
          .upsert(
            {
              user_id: user.id,
              genre_tags: DEFAULT_GENRE_TAGS,
              mix_bus_presets: DEFAULT_MIX_BUS_PRESETS,
              display_name: "",
              username: null,
            },
            { onConflict: "user_id" }
          )
          .select()
          .single();

        if (upsertError) throw upsertError;
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
