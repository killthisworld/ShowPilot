import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Menu, User, LogOut, Star, Archive, Mail, Link2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/api/supabaseClient";
import { useToast } from "@/components/ui/use-toast";

export default function SettingsDrawer({ preferences, onPreferencesUpdate }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(preferences || { genre_tags: [], mix_bus_presets: [], display_name: "", username: "" });
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const lastRatingDate = prefs.last_rating_date ? new Date(prefs.last_rating_date) : null;
  const daysSinceRating = lastRatingDate ? (Date.now() - lastRatingDate.getTime()) / (1000 * 60 * 60 * 24) : 999;
  const canRate = daysSinceRating >= 7;

  useEffect(() => {
    if (preferences) setPrefs(preferences);
  }, [preferences]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      if (!user) throw new Error("Not logged in");

      const { id, ...rest } = prefs;
      if (!rest.username) rest.username = null;
      const { data: updated, error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, ...rest }, { onConflict: "user_id" })
        .select()
        .single();

      if (error) throw error;

      setPrefs(updated);
      onPreferencesUpdate?.(updated);
      toast({ title: "Settings saved" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error saving", variant: "destructive" });
    }
    setSaving(false);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
      setPrefs({ ...prefs, profile_photo_url: urlData.publicUrl });
    } catch (e) {
      console.error(e);
      toast({ title: "Error uploading photo", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const submitRating = async () => {
    if (!user) return;
    setRatingSubmitting(true);
    try {
      const { error: ratingError } = await supabase.from("app_ratings").insert({
        rating,
        comment: ratingComment,
        user_email: user.email || "",
        submitted_at: new Date().toISOString(),
      });
      if (ratingError) throw ratingError;

      const now = new Date().toISOString();
      const { id, ...rest } = prefs;
      if (!rest.username) rest.username = null;
      const { data: updated, error: prefsError } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, ...rest, last_rating_date: now }, { onConflict: "user_id" })
        .select()
        .single();

      if (prefsError) throw prefsError;

      setPrefs(updated);
      onPreferencesUpdate?.(updated);
      setRating(0);
      setRatingComment("");
      toast({ title: "Thanks for your feedback! ⭐" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error saving feedback", variant: "destructive" });
    }
    setRatingSubmitting(false);
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
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#222] flex items-center justify-center overflow-hidden border-2 border-[#333]">
                {prefs.profile_photo_url ? (
                  <img src={prefs.profile_photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-white/30" />
                )}
              </div>
              <label className="text-sm text-[#8CFF3D] cursor-pointer hover:underline">
                Upload Photo
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
            <div>
              <Label className="text-white/50 text-xs">Display Name</Label>
              <Input value={prefs.display_name || ""} onChange={(e) => setPrefs({ ...prefs, display_name: e.target.value })} className="mt-1 bg-[#1a1a1a] border-[#2a2a2a] text-white" />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Email</Label>
              <Input value={user?.email || ""} readOnly className="mt-1 bg-[#1a1a1a] border-[#2a2a2a] text-white/50" />
            </div>

            <Button onClick={() => { setOpen(false); navigate("/linked"); }} variant="outline" className="w-full border-pink-400/50 text-pink-400/80 hover:bg-pink-500/10 hover:text-pink-400 justify-start">
              <Link2 className="w-4 h-4 mr-2" /> Linked
            </Button>

            <Button onClick={() => { setOpen(false); navigate("/archived"); }} variant="outline" className="w-full border-[#8CFF3D]/30 text-[#8CFF3D]/80 hover:bg-[#8CFF3D]/10 hover:text-[#8CFF3D] justify-start">
              <Archive className="w-4 h-4 mr-2" /> Archived Shows
            </Button>

            <Button onClick={() => { setOpen(false); navigate("/manager-links"); }} variant="outline" className="w-full border-blue-400/50 text-blue-400/80 hover:bg-blue-500/10 hover:text-blue-400 justify-start">
              <Mail className="w-4 h-4 mr-2" /> Manage Links
            </Button>

            <Button onClick={save} disabled={saving} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e]">
              {saving ? "Saving..." : "Save Settings"}
            </Button>

            <div className="border-t border-[#222] pt-4">
              <Label className="text-white/50 text-xs block mb-2">Rate ShowPilot</Label>
              {canRate ? (
                <>
                  <div className="flex gap-1 mb-2">
                    {[1,2,3,4,5].map((star) => (
                      <button key={star} onClick={() => setRating(star)} className="transition-transform hover:scale-110">
                        <Star className="w-6 h-6" fill={star <= rating ? "#8CFF3D" : "none"} stroke={star <= rating ? "#8CFF3D" : "#555"} />
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="Any feedback or comments..."
                    className="bg-[#1a1a1a] border-[#2a2a2a] text-white text-sm min-h-[70px] resize-none"
                  />
                  <Button
                    size="sm"
                    disabled={rating === 0 || ratingSubmitting}
                    onClick={submitRating}
                    className="mt-2 w-full bg-[#8CFF3D]/10 text-[#8CFF3D] hover:bg-[#8CFF3D]/20 border border-[#8CFF3D]/20 disabled:opacity-40"
                  >
                    {ratingSubmitting ? "Sending..." : "Submit Rating"}
                  </Button>
                </>
              ) : (
                <p className="text-xs text-white/30 py-2">
                  Thanks for your feedback! You can rate again in {Math.ceil(7 - daysSinceRating)} day{Math.ceil(7 - daysSinceRating) !== 1 ? "s" : ""}.
                </p>
              )}
            </div>
            <Button onClick={handleLogout} variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full justify-start">
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
