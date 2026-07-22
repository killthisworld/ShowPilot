import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { User, Mail, Phone, Briefcase, Check, Star, LogOut, Users, Trash2, RotateCw, Share2 } from "lucide-react";
import BottomTabs from "@/components/showpilot/BottomTabs";
import ColorPicker from "@/components/showpilot/ColorPicker";
import ImageCropModal from "@/components/showpilot/ImageCropModal";
import Soundwave from "@/components/showpilot/Soundwave";
import { usePreferences } from "@/hooks/usePreferences";

const SOUNDWAVE_TEMPLATES = {
  black: { bg: "#000000", wave: "#FFFFFF", label: "Black / White" },
  white: { bg: "#FFFFFF", wave: "#000000", label: "White / Black" },
  green: { bg: "#8CFF3D", wave: "#000000", label: "Green / Black" },
};

const TABS = [
  { id: "pilot", label: "My Pilot" },
  { id: "fellow", label: "Fellow Pilots" },
  { id: "settings", label: "Settings" },
];

export default function Cockpit() {
  const { preferences, reload } = usePreferences();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("pilot");
  const [draft, setDraft] = useState(null);
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [fellowPilots, setFellowPilots] = useState([]);
  const [loadingFellows, setLoadingFellows] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [savedToast, setSavedToast] = useState("");
  const [showBack, setShowBack] = useState(false);
  const photoInputRef = useRef(null);
  const bgInputRef = useRef(null);
  const [cropFile, setCropFile] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);

  const showPill = (msg) => {
    setSavedToast(msg);
    setTimeout(() => setSavedToast(""), 1000);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  useEffect(() => {
    if (preferences) setDraft(preferences);
  }, [preferences]);

  useEffect(() => {
    if (activeTab === "fellow" && user) {
      setLoadingFellows(true);
      supabase
        .from("fellow_pilots")
        .select("*")
        .eq("owner_id", user.id)
        .order("saved_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) console.error(error);
          else setFellowPilots(data || []);
          setLoadingFellows(false);
        });
    }
  }, [activeTab, user]);

  const update = (field, val) => setDraft((d) => ({ ...d, [field]: val }));

  const savePilotCard = async () => {
    if (!user || !draft) return;
    setSaving(true);
    try {
      const { id, ...rest } = draft;
      if (!rest.username) rest.username = null;
      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, ...rest }, { onConflict: "user_id" });
      if (error) throw error;
      await reload();
      showPill("Pilot card saved ✓");
    } catch (e) {
      console.error(e);
      showPill("Error saving");
    }
    setSaving(false);
  };

  const handleFileSelected = (e, target) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    setCropTarget(target);
    e.target.value = "";
  };

  const handleCropped = async (blob) => {
    const target = cropTarget;
    setCropFile(null);
    setCropTarget(null);
    if (!user) return;
    const bucket = target === "photo" ? "profile-photos" : "card-backgrounds";
    const field = target === "photo" ? "profile_photo_url" : "card_bg_image_url";
    try {
      const filePath = `${user.id}/${Date.now()}_cropped.jpg`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      update(field, urlData.publicUrl);
    } catch (e) {
      console.error(e);
      showPill(target === "photo" ? "Error uploading photo" : "Error uploading background");
    }
  };

  const handleShareId = async () => {
    if (!draft?.card_share_token) return;
    const url = `${window.location.origin}/pilot/${draft.card_share_token}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${draft.display_name || "My"} Pilot ID`, url });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    navigator.clipboard.writeText(url).catch(() => {});
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  };

  const removeFellowPilot = async (id) => {
    const { error } = await supabase.from("fellow_pilots").delete().eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    setFellowPilots((prev) => prev.filter((p) => p.id !== id));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const lastRatingDate = draft?.last_rating_date ? new Date(draft.last_rating_date) : null;
  const daysSinceRating = lastRatingDate ? (Date.now() - lastRatingDate.getTime()) / (1000 * 60 * 60 * 24) : 999;
  const canRate = daysSinceRating >= 30;

  const submitRating = async () => {
    if (!user || !draft) return;
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
      const { id, ...rest } = draft;
      if (!rest.username) rest.username = null;
      const { data: updated, error: prefsError } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, ...rest, last_rating_date: now }, { onConflict: "user_id" })
        .select()
        .single();
      if (prefsError) throw prefsError;

      setDraft(updated);
      setRating(0);
      setRatingComment("");
      showPill("Thanks for your feedback! ⭐");
    } catch (e) {
      console.error(e);
      showPill("Error saving feedback");
    }
    setRatingSubmitting(false);
  };

  if (!draft) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  const textColor = draft.card_text_color || "#FFFFFF";

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      {savedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#8CFF3D] text-black text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          {savedToast}
        </div>
      )}
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex gap-1 px-4 pt-4 pb-3 max-w-lg mx-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === t.id ? "bg-[#8CFF3D] text-black" : "bg-[#161616] text-white/40"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">
        {activeTab === "pilot" && (
          <>
            {showBack ? (
              <div
                onClick={() => draft.card_share_token && navigate(`/pilot/${draft.card_share_token}/history`)}
                className="w-full rounded-3xl overflow-hidden shadow-xl border border-[#222] aspect-[16/10] flex items-center justify-center cursor-pointer p-8"
                style={{ backgroundColor: (SOUNDWAVE_TEMPLATES[draft.soundwave_template] || SOUNDWAVE_TEMPLATES.black).bg }}
                title="View work history"
              >
                <Soundwave
                  seed={user?.id || "pilot"}
                  color={(SOUNDWAVE_TEMPLATES[draft.soundwave_template] || SOUNDWAVE_TEMPLATES.black).wave}
                />
              </div>
            ) : (
              <div
                onClick={() => bgInputRef.current?.click()}
                className="w-full rounded-3xl overflow-hidden shadow-xl border border-[#222] aspect-[16/10] relative flex flex-col justify-end p-6 cursor-pointer"
                style={{
                  backgroundColor: draft.card_bg_color || "#111111",
                  backgroundImage: draft.card_bg_image_url ? `url(${draft.card_bg_image_url})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                {draft.card_bg_image_url && (
                  <button
                    onClick={(e) => { e.stopPropagation(); update("card_bg_image_url", ""); }}
                    className="absolute top-3 right-3 z-20 w-6 h-6 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 flex items-center justify-center text-xs"
                    title="Remove background image, use solid color"
                  >
                    ✕
                  </button>
                )}
                <div className="relative z-10 flex items-center gap-3 mb-3">
                  <div
                    onClick={(e) => { e.stopPropagation(); photoInputRef.current?.click(); }}
                    className="w-14 h-14 rounded-full bg-white/10 border-2 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                    style={{ borderColor: textColor }}
                  >
                    {draft.profile_photo_url ? (
                      <img src={draft.profile_photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6" style={{ color: textColor }} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-lg truncate" style={{ color: textColor }}>{draft.display_name || "Your Name"}</p>
                    {draft.job_title && (
                      <p className="text-sm opacity-80 truncate flex items-center gap-1" style={{ color: textColor }}>
                        <Briefcase className="w-3 h-3 shrink-0" /> {draft.job_title}
                      </p>
                    )}
                  </div>
                </div>
                <div className="relative z-10 space-y-1">
                  {draft.contact_email && (
                    <p className="text-xs flex items-center gap-1.5 opacity-90" style={{ color: textColor }}>
                      <Mail className="w-3 h-3 shrink-0" /> {draft.contact_email}
                    </p>
                  )}
                  {draft.contact_phone && (
                    <p className="text-xs flex items-center gap-1.5 opacity-90" style={{ color: textColor }}>
                      <Phone className="w-3 h-3 shrink-0" /> {draft.contact_phone}
                    </p>
                  )}
                </div>
              </div>
            )}
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelected(e, "photo")} />
            <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelected(e, "background")} />

            <Button onClick={() => setShowBack(!showBack)} variant="outline" size="sm" className="w-full border-[#2a2a2a] text-white/60 hover:bg-[#161616]">
              <RotateCw className="w-3.5 h-3.5 mr-2" /> Flip Card
            </Button>

            <Button
              onClick={handleShareId}
              className={`w-full transition-colors ${shareCopied ? "bg-[#8CFF3D] text-black hover:bg-[#7ae62e]" : "bg-transparent border border-[#2a2a2a] text-white hover:bg-[#161616]"}`}
            >
              {shareCopied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
              {shareCopied ? "Link Copied!" : "Share ID"}
            </Button>

            {showBack ? (
              <div className="bg-[#161616] rounded-2xl border border-[#222] p-4 space-y-3">
                <Label className="text-white/50 text-xs block mb-1">Soundwave Style</Label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(SOUNDWAVE_TEMPLATES).map(([key, tpl]) => (
                    <button
                      key={key}
                      onClick={() => update("soundwave_template", key)}
                      className={`rounded-xl border-2 overflow-hidden aspect-[4/3] flex items-center justify-center p-2 transition-all ${draft.soundwave_template === key || (!draft.soundwave_template && key === "black") ? "border-[#8CFF3D]" : "border-[#2a2a2a]"}`}
                      style={{ backgroundColor: tpl.bg }}
                    >
                      <Soundwave seed={user?.id || "pilot"} color={tpl.wave} bars={16} />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/30 pt-1">Tap the soundwave to view your work history, grouped by state and city.</p>
              </div>
            ) : (
              <div className="bg-[#161616] rounded-2xl border border-[#222] p-4 space-y-3">
                <div>
                  <Label className="text-white/50 text-xs">Display Name</Label>
                  <Input value={draft.display_name || ""} onChange={(e) => update("display_name", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
                </div>
                <div>
                  <Label className="text-white/50 text-xs">Job Title</Label>
                  <Input value={draft.job_title || ""} onChange={(e) => update("job_title", e.target.value)} placeholder="e.g. FOH Engineer" className="mt-1 bg-[#111] border-[#222] text-white" />
                </div>
                <div>
                  <Label className="text-white/50 text-xs">Contact Email</Label>
                  <Input value={draft.contact_email || ""} onChange={(e) => update("contact_email", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
                </div>
                <div>
                  <Label className="text-white/50 text-xs">Contact Phone</Label>
                  <Input value={draft.contact_phone || ""} onChange={(e) => update("contact_phone", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
                </div>
                <div className="flex items-center gap-2">
                  <ColorPicker value={draft.card_bg_color || "#111111"} onChange={(c) => update("card_bg_color", c)} label="Background" />
                </div>
                <div className="flex items-center gap-2">
                  <ColorPicker value={draft.card_text_color || "#FFFFFF"} onChange={(c) => update("card_text_color", c)} label="Text Color" />
                </div>
              </div>
            )}

            <Button onClick={savePilotCard} disabled={saving} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e]">
              {saving ? "Saving..." : "Save Pilot Card"}
            </Button>
          </>
        )}

        {activeTab === "fellow" && (
          <div className="space-y-3">
            {loadingFellows ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
              </div>
            ) : fellowPilots.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-10 h-10 text-white/15 mx-auto mb-3" />
                <p className="text-white/40 text-sm">No fellow pilots saved yet</p>
                <p className="text-white/25 text-xs mt-1">Save someone's Pilot ID when they share it with you</p>
              </div>
            ) : (
              fellowPilots.map((p) => (
                <div key={p.id} className="bg-[#161616] rounded-2xl border border-[#222] p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#222] flex items-center justify-center overflow-hidden shrink-0 border-2" style={{ borderColor: p.card_text_color || "#8CFF3D" }}>
                    {p.profile_photo_url ? (
                      <img src={p.profile_photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-white/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{p.display_name || "Pilot"}</p>
                    {p.job_title && <p className="text-white/40 text-xs truncate">{p.job_title}</p>}
                    {p.contact_email && <p className="text-white/30 text-xs truncate">{p.contact_email}</p>}
                  </div>
                  <button onClick={() => removeFellowPilot(p.id)} className="p-1.5 text-white/20 hover:text-red-400 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-4">
            <div className="bg-[#161616] rounded-2xl border border-[#222] p-4 space-y-4">
              <div>
                <Label className="text-white/50 text-xs">Username</Label>
                <Input value={draft.username || ""} onChange={(e) => update("username", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">Email</Label>
                <Input value={user?.email || ""} readOnly className="mt-1 bg-[#111] border-[#222] text-white/50" />
              </div>
              <Button onClick={savePilotCard} disabled={saving} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e]">
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>

            <div className="bg-[#161616] rounded-2xl border border-[#222] p-4">
              <Label className="text-white/50 text-xs block mb-2">Rate ShowPilot</Label>
              {canRate ? (
                <>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setRating(star)} className="transition-transform hover:scale-110">
                        <Star className="w-6 h-6" fill={star <= rating ? "#8CFF3D" : "none"} stroke={star <= rating ? "#8CFF3D" : "#555"} />
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="Any feedback or comments..."
                    className="bg-[#111] border-[#222] text-white text-sm min-h-[70px] resize-none"
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
                  Thanks for your feedback! You can rate again in {Math.ceil(30 - daysSinceRating)} day{Math.ceil(30 - daysSinceRating) !== 1 ? "s" : ""}.
                </p>
              )}
            </div>

            <Button onClick={handleLogout} variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full justify-start">
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        )}
      </div>

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          shape={cropTarget === "photo" ? "circle" : "rect"}
          aspectW={cropTarget === "photo" ? 1 : 16}
          aspectH={cropTarget === "photo" ? 1 : 10}
          onCancel={() => { setCropFile(null); setCropTarget(null); }}
          onCropped={handleCropped}
        />
      )}

      <BottomTabs />
    </div>
  );
}
