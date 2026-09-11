import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { usePreferences } from "@/hooks/usePreferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, User, Music } from "lucide-react";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";

export default function BandSettings() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { preferences, loading, reload } = usePreferences();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initialized, setInitialized] = useState(false);

  if (!loading && preferences && !initialized) {
    setDisplayName(preferences.display_name || "");
    setInitialized(true);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, display_name: displayName }, { onConflict: "user_id" });
      if (error) throw error;
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto">
          <h1 className="text-white font-bold text-lg">Settings</h1>
        </div>
      </div>

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-4">
        <div className="bg-[#161616] rounded-2xl border border-[#222] p-4 space-y-3">
          <div>
            <Label className="text-white/50 text-xs">Display Name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your band or name"
              className="mt-1 bg-[#111] border-[#222] text-white"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e]">
            {saving ? "Saving..." : saved ? "Saved ✓" : "Save"}
          </Button>
        </div>

        <button
          disabled
          className="w-full bg-[#111] border border-[#222] rounded-2xl p-4 flex items-center gap-3 opacity-60 cursor-not-allowed"
        >
          <Music className="w-5 h-5 text-white/30 shrink-0" />
          <div className="text-left">
            <p className="text-white/50 text-sm font-medium">Band Profile</p>
            <p className="text-white/25 text-xs">Reusable tech rider & stage plot — coming soon</p>
          </div>
        </button>

        <Button onClick={handleSignOut} variant="ghost" className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 justify-start">
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>

      <BandBottomTabs />
    </div>
  );
}
