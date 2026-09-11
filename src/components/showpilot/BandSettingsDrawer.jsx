import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Menu, LogOut, Music } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

export default function BandSettingsDrawer({ preferences, onPreferencesUpdate }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(preferences?.display_name || "");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();

  useEffect(() => {
    setDisplayName(preferences?.display_name || "");
  }, [preferences]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: updated, error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, display_name: displayName }, { onConflict: "user_id" })
        .select()
        .single();
      if (error) throw error;
      onPreferencesUpdate?.(updated);
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="p-2 rounded-lg hover:bg-white/5 transition-colors">
          <Menu className="w-6 h-6 text-white/70" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 bg-[#111] border-[#222] p-0 overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="p-5">
          <h2 className="text-lg font-bold text-white mb-4">Settings</h2>

          <div className="space-y-4">
            <div>
              <Label className="text-white/50 text-xs">Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your band or name"
                className="mt-1 bg-[#1a1a1a] border-[#2a2a2a] text-white"
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e]">
              {saving ? "Saving..." : "Save"}
            </Button>

            <button
              disabled
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 flex items-center gap-3 opacity-60 cursor-not-allowed"
            >
              <Music className="w-4 h-4 text-white/30 shrink-0" />
              <div className="text-left">
                <p className="text-white/50 text-xs font-medium">Band Profile</p>
                <p className="text-white/25 text-[10px]">Reusable tech rider & stage plot — coming soon</p>
              </div>
            </button>

            <Button onClick={handleSignOut} variant="ghost" className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 justify-start">
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
