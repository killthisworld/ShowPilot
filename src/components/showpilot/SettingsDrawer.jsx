import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Menu, User, LogOut, Star, Archive, Mail, Link2, FolderOpen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/api/supabaseClient";
import { useToast } from "@/components/ui/use-toast";
import { getAccountTypeStyle } from "@/lib/accountTypeStyle";
import SettingsPanel from "@/components/showpilot/SettingsPanel";

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

  const accountStyle = getAccountTypeStyle(prefs.account_type);
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
      const { data: updated, error: saveError } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, profile_photo_url: urlData.publicUrl }, { onConflict: "user_id" })
        .select()
        .single();
      if (saveError) throw saveError;
      onPreferencesUpdate?.(updated);
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
      <SheetContent side="left" className="w-80 bg-[#0d0d0d] border-[#1f1f1f] p-0 overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SettingsPanel
          prefs={prefs} setPrefs={setPrefs} user={user} accountStyle={accountStyle} onPhoto={handlePhotoUpload}
          navItems={[
            { icon: Link2, label: "Linked", color: "#F472B6", onClick: () => { setOpen(false); navigate("/linked"); } },
            { icon: Archive, label: "Archived Shows", color: "#8CFF3D", onClick: () => { setOpen(false); navigate("/archived"); } },
            { icon: Mail, label: "Manage Links", color: "#60A5FA", onClick: () => { setOpen(false); navigate("/manager-links"); } },
            { icon: FolderOpen, label: "My Templates", sub: "Save venue and artist info to reuse on repeat shows", color: "#FB923C", onClick: () => { setOpen(false); navigate("/my-templates"); } },
          ]}
          onSave={save} saving={saving}
          canRate={canRate} daysSinceRating={daysSinceRating} rating={rating} setRating={setRating}
          ratingComment={ratingComment} setRatingComment={setRatingComment} ratingSubmitting={ratingSubmitting} onSubmitRating={submitRating}
          onSignOut={handleLogout}
        />
      </SheetContent>
    </Sheet>
  );
}
