import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Mail, Phone, Briefcase, Check, Star, LogOut, Users, Trash2, RotateCw, Share2, Archive, Wallet, Plus, Music, Building2, MapPin, CalendarDays, Pencil, ArrowLeft, Upload, X } from "lucide-react";
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

const WALLET_ICONS = {
  wallet: Wallet,
  music: Music,
  briefcase: Briefcase,
  building: Building2,
  "map-pin": MapPin,
  star: Star,
  users: Users,
  calendar: CalendarDays,
};

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming","District of Columbia",
];

const TABS = [
  { id: "pilot", label: "My Pilot" },
  { id: "fellow", label: "Fellow Pilots" },
  { id: "settings", label: "Settings" },
];

const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

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
  const walletIconInputRef = useRef(null);
  const [cropFile, setCropFile] = useState(null);
  const [cropTarget, setCropTarget] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [activeWalletId, setActiveWalletId] = useState(null);
  const [openWalletId, setOpenWalletId] = useState(null);
  const [walletView, setWalletView] = useState("all");
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [editingWalletId, setEditingWalletId] = useState(null);
  const [walletForm, setWalletForm] = useState({ name: "", color: "#8CFF3D", icon: "wallet", icon_image_url: "", city: "", state: "" });
  const [savingWallet, setSavingWallet] = useState(false);
  const [showAddIdModal, setShowAddIdModal] = useState(false);
  const [addIdLink, setAddIdLink] = useState("");
  const [addIdError, setAddIdError] = useState("");
  const [savingId, setSavingId] = useState(false);

  const frontDrag = useRef({ dragging: false, startX: 0, moved: false });
  const [frontOffset, setFrontOffset] = useState(0);

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
      Promise.all([
        supabase.from("fellow_pilots").select("*").eq("owner_id", user.id).order("saved_at", { ascending: false }),
        supabase.from("wallets").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }),
      ]).then(([fellowsRes, walletsRes]) => {
        if (fellowsRes.error) console.error(fellowsRes.error);
        else setFellowPilots(fellowsRes.data || []);
        if (walletsRes.error) console.error(walletsRes.error);
        else setWallets(walletsRes.data || []);
        setLoadingFellows(false);
      });
    }
  }, [activeTab, user]);

  // Scrolling past an expanded wallet returns to the main stacked view,
  // similar to Apple Wallet's scroll-to-deselect behavior.
  useEffect(() => {
    if (!activeWalletId) return;
    const handleScroll = () => setActiveWalletId(null);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeWalletId]);

  const openCreateWalletModal = () => {
    setEditingWalletId(null);
    setWalletForm({ name: "", color: "#8CFF3D", icon: "wallet", icon_image_url: "", city: "", state: "" });
    setShowWalletModal(true);
  };

  const openEditWalletModal = (w) => {
    setEditingWalletId(w.id);
    setWalletForm({ name: w.name, color: w.color, icon: w.icon || "wallet", icon_image_url: w.icon_image_url || "", city: w.city || "", state: w.state || "" });
    setShowWalletModal(true);
  };

  const saveWallet = async () => {
    if (!user || !walletForm.name.trim()) return;
    setSavingWallet(true);
    try {
      const payload = {
        name: walletForm.name.trim(),
        color: walletForm.color,
        icon: walletForm.icon,
        icon_image_url: walletForm.icon_image_url || null,
        city: walletForm.city || null,
        state: walletForm.state || null,
      };
      if (editingWalletId) {
        const { data, error } = await supabase.from("wallets").update(payload).eq("id", editingWalletId).select().single();
        if (error) throw error;
        setWallets((prev) => prev.map((w) => (w.id === editingWalletId ? data : w)));
      } else {
        const { data, error } = await supabase.from("wallets").insert({ owner_id: user.id, ...payload }).select().single();
        if (error) throw error;
        setWallets((prev) => [data, ...prev]);
        setActiveWalletId(data.id);
      }
      setShowWalletModal(false);
    } catch (e) {
      console.error(e);
      showPill("Error saving wallet");
    }
    setSavingWallet(false);
  };

  const toggleStarWallet = async (w) => {
    const newVal = !w.starred;
    setWallets((prev) => prev.map((x) => (x.id === w.id ? { ...x, starred: newVal } : x)));
    const { error } = await supabase.from("wallets").update({ starred: newVal }).eq("id", w.id);
    if (error) console.error(error);
  };

  const visibleWallets = walletView === "starred" ? wallets.filter((w) => w.starred) : wallets;

  const stackedWallets = (() => {
    let top = 0;
    return visibleWallets.map((w, i) => {
      const isActive = w.id === activeWalletId;
      const item = { ...w, top, isActive, z: isActive ? 999 : visibleWallets.length - i };
      top += isActive ? 152 : 26;
      return item;
    });
  })();
  const stackHeight = stackedWallets.length ? stackedWallets[stackedWallets.length - 1].top + (stackedWallets[stackedWallets.length - 1].isActive ? 140 : 56) : 0;

  const onFrontPointerDown = (e) => {
    frontDrag.current.dragging = true;
    frontDrag.current.startX = e.clientX;
    frontDrag.current.moved = false;
  };
  const onFrontPointerMove = (e) => {
    if (!frontDrag.current.dragging) return;
    const delta = e.clientX - frontDrag.current.startX;
    if (Math.abs(delta) > 5) frontDrag.current.moved = true;
    setFrontOffset(Math.min(0, delta));
  };
  const onFrontPointerUp = (w) => {
    frontDrag.current.dragging = false;
    if (frontOffset < -70) {
      setOpenWalletId(w.id);
    } else if (!frontDrag.current.moved) {
      setActiveWalletId(null);
    }
    setFrontOffset(0);
  };

  const openedWallet = wallets.find((w) => w.id === openWalletId);
  const openedWalletPilots = openWalletId ? fellowPilots.filter((p) => p.wallet_id === openWalletId) : [];

  const openAddIdModal = () => {
    setAddIdLink("");
    setAddIdError("");
    setShowAddIdModal(true);
  };

  const addIdFromLink = async () => {
    if (!user || !openWalletId || !addIdLink.trim()) return;
    setSavingId(true);
    setAddIdError("");
    try {
      let token = addIdLink.trim();
      const match = token.match(/\/pilot\/([a-zA-Z0-9-]+)/);
      if (match) token = match[1];

      const { data: cardRows, error: cardError } = await supabase.rpc("get_pilot_card_by_token", { p_token: token });
      if (cardError || !cardRows || cardRows.length === 0) {
        setAddIdError("Couldn't find a Pilot ID at that link.");
        setSavingId(false);
        return;
      }
      const card = cardRows[0];

      const { data, error } = await supabase
        .from("fellow_pilots")
        .insert({
          owner_id: user.id,
          pilot_user_id: card.user_id,
          wallet_id: openWalletId,
          display_name: card.display_name,
          job_title: card.job_title,
          contact_email: card.contact_email,
          contact_phone: card.contact_phone,
          profile_photo_url: card.profile_photo_url,
          card_bg_color: card.card_bg_color,
          card_bg_image_url: card.card_bg_image_url,
          card_text_color: card.card_text_color,
        })
        .select()
        .single();
      if (error) throw error;
      setFellowPilots((prev) => [data, ...prev]);
      setShowAddIdModal(false);
    } catch (e) {
      console.error(e);
      showPill("Error adding ID");
    }
    setSavingId(false);
  };

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

    if (target === "wallet-icon") {
      try {
        const filePath = `${user.id}/${Date.now()}_wallet_icon.jpg`;
        const { error: uploadError } = await supabase.storage.from("wallet-icons").upload(filePath, blob, { contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("wallet-icons").getPublicUrl(filePath);
        setWalletForm((f) => ({ ...f, icon_image_url: urlData.publicUrl }));
      } catch (e) {
        console.error(e);
        showPill("Error uploading icon");
      }
      return;
    }

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
                <div className="w-2/3 max-w-[220px] h-14">
                  <Soundwave
                    seed={user?.id || "pilot"}
                    color={(SOUNDWAVE_TEMPLATES[draft.soundwave_template] || SOUNDWAVE_TEMPLATES.black).wave}
                  />
                </div>
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

            <Button onClick={() => setShowBack(!showBack)} variant="outline" size="sm" className="w-full border-[#8CFF3D]/30 text-[#8CFF3D]/80 hover:bg-[#8CFF3D]/10 hover:text-[#8CFF3D]">
              <RotateCw className="w-3.5 h-3.5 mr-2" /> Flip Card
            </Button>

            <Button
              onClick={handleShareId}
              className={`w-full transition-colors ${shareCopied ? "bg-[#8CFF3D] text-black hover:bg-[#7ae62e]" : "bg-transparent border border-[#8CFF3D]/30 text-[#8CFF3D]/80 hover:bg-[#8CFF3D]/10 hover:text-[#8CFF3D]"}`}
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
                  <Input value={draft.contact_phone || ""} onChange={(e) => update("contact_phone", formatPhoneNumber(e.target.value))} className="mt-1 bg-[#111] border-[#222] text-white" />
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
          openWalletId ? (
            <div className="animate-in slide-in-from-right duration-300">
              <button onClick={() => setOpenWalletId(null)} className="flex items-center gap-2 text-white/60 hover:text-white text-sm mb-4">
                <ArrowLeft className="w-4 h-4" /> Back to Wallets
              </button>
              {openedWallet && (
                <div className="flex items-center gap-3 mb-4 rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${openedWallet.color}, ${openedWallet.color}bb)` }}>
                  {openedWallet.icon_image_url ? (
                    <img src={openedWallet.icon_image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-black/10 shrink-0" />
                  ) : (
                    (() => { const Icon = WALLET_ICONS[openedWallet.icon] || Wallet; return <Icon className="w-6 h-6 text-black shrink-0" />; })()
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-black font-bold text-lg truncate">{openedWallet.name}</p>
                    {(openedWallet.city || openedWallet.state) && (
                      <p className="text-black/70 text-xs truncate">{[openedWallet.city, openedWallet.state].filter(Boolean).join(", ")}</p>
                    )}
                    <p className="text-black/60 text-xs">{openedWalletPilots.length} ID{openedWalletPilots.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              )}

              <Button onClick={openAddIdModal} variant="outline" className="w-full border-[#8CFF3D]/30 text-[#8CFF3D]/80 hover:bg-[#8CFF3D]/10 hover:text-[#8CFF3D] mb-3">
                <Plus className="w-4 h-4 mr-2" /> Add ID
              </Button>

              {openedWalletPilots.length === 0 ? (
                <p className="text-center text-white/40 py-16 text-sm">No pilots saved in this wallet yet</p>
              ) : (
                <div className="space-y-3">
                  {openedWalletPilots.map((p) => (
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
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1 bg-[#111] rounded-lg p-1">
                  <button onClick={() => setWalletView("all")} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${walletView === "all" ? "bg-[#8CFF3D] text-black" : "text-white/40 hover:text-white/60"}`}>
                    All
                  </button>
                  <button onClick={() => setWalletView("starred")} className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-1 ${walletView === "starred" ? "bg-[#8CFF3D] text-black" : "text-white/40 hover:text-white/60"}`}>
                    <Star className="w-3 h-3" fill={walletView === "starred" ? "currentColor" : "none"} /> Starred
                  </button>
                </div>
                <button onClick={openCreateWalletModal} className="w-9 h-9 rounded-full bg-[#8CFF3D]/15 text-[#8CFF3D] flex items-center justify-center hover:bg-[#8CFF3D]/25 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {loadingFellows ? (
                <div className="flex justify-center py-20">
                  <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
                </div>
              ) : stackedWallets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <Wallet className="w-10 h-10 text-white/15 mb-3" />
                  <p className="text-white/40 text-sm mb-4">{walletView === "starred" ? "No starred wallets" : "No wallets yet"}</p>
                  {walletView === "all" && (
                    <Button onClick={openCreateWalletModal} className="bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold rounded-full px-6">
                      <Plus className="w-4 h-4 mr-2" /> New Wallet
                    </Button>
                  )}
                </div>
              ) : (
                <div className="relative" style={{ height: stackHeight }}>
                  {stackedWallets.map((w) => {
                    const Icon = WALLET_ICONS[w.icon] || Wallet;
                    const idCount = fellowPilots.filter((p) => p.wallet_id === w.id).length;

                    if (w.isActive) {
                      return (
                        <div
                          key={w.id}
                          onPointerDown={onFrontPointerDown}
                          onPointerMove={onFrontPointerMove}
                          onPointerUp={() => onFrontPointerUp(w)}
                          onPointerLeave={() => onFrontPointerUp(w)}
                          className="absolute left-0 right-0 rounded-2xl px-5 py-4 cursor-pointer overflow-hidden select-none"
                          style={{
                            top: w.top,
                            zIndex: w.z,
                            height: 140,
                            background: `linear-gradient(135deg, ${w.color}, ${w.color}bb)`,
                            transform: `translateX(${frontOffset}px)`,
                            transition: frontDrag.current.dragging ? "none" : "transform 0.25s ease-out, top 0.3s",
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 24px rgba(0,0,0,0.45)",
                          }}
                        >
                          <div className="absolute top-[42px] left-0 right-0 h-px bg-black/10" />
                          <div className="relative z-10 flex items-start justify-between">
                            {w.icon_image_url ? (
                              <img src={w.icon_image_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-black/10" />
                            ) : (
                              <Icon className="w-7 h-7 text-black" />
                            )}
                            <div className="flex items-center gap-1">
                              <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onPointerUp={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); openEditWalletModal(w); }}
                                className="p-1 text-black/50 hover:text-black"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onPointerUp={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); toggleStarWallet(w); }}
                                className="p-1 text-black/50 hover:text-black"
                              >
                                <Star className="w-4 h-4" fill={w.starred ? "#000" : "none"} />
                              </button>
                            </div>
                          </div>
                          <p className="relative z-10 text-black font-bold text-lg mt-2 truncate">{w.name}</p>
                          {(w.city || w.state) && <p className="relative z-10 text-black/70 text-xs truncate">{[w.city, w.state].filter(Boolean).join(", ")}</p>}
                          <p className="relative z-10 text-black/60 text-xs mt-1">{idCount} ID{idCount !== 1 ? "s" : ""}</p>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={w.id}
                        onClick={() => setActiveWalletId(w.id)}
                        className="absolute left-0 right-0 rounded-2xl px-4 pb-1.5 flex items-end cursor-pointer transition-all duration-300 overflow-hidden border-t"
                        style={{
                          top: w.top,
                          zIndex: w.z,
                          height: 56,
                          background: `linear-gradient(135deg, ${w.color}, ${w.color}cc)`,
                          borderTopColor: "rgba(255,255,255,0.25)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                        }}
                      >
                        <span className="text-black font-semibold text-sm truncate">{w.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )
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

            <Button onClick={() => navigate("/archived")} variant="outline" className="w-full border-[#8CFF3D]/30 text-[#8CFF3D]/80 hover:bg-[#8CFF3D]/10 hover:text-[#8CFF3D] justify-start">
              <Archive className="w-4 h-4 mr-2" /> Archived Shows
            </Button>

            <Button onClick={handleLogout} variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full justify-start">
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        )}
      </div>

      {showWalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowWalletModal(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-base mb-4">{editingWalletId ? "Edit Wallet" : "New Wallet"}</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-white/50 text-xs">Name</Label>
                <Input value={walletForm.name} onChange={(e) => setWalletForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Coachella" className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
              <div>
                <Label className="text-white/50 text-xs mb-2 block">Icon</Label>
                {walletForm.icon_image_url ? (
                  <div className="flex items-center gap-3">
                    <img src={walletForm.icon_image_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-[#2a2a2a]" />
                    <button onClick={() => setWalletForm((f) => ({ ...f, icon_image_url: "" }))} className="text-xs text-red-400 hover:underline flex items-center gap-1">
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-2">
                    {Object.entries(WALLET_ICONS).map(([key, Icon]) => (
                      <button
                        key={key}
                        onClick={() => setWalletForm((f) => ({ ...f, icon: key }))}
                        className={`aspect-square rounded-xl flex items-center justify-center border-2 transition-all ${walletForm.icon === key ? "border-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#2a2a2a] bg-[#111]"}`}
                      >
                        <Icon className={`w-5 h-5 ${walletForm.icon === key ? "text-[#8CFF3D]" : "text-white/40"}`} />
                      </button>
                    ))}
                    <button
                      onClick={() => walletIconInputRef.current?.click()}
                      className="aspect-square rounded-xl flex items-center justify-center border-2 border-dashed border-[#2a2a2a] hover:border-[#8CFF3D]/40 text-white/30 hover:text-[#8CFF3D]"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <input ref={walletIconInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelected(e, "wallet-icon")} />
              </div>
              <div className="flex items-center gap-2">
                <ColorPicker value={walletForm.color} onChange={(c) => setWalletForm((f) => ({ ...f, color: c }))} label="Color" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-white/50 text-xs">City</Label>
                  <Input value={walletForm.city} onChange={(e) => setWalletForm((f) => ({ ...f, city: e.target.value }))} className="mt-1 bg-[#111] border-[#222] text-white" />
                </div>
                <div>
                  <Label className="text-white/50 text-xs">State</Label>
                  <Select value={walletForm.state} onValueChange={(v) => setWalletForm((f) => ({ ...f, state: v }))}>
                    <SelectTrigger className="mt-1 h-10 bg-[#111] border-[#222] text-white">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a] max-h-64">
                      {US_STATES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowWalletModal(false)} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
                Cancel
              </Button>
              <Button onClick={saveWallet} disabled={savingWallet || !walletForm.name.trim()} className="flex-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold">
                {savingWallet ? "Saving..." : editingWalletId ? "Save Changes" : "Create Wallet"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showAddIdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowAddIdModal(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-base mb-2">Add ID</h3>
            <p className="text-white/40 text-xs mb-3">Paste the Pilot ID link they shared with you.</p>
            <Input
              value={addIdLink}
              onChange={(e) => setAddIdLink(e.target.value)}
              placeholder="https://show-pilot.vercel.app/pilot/..."
              className="bg-[#111] border-[#222] text-white"
            />
            {addIdError && <p className="text-red-400 text-xs mt-2">{addIdError}</p>}
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAddIdModal(false)} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
                Cancel
              </Button>
              <Button onClick={addIdFromLink} disabled={savingId || !addIdLink.trim()} className="flex-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold">
                {savingId ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {cropFile && (
        <ImageCropModal
          file={cropFile}
          shape={cropTarget === "background" ? "rect" : "circle"}
          aspectW={cropTarget === "background" ? 16 : 1}
          aspectH={cropTarget === "background" ? 10 : 1}
          onCancel={() => { setCropFile(null); setCropTarget(null); }}
          onCropped={handleCropped}
        />
      )}

      <BottomTabs />
    </div>
  );
}
