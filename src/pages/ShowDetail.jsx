import React, { useState, useEffect, useCallback, useRef } from "react";
import SubmittedBy from "@/components/showpilot/SubmittedBy";
import { eventTitle } from "@/lib/eventTitle";
import { createPortal } from "react-dom";
import { usePersistedState, clearPersistedState } from "@/hooks/usePersistedState";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useGoBack } from "@/lib/navHistory";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Trash2, Plus, Mail, ImageIcon, StickyNote, Info, Music, Star, Paperclip, FileText, X, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Settings, Building, Mic2, Check, Pencil } from "lucide-react";
import InviteSheet from "@/components/showpilot/InviteSheet";
import FanPageSheet from "@/components/showpilot/FanPageSheet";
import { isDesktopNow } from "@/lib/showRoute";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import ColorPicker from "@/components/showpilot/ColorPicker";
import CollapsibleSection from "@/components/showpilot/CollapsibleSection";
import useIsDesktop from "@/hooks/useIsDesktop";
import BottomTabs from "@/components/showpilot/BottomTabs";
import StatusBadge from "@/components/showpilot/StatusBadge";
import LoadTemplateButton from "@/components/showpilot/LoadTemplateButton";
import VenueInfoFields from "@/components/showpilot/VenueInfoFields";
import PerformerFields from "@/components/showpilot/PerformerFields";
import { venueFromTemplate, artistFromTemplate } from "@/lib/showTemplates";
import { usePreferences } from "@/hooks/usePreferences";
import { buildEventTypeOptions, addCustomEventType as addTypeToList, removeEventType } from "@/lib/eventTypes";
import EventTypeIcon from "@/components/showpilot/EventTypeIcon";
import { FAN_RSVP_OPEN } from "@/lib/hiddenProfiles";



const ROLE_COLORS = {
  Headliner: { border: "border-blue-400/40", activeBorder: "border-blue-400", text: "text-blue-400", bg: "bg-blue-500/10" },
  Opener: { border: "border-[#8CFF3D]/40", activeBorder: "border-[#8CFF3D]", text: "text-[#8CFF3D]", bg: "bg-[#8CFF3D]/10" },
  "Performer/Group": { border: "border-purple-400/40", activeBorder: "border-purple-400", text: "text-purple-400", bg: "bg-purple-500/10" },
  "N/A": { border: "border-white/20", activeBorder: "border-white", text: "text-white", bg: "bg-white/15" },
};
const ROLE_OPTIONS = ["Opener", "Headliner", "Performer/Group", "N/A"];

const emptyBand = (role, sortOrder) => ({
  role,
  sort_order: sortOrder,
  band_name: "",
  genre_tag: "",
  genre_tags: [],
  genre_color: "",
  set_length_minutes: null,
  stage_plot_url: "",
  stage_plot_files: [],
  band_members: [],
  artist_fx_notes: [],
  general_notes: "",
});

// embeddedId: render inside another screen (the SHOW tab of the show's web,
// job 72) instead of as its own page: no page header or back button, a
// compact action row instead, and onSaved() after each save.
// actionSlot (job 135): a DOM node in the host's header; the action buttons
// (notes, star, invite, `beforeSave`, Save) render there instead of in a row.
// banner (job 156): a node (the tech phone's EventBanner) shown on top; tapping
// it opens / closes the event info block, which starts closed.
export default function ShowDetail({ embeddedId, onSaved, actionSlot = null, beforeSave = null, banner = null } = {}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const routeParams = useParams();
  const id = embeddedId || routeParams.id;
  const embedded = !!embeddedId;
  const navigate = useNavigate(); const goBack = useGoBack();
  const location = useLocation();
  const { preferences, reload: reloadPreferences } = usePreferences();
  const isDesktop = useIsDesktop();
  const isTechProductionAccount = !preferences?.account_type || preferences.account_type === "engineer" || preferences.account_type === "lighting";
  // Tech phones: no picture uploads in the Venue / Performer sections (job 148).
  const sectionPhotos = !(isTechProductionAccount && !isDesktop);
  // Tech phones (job 157): concerts first. New events start as Concert, and the
  // event name + picture are optional, tucked in at the top of Venue Info
  // (the banner falls back to the headliner and their / the venue's photo).
  const techPhone = isTechProductionAccount && !isDesktop;
  const [identityOpen, setIdentityOpen] = useState(false);
  const isNew = id === "new";
  const draftKey = `showdetail_draft_${isNew ? "new" : id}`;
  const hadDraftRef = useRef(null);
  const draftSavedAtRef = useRef(null);
  if (hadDraftRef.current === null) {
    // Computed synchronously on first render, before usePersistedState's
    // own effect (or anything else) has a chance to write to localStorage
    // and create a false-positive "draft exists" reading. draftSavedAtRef
    // captures the OLD save time too, before any effect touches it, so we
    // can later tell whether the database has changed more recently than
    // this draft (e.g. saved from another device) and treat it as stale.
    try {
      hadDraftRef.current = !!localStorage.getItem(`${draftKey}_show`);
      draftSavedAtRef.current = parseInt(localStorage.getItem(`${draftKey}_saved_at`) || "0", 10);
    } catch {
      hadDraftRef.current = false;
      draftSavedAtRef.current = 0;
    }
  }

  const backTo = location.state?.from === "calendar"
    ? (isTechProductionAccount ? "/calendar" : "/band/calendar")
    : "/";

  const emptyShow = {
    venue: "", date: location.state?.prefillDate || "", city: "", state: "", event_time: "",
    wifi_network: "", wifi_password: "", console: "",
    status: "not_started", starred: false, contacts: [],
    power_notes: "", share_token: "", venue_checklist: {},
    ...(techPhone ? { event_type: "Concert" } : {}),
  };

  const [show, setShow] = usePersistedState(`${draftKey}_show`, emptyShow);
  const [showFanPage, setShowFanPage] = useState(false);
  const [bands, setBands] = usePersistedState(`${draftKey}_bands`, [emptyBand("N/A", 0)]);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [activeBandIndex, setActiveBandIndex] = useState(0);
  const [orderDraft, setOrderDraft] = useState(null);

  useEffect(() => {
    setOrderDraft(null);
  }, [activeBandIndex]);

  useEffect(() => {
    if (isNew) return;
    try { localStorage.setItem(`${draftKey}_saved_at`, Date.now().toString()); } catch {}
  }, [show, bands, isNew, draftKey]);

  // If someone starts a brand-new event and navigates away without ever
  // successfully saving it, clear that draft on unmount so the next time
  // anyone taps "+" they get a genuinely blank form - not whatever was
  // abandoned last time. A successful save already clears this same draft
  // explicitly before this would ever run, so this only fires for the
  // "walked away without saving" case.
  useEffect(() => {
    return () => {
      if (isNew) {
        clearPersistedState(`${draftKey}_show`);
        clearPersistedState(`${draftKey}_bands`);
        try { localStorage.removeItem(`${draftKey}_saved_at`); } catch {}
      }
    };
  }, [isNew, draftKey]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const handleIconUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showPill("Image must be under 2 MB"); return; }
    setUploadingIcon(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) throw new Error("Not logged in");
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const filePath = `${u.id}/event-icons/${Date.now()}.${ext || "png"}`;
      const { error: upErr } = await supabase.storage.from("profile-photos").upload(filePath, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
      update("icon_url", urlData.publicUrl);
    } catch (err) {
      console.error(err);
      showPill("Couldn't upload that image");
    }
    setUploadingIcon(false);
  };
  const [shareCopied, setShareCopied] = useState(false);
  const [tmCopied, setTmCopied] = useState(false);
  const [savedToast, setSavedToast] = useState("");
  const [selectedArtistFx, setSelectedArtistFx] = useState("__general__");
  // FX / Artist Notes (job 167): "__show__" = General (whole show), or an act's index.
  const [fxTarget, setFxTarget] = useState("__show__");
  const [showGenreSettings, setShowGenreSettings] = useState(false);
  const [showBusSettings, setShowBusSettings] = useState(false);
  const [genreDraft, setGenreDraft] = useState([]);
  const [busDraft, setBusDraft] = useState({ IEM: "#EAB308", Monitor: "#F97316" });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [showEventTypeManager, setShowEventTypeManager] = useState(false);
  const mainCaptureRef = useRef(null);
  const venuePrintRef = useRef(null);
  const bandPrintRef = useRef(null);
  const [showFxModal, setShowFxModal] = useState(false);

  const activeBand = bands[activeBandIndex] || bands[0];

  const [submitterCard, setSubmitterCard] = useState(null);

  useEffect(() => {
    if (!isNew) {
      const hadDraft = hadDraftRef.current;

      Promise.all([
        supabase.from("shows").select("*").eq("id", id).single(),
        supabase.from("show_bands").select("*").eq("show_id", id).order("sort_order", { ascending: true }),
      ])
        .then(([showRes, bandsRes]) => {
          if (showRes.error || !showRes.data) {
            if (!embedded) navigate("/");
            return;
          }
          // Check both the gig's own updated_at AND the most recent
          // show_bands.updated_at - a new/edited act (e.g. an opener
          // submitting their intake form) only touches show_bands, not the
          // shows row itself, so relying on the gig's timestamp alone would
          // miss that kind of change and could show a stale cached draft
          // that's missing a newly-added act.
          const showUpdatedAt = showRes.data.updated_at ? new Date(showRes.data.updated_at).getTime() : 0;
          const bandsUpdatedAt = (bandsRes.data || []).reduce((max, b) => {
            const t = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return t > max ? t : max;
          }, 0);
          const dbUpdatedAt = Math.max(showUpdatedAt, bandsUpdatedAt);
          const draftIsStale = hadDraft && dbUpdatedAt > draftSavedAtRef.current;

          if (hadDraft && !draftIsStale) {
            // Unsaved local edits exist for this exact gig, and nothing
            // newer has been saved to the database since — keep the local
            // draft instead of overwriting it with the DB copy.
            setRestoredDraft(true);
            return;
          }
          // Either there was no draft, or the database has been updated
          // more recently than the draft (e.g. saved from another device) —
          // load fresh data below instead of the stale local draft.
          const [parsedCity, parsedState] = (showRes.data.location || "").split(",").map((s) => s.trim());
          // venue_photo_url: the venue's photo (kept in venue_info.photo_url, shared with the venue's section).
          setShow({ ...showRes.data, city: parsedCity || "", state: parsedState || "", venue_photo_url: showRes.data.venue_info?.photo_url || "", show_notes: showRes.data.engineer_info?.show_notes || "" });
          if (bandsRes.data && bandsRes.data.length > 0) {
            setBands(bandsRes.data);
          } else {
            setBands([{
              role: "N/A",
              sort_order: 0,
              band_name: showRes.data.band_name || "",
              genre_tag: showRes.data.genre_tag || "",
              genre_tags: showRes.data.genre_tags || [],
              genre_color: showRes.data.genre_color || "",
              stage_plot_url: showRes.data.stage_plot_url || "",
              stage_plot_files: showRes.data.stage_plot_files || [],
              band_members: showRes.data.band_members || [],
              artist_fx_notes: showRes.data.artist_fx_notes || [],
              general_notes: showRes.data.general_notes || "",
            }]);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => {
    const submitterId = bands[activeBandIndex]?.submitter_card_user_id;
    if (!submitterId) { setSubmitterCard(null); return; }
    supabase
      .from("user_preferences")
      .select("display_name, card_share_token")
      .eq("user_id", submitterId)
      .maybeSingle()
      .then(({ data }) => setSubmitterCard(data));
  }, [bands, activeBandIndex]);

  const update = (field, val) => setShow((s) => ({ ...s, [field]: val }));

  // The fan page is published from its own sheet; after it closes, re-read
  // whether it's live so the LIVE / OFF label here stays right.
  const closeFanPage = async () => {
    setShowFanPage(false);
    const { data } = await supabase.from("shows").select("fan_page_enabled").eq("id", id).single();
    if (data) setShow((s) => ({ ...s, fan_page_enabled: !!data.fan_page_enabled }));
  };

  const updateBandField = (field, val, idx = activeBandIndex) => {
    setBands((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  // Loads a saved venue/artist template (from My Templates) into this
  // show. A venue template fills the Venue Info section; an artist
  // template fills whichever act is currently selected in the Performer
  // section - both save the engineer re-typing info for a room or act
  // they've worked with before, whether or not that venue/artist has a
  // ShowPilot account of their own.
  const loadVenueTemplate = (name, data) => {
    setShow((s) => ({ ...s, ...venueFromTemplate(name, data, s) }));
  };
  const loadArtistTemplate = (name, data) => {
    setBands((prev) => {
      const next = [...prev];
      next[activeBandIndex] = { ...next[activeBandIndex], ...artistFromTemplate(name, data) };
      return next;
    });
  };

  const showPill = (msg) => {
    setSavedToast(msg);
    setTimeout(() => setSavedToast(""), 1000);
  };

  const exportPDF = async (ref, filename) => {
    const node = ref.current;
    if (!node) return;
    try {
      const canvas = await html2canvas(node, {
        backgroundColor: "#0d0d0d",
        scale: 2,
        onclone: (clonedDoc, clonedNode) => {
          const fields = clonedNode.querySelectorAll("input, textarea");
          fields.forEach((field) => {
            const computed = window.getComputedStyle(field);
            const replacement = clonedDoc.createElement("div");
            replacement.textContent = field.value || "";
            replacement.style.cssText = field.style.cssText;
            replacement.style.color = field.value ? computed.color : computed.getPropertyValue("color");
            replacement.style.fontSize = computed.fontSize;
            replacement.style.fontFamily = computed.fontFamily;
            replacement.style.fontWeight = computed.fontWeight;
            replacement.style.padding = computed.padding;
            replacement.style.border = computed.border;
            replacement.style.borderRadius = computed.borderRadius;
            replacement.style.backgroundColor = computed.backgroundColor;
            replacement.style.width = computed.width;
            replacement.style.height = computed.height;
            replacement.style.boxSizing = computed.boxSizing;
            replacement.style.display = "flex";
            replacement.style.alignItems = "center";
            field.parentNode.replaceChild(replacement, field);
          });
        },
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(filename);
    } catch (e) {
      console.error(e);
      showPill("Error creating PDF");
    }
  };

  const addOpener = () => {
    setBands((prev) => {
      const next = [...prev, emptyBand("N/A", prev.length)];
      setActiveBandIndex(next.length - 1);
      return next;
    });
  };

  const removeOpener = async (idx) => {
    const band = bands[idx];
    if (bands.length <= 1) return;
    if (!confirm(`Remove ${band.band_name || "this act"}?`)) return;

    if (band.id) {
      const { error } = await supabase.from("show_bands").delete().eq("id", band.id);
      if (error) {
        console.error(error);
        showPill("Error removing opener");
        return;
      }
    }
    setBands((prev) => prev.filter((_, i) => i !== idx));
    setActiveBandIndex(0);
  };

  const setOpenerPosition = async (idx, newPositionRaw) => {
    const band = bands[idx];
    const currentPos = bands.findIndex((b) => b === band);

    let newPosition = parseInt(newPositionRaw, 10);
    if (isNaN(newPosition)) return;
    newPosition = Math.max(1, Math.min(bands.length, newPosition));
    const newPos0 = newPosition - 1;
    if (newPos0 === currentPos) return;

    const reordered = [...bands];
    const [moved] = reordered.splice(currentPos, 1);
    reordered.splice(newPos0, 0, moved);
    const updatedBands = reordered.map((b, i) => ({ ...b, sort_order: i }));

    setBands(updatedBands);
    // The moved act stays selected (the rows are new objects, so match by position).
    setActiveBandIndex(newPos0);

    for (const b of updatedBands) {
      if (b.id) {
        await supabase.from("show_bands").update({ sort_order: b.sort_order }).eq("id", b.id);
      }
    }
  };

  const updateBandRole = (idx, role) => {
    setBands((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], role };
      return next;
    });
  };

  const headlinerIndex = bands.findIndex((b) => b.role === "Headliner");

  const handleSave = async () => {
    const headliner = bands[headlinerIndex] || bands[0];
    if (!show.date) {
      showPill("A date is required");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const sharedPayload = {
        venue: show.venue, location: [show.city, show.state].filter(Boolean).join(", "), event_time: show.event_time,
        wifi_network: show.wifi_network, wifi_password: show.wifi_password,
        console: show.console, status: show.status, starred: show.starred,
        contacts: show.contacts, power_notes: show.power_notes, date: show.date,
        ...(show.icon_url !== undefined ? { icon_url: show.icon_url } : {}),
        venue_checklist: show.venue_checklist, event_type: show.event_type, frequency_scope: show.frequency_scope, done: show.done, event_name: show.event_name,
        band_name: headliner.band_name, genre_tag: headliner.genre_tag,
        genre_tags: headliner.genre_tags, genre_color: headliner.genre_color,
        stage_plot_url: headliner.stage_plot_url, stage_plot_files: headliner.stage_plot_files,
        band_members: headliner.band_members, artist_fx_notes: headliner.artist_fx_notes,
        general_notes: headliner.general_notes,
      };
      if (show.share_token) sharedPayload.share_token = show.share_token;
      // Venue photo: merge into the latest venue_info (the venue company edits
      // the rest of it), only when the photo actually changed.
      const photo = show.venue_photo_url || "";
      if (isNew) {
        if (photo) sharedPayload.venue_info = { photo_url: photo };
      } else {
        const { data: cur } = await supabase.from("shows").select("venue_info").eq("id", id).maybeSingle();
        const vi = cur?.venue_info && typeof cur.venue_info === "object" ? cur.venue_info : {};
        if ((vi.photo_url || "") !== photo) {
          const { photo_url, ...rest } = vi;
          sharedPayload.venue_info = photo ? { ...rest, photo_url: photo } : rest;
        }
      }

      // General (whole-show) notes from FX / Artist Notes (job 167): kept in
      // engineer_info.show_notes, merged into the latest engineer_info.
      const showNotes = show.show_notes || "";
      if (isNew) {
        if (showNotes) sharedPayload.engineer_info = { show_notes: showNotes };
      } else {
        const { data: curEi } = await supabase.from("shows").select("engineer_info").eq("id", id).maybeSingle();
        const ei = curEi?.engineer_info && typeof curEi.engineer_info === "object" ? curEi.engineer_info : {};
        if ((ei.show_notes || "") !== showNotes) sharedPayload.engineer_info = { ...ei, show_notes: showNotes };
      }

      let showId = id;
      let createdToken = null;
      if (isNew) {
        const { data: created, error } = await supabase
          .from("shows")
          .insert({ ...sharedPayload, owner_id: user.id })
          .select()
          .single();
        if (error) throw error;
        showId = created.id;
        createdToken = created.share_token || null;
      } else {
        const { error } = await supabase.from("shows").update(sharedPayload).eq("id", id);
        if (error) throw error;
      }

      const updatedBands = [...bands];
      for (let i = 0; i < updatedBands.length; i++) {
        const b = updatedBands[i];
        const { id: bandId, ...bandData } = b;
        if (bandId) {
          const { error } = await supabase.from("show_bands").update(bandData).eq("id", bandId);
          if (error) throw error;
        } else {
          const { data: createdBand, error } = await supabase
            .from("show_bands")
            .insert({ ...bandData, show_id: showId })
            .select()
            .single();
          if (error) throw error;
          updatedBands[i] = createdBand;
        }
      }
      setBands(updatedBands);

      clearPersistedState(`${draftKey}_show`);
      clearPersistedState(`${draftKey}_bands`);
      try { localStorage.removeItem(`${draftKey}_saved_at`); } catch {}

      if (isNew) {
        showPill("Show created ✓");
        // Tech accounts work a show from its web (SHOW tab = this editor), job 72.
        if (isTechProductionAccount && createdToken && !isDesktopNow()) navigate(`/gig/web?token=${createdToken}`, { replace: true });
        else navigate(`/show/${showId}`, { replace: true, state: location.state });
      } else {
        showPill("Saved ✓");
        onSaved?.();
      }
    } catch (e) {
      console.error(e);
      showPill("Error saving");
    }
    setSaving(false);
  };

  const handleShareGig = async () => {
    if (!show.share_token) return;
    const url = `${window.location.origin}/gig/web?token=${show.share_token}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: show.event_name || show.band_name || "Gig details", url });
      } catch (e) {
        // user cancelled the native share sheet — nothing to do
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        showPill("Link copied!");
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this show?")) return;
    const { error } = await supabase.from("shows").delete().eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    navigate(backTo, { replace: true });
  };

  const toggleStar = () => {
    const newVal = !show.starred;
    update("starred", newVal);
    if (!isNew) supabase.from("shows").update({ starred: newVal }).eq("id", id).then(({ error }) => { if (error) console.error(error); });
  };

  const uploadFileToBucket = async (file, bucket) => {
    const { data: { user } } = await supabase.auth.getUser();
    const filePath = `${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from(bucket).upload(filePath, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const handleStagePlotUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const file_url = await uploadFileToBucket(file, "stage-plots");
        const isImage = file.type.startsWith("image/");
        setBands((prev) => {
          const next = [...prev];
          const b = { ...next[activeBandIndex] };
          if (isImage && !b.stage_plot_url) b.stage_plot_url = file_url;
          b.stage_plot_files = [...(b.stage_plot_files || []), { url: file_url, name: file.name, type: file.type }];
          next[activeBandIndex] = b;
          return next;
        });
      } catch (err) {
        console.error(err);
        showPill("Upload failed");
      }
    }
    e.target.value = "";
  };





  const getInstruments = (m) => {
    if (m.instruments) return m.instruments;
    if (m.instrument) return [{ name: m.instrument, phantom_power: !!m.phantom_power, mic_di: "Mic" }];
    return [];
  };



  const getArtistFxNote = (artistName) => {
    if (artistName === "__general__") return activeBand.general_notes || "";
    return (activeBand.artist_fx_notes || []).find(n => n.artist_name === artistName)?.notes || "";
  };
  const setArtistFxNote = (artistName, notes) => {
    if (artistName === "__general__") {
      updateBandField("general_notes", notes);
      return;
    }
    const existing = [...(activeBand.artist_fx_notes || [])];
    const idx = existing.findIndex(n => n.artist_name === artistName);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], notes };
    } else {
      existing.push({ artist_name: artistName, notes });
    }
    updateBandField("artist_fx_notes", existing);
  };

  const openGenreSettings = () => {
    setGenreDraft(preferences?.genre_tags ? [...preferences.genre_tags] : []);
    setShowGenreSettings(true);
  };
  const openGenreSettingsWithNewTag = (tagName) => {
    const existing = preferences?.genre_tags ? [...preferences.genre_tags] : [];
    setGenreDraft([...existing, { name: tagName, color: "#8CFF3D" }]);
    setShowGenreSettings(true);
  };
  const addGenreDraftTag = () => setGenreDraft((d) => [...d, { name: "", color: "#8CFF3D" }]);
  const updateGenreDraftTag = (i, field, val) => setGenreDraft((d) => { const next = [...d]; next[i] = { ...next[i], [field]: val }; return next; });
  const removeGenreDraftTag = (i) => setGenreDraft((d) => d.filter((_, idx) => idx !== i));
  const saveGenreSettings = async () => {
    setSavingPrefs(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user.id, genre_tags: genreDraft }, { onConflict: "user_id" });
      if (error) throw error;
      await reloadPreferences();
      setShowGenreSettings(false);
    } catch (e) {
      console.error(e);
      showPill("Error saving genres");
    }
    setSavingPrefs(false);
  };

  const addCustomEventType = async () => {
    const newType = window.prompt("Add a new event type:");
    if (!newType || !newType.trim()) return;
    const trimmed = newType.trim();
    update("event_type", trimmed);

    const shouldSave = window.confirm(`Add "${trimmed}" to your event type list for future gigs?`);
    if (!shouldSave) return;

    try {
      await addTypeToList(preferences, trimmed); // also brings back a deleted name
      await reloadPreferences();
    } catch (e) {
      console.error(e);
      showPill("Error saving event type to list");
    }
  };

  const removeCustomEventType = async (type) => {
    try {
      await removeEventType(preferences, type);
      await reloadPreferences();
    } catch (e) {
      console.error(e);
      showPill("Error removing event type");
    }
  };

  const openBusSettings = () => {
    setBusDraft({ ...iemMonitorColors });
    setShowBusSettings(true);
  };
  const saveBusSettings = async () => {
    setSavingPrefs(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          mix_bus_presets: [
            { bus_type: "IEM", color: busDraft.IEM },
            { bus_type: "Monitor", color: busDraft.Monitor },
          ],
        }, { onConflict: "user_id" });
      if (error) throw error;
      await reloadPreferences();
      setShowBusSettings(false);
    } catch (e) {
      console.error(e);
      showPill("Error saving colors");
    }
    setSavingPrefs(false);
  };

  const handleTourManagerLink = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const engineerName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || "";

      const { data: request, error } = await supabase
        .from("tour_manager_requests")
        .insert({
          engineer_user_id: user.id,
          engineer_name: engineerName,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;

      const name = encodeURIComponent(engineerName || "your engineer");
      const url = `${window.location.origin}/tm-intake?token=${request.invite_token}&engineer=${user.id}&name=${name}`;
      navigator.clipboard.writeText(url);
      setTmCopied(true);
      setTimeout(() => setTmCopied(false), 1000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleShareLink = async () => {
    let token = show.share_token;
    if (!token) {
      const { data, error } = await supabase
        .from("shows")
        .update({ share_token: crypto.randomUUID() })
        .eq("id", id)
        .select("share_token")
        .single();
      if (error) {
        console.error(error);
        return;
      }
      token = data.share_token;
      update("share_token", token);
    }
    const url = `${window.location.origin}/shared/${id}?token=${token}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  const genreTags = preferences?.genre_tags || [];
  const busPresets = preferences?.mix_bus_presets || [];

  const iemMonitorColors = {
    IEM: busPresets.find(p => p.bus_type === "IEM")?.color || "#EAB308",
    Monitor: busPresets.find(p => p.bus_type === "Monitor")?.color || "#F97316",
  };

  // Event name + picture fields: in the event card, or (tech phone, job 157)
  // as an optional block at the top of Venue Info.
  const eventNameField = (
          <div>
            <Label className="text-white/50 text-xs">Event Name</Label>
            <Input value={show.event_name || ""} onChange={(e) => update("event_name", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="e.g. Friday Night Showcase" />
          </div>
  );
  const eventIconField = (
          <div>
            <Label className="text-white/50 text-xs">Event Icon</Label>
            <div className="mt-1 flex items-center gap-3">
              <EventTypeIcon type={show.event_type || "Other"} imageUrl={show.icon_url} size={44} />
              <label className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 cursor-pointer">
                {uploadingIcon ? "Uploading..." : show.icon_url ? "Change image" : "Upload image"}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingIcon} onChange={handleIconUpload} />
              </label>
              {show.icon_url && (
                <button type="button" onClick={() => update("icon_url", null)} className="text-xs text-white/40 hover:text-red-400">Remove</button>
              )}
            </div>
            <p className="text-white/25 text-[10px] mt-1">Shows on your lists and for everyone linked to this event. Without one, the event-type icon is used.</p>
          </div>
  );

  // Optional event name + picture (tech phone, job 157 / 158): folded; on a new
  // event it sits at the top of the event card, afterwards at the top of Venue Info.
  const identityBlock = (
              <div className={isNew ? "" : "pt-3"}>
                <button
                  type="button"
                  onClick={() => setIdentityOpen((o) => !o)}
                  aria-expanded={identityOpen}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#111] border border-[#222] text-left"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-white/80 text-sm font-semibold">Event name &amp; picture <span className="text-white/35 font-normal">(optional)</span></span>
                    <span className="block text-white/40 text-xs truncate">{show.event_name ? show.event_name : "None - the headliner is the title"}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${identityOpen ? "rotate-180" : ""}`} />
                </button>
                {identityOpen && (
                  <div className="mt-2 p-3 rounded-xl bg-[#111] border border-[#222] space-y-3">
                    {eventNameField}
                    {eventIconField}
                  </div>
                )}
              </div>
  );

  return (
    <div className={embedded ? "" : "min-h-screen bg-[#0d0d0d] pb-8"}>
      {savedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#8CFF3D] text-black text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          {savedToast}
        </div>
      )}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#8CFF3D] text-black text-sm font-semibold px-4 py-2 rounded-full shadow-lg transition-all duration-1000 ${tmCopied ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
        Tour Manager link copied!
      </div>

      {showGenreSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowGenreSettings(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-base">Genre Colors</h3>
              <button onClick={() => setShowGenreSettings(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 mb-3">
              {genreDraft.map((tag, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#1a1a1a] rounded-xl p-2">
                  <ColorPicker value={tag.color} onChange={(c) => updateGenreDraftTag(i, "color", c)} label="" />
                  <Input
                    value={tag.name}
                    onChange={(e) => updateGenreDraftTag(i, "name", e.target.value)}
                    placeholder="Genre name"
                    className="flex-1 h-8 bg-transparent border-0 text-white text-sm"
                  />
                  <button onClick={() => removeGenreDraftTag(i)} className="p-1 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {genreDraft.length === 0 && (
                <p className="text-xs text-white/30 text-center py-3">No genre tags yet</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={addGenreDraftTag} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full mb-3">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Genre
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowGenreSettings(false)} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
                Back
              </Button>
              <Button onClick={saveGenreSettings} disabled={savingPrefs} className="flex-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold">
                {savingPrefs ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showBusSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowBusSettings(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-base">Mix Bus Colors</h3>
              <button onClick={() => setShowBusSettings(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-white/40 mb-3">Channel numbers are tracked on your console — just pick a color for each type here.</p>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-xl p-2">
                <ColorPicker value={busDraft.IEM} onChange={(c) => setBusDraft((d) => ({ ...d, IEM: c }))} label="IEM" />
              </div>
              <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-xl p-2">
                <ColorPicker value={busDraft.Monitor} onChange={(c) => setBusDraft((d) => ({ ...d, Monitor: c }))} label="Monitor" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowBusSettings(false)} className="flex-1 border-[#2a2a2a] text-white/60 hover:bg-white/5">
                Back
              </Button>
              <Button onClick={saveBusSettings} disabled={savingPrefs} className="flex-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e] font-semibold">
                {savingPrefs ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {embedded && actionSlot ? createPortal(
        <>
          <button onClick={() => setShowFxModal(true)} className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-xl transition-colors text-[#8CFF3D]/60 hover:text-[#8CFF3D]" title="FX / Artist Notes" aria-label="FX / Artist Notes">
            <StickyNote className="w-5 h-5 lg:w-4 lg:h-4" />
          </button>
          <button onClick={toggleStar} className={`w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-xl transition-colors ${show.starred ? "text-amber-400" : "text-amber-400/70 hover:text-amber-400"}`} aria-label={show.starred ? "Unstar" : "Star"}>
            <Star className="w-5 h-5 lg:w-4 lg:h-4" fill={show.starred ? "currentColor" : "none"} />
          </button>
          <InviteSheet
            showId={id}
            trigger={
              <button className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-xl transition-colors text-white/55 hover:text-white" title="Invite" aria-label="Invite">
                <Mail className="w-5 h-5 lg:w-4 lg:h-4" />
              </button>
            }
          />
          {beforeSave}
          <Button onClick={handleSave} disabled={saving} className="ml-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-11 px-4 text-[15px] rounded-xl">
            <Save className="w-4 h-4 mr-1.5" /> {saving ? "..." : "Save"}
          </Button>
        </>,
        actionSlot
      ) : embedded ? (
        // Sticks under the web's header so Save stays in reach on a long form.
        <div className="sticky top-[60px] z-30 -mx-3 -mt-3 px-3 py-2 mb-2 bg-[#111111]/95 backdrop-blur border-b border-[#1f1f1f] rounded-t-2xl flex items-center gap-1">
          <button onClick={toggleStar} className={`p-2 rounded-lg transition-colors ${show.starred ? "text-amber-400" : "text-amber-400/70 hover:text-amber-400"}`} aria-label={show.starred ? "Unstar" : "Star"}>
            <Star className="w-4 h-4" fill={show.starred ? "currentColor" : "none"} />
          </button>
          <button onClick={() => setShowFxModal(true)} className="p-2 rounded-lg transition-colors text-[#8CFF3D]/50 hover:text-[#8CFF3D]" title="FX / Artist Notes" aria-label="FX / Artist Notes">
            <StickyNote className="w-4 h-4" />
          </button>
          <InviteSheet
            showId={id}
            trigger={
              <button className="p-2 rounded-lg transition-colors text-white/50 hover:text-white" title="Invite" aria-label="Invite">
                <Mail className="w-4 h-4" />
              </button>
            }
          />
          <Button onClick={handleSave} disabled={saving} size="sm" className="ml-auto bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-8 rounded-lg">
            <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "..." : "Save"}
          </Button>
        </div>
      ) : (
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto lg:max-w-none lg:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => goBack(backTo)} className="p-2 -ml-2 rounded-lg hover:bg-white/5">
              <ArrowLeft className="w-5 h-5 text-white/70" />
            </button>
            <h1 className="hidden lg:block text-white text-2xl font-bold truncate">{isNew && !show.event_name ? "New show" : eventTitle({ ...show, band_name: show.band_name || bands?.[0]?.band_name })}</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowFxModal(true)} className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-xl transition-colors text-[#8CFF3D]/50 hover:text-[#8CFF3D]" title="FX / Artist Notes">
              <StickyNote className="w-5 h-5 lg:w-4 lg:h-4" />
            </button>
            <button onClick={toggleStar} className={`w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-xl transition-colors ${show.starred ? "text-amber-400" : "text-amber-400/70 hover:text-amber-400"}`}>
              <Star className="w-5 h-5 lg:w-4 lg:h-4" fill={show.starred ? "currentColor" : "none"} />
            </button>
            <InviteSheet
              showId={isNew ? null : id}
              trigger={
                <button className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-xl transition-colors text-white/50 hover:text-white" title="Invite">
                  <Mail className="w-5 h-5 lg:w-4 lg:h-4" />
                </button>
              }
            />
            {!isNew && (
              <button onClick={handleDelete} className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-xl transition-colors text-red-400/60 hover:text-red-400">
                <Trash2 className="w-5 h-5 lg:w-4 lg:h-4" />
              </button>
            )}
            <Button onClick={handleSave} disabled={saving} className="ml-1 bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-11 px-4 text-[15px] rounded-xl lg:h-8 lg:px-3 lg:text-sm lg:rounded-lg">
              <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
      )}

      {/* Desktop (1024px+): the event card on the left, Venue Info and
          Performer side by side (stacked under each other below 1280px). */}
      <div className={embedded ? "space-y-3" : "px-4 pt-4 max-w-lg mx-auto space-y-3 lg:max-w-none lg:px-6 lg:pt-5 lg:space-y-0 lg:grid lg:gap-5 lg:items-start lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_minmax(0,1fr)]"}>
        <div className="space-y-3 lg:sticky lg:top-[76px] lg:row-span-2 xl:row-span-1">
        {/* Tech phone (job 156): the event banner on top; tap it to open the
            event info (status, name, type, picture, fan page, date) below. */}
        {banner && (
          <button
            type="button"
            onClick={() => setInfoOpen((o) => !o)}
            aria-expanded={infoOpen}
            aria-label={infoOpen ? "Hide event info" : "Edit event info"}
            className="relative block w-full text-left p-0 bg-transparent border-0 rounded-2xl"
          >
            {banner}
            <span className="absolute right-3 bottom-3 w-9 h-9 rounded-full bg-black/55 border border-white/15 flex items-center justify-center text-white/85">
              <ChevronDown className={`w-5 h-5 transition-transform ${infoOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
        )}
        {(!banner || infoOpen) && (<>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            {isTechProductionAccount && (
              <>
                <Select value={show.status} onValueChange={(v) => update("status", v)}>
                  <SelectTrigger className="w-auto h-8 bg-transparent border-0 p-0">
                    <StatusBadge status={show.status} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                    <SelectItem value="not_started">New</SelectItem>
                    <SelectItem value="in_progress">Frequent</SelectItem>
                    <SelectItem value="complete">Worked</SelectItem>
                  </SelectContent>
                </Select>
                {(() => {
                  const statusColor = show.status === "complete" ? "#8CFF3D" : show.status === "in_progress" ? "#60A5FA" : "#bbb";
                  const btnStyle = (active) => active
                    ? { borderColor: statusColor + "80", color: statusColor, backgroundColor: statusColor + "1a" }
                    : {};
                  return (
                    <>
                      <button
                        onClick={() => update("frequency_scope", show.frequency_scope === "venue" ? null : "venue")}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#333] text-white/30 hover:text-white/60 transition-all"
                        style={btnStyle(show.frequency_scope === "venue")}
                        title="Venue"
                      >
                        <Building className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => update("frequency_scope", show.frequency_scope === "artist" ? null : "artist")}
                        className="h-8 w-8 flex items-center justify-center rounded-lg border border-[#333] text-white/30 hover:text-white/60 transition-all"
                        style={btnStyle(show.frequency_scope === "artist")}
                        title="Artist"
                      >
                        <Mic2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => update("frequency_scope", show.frequency_scope === "both" ? null : "both")}
                        className="h-8 px-2 flex items-center justify-center gap-1 rounded-lg border border-[#333] text-white/30 hover:text-white/60 transition-all"
                        style={btnStyle(show.frequency_scope === "both")}
                        title="Both"
                      >
                        <Building className="w-3.5 h-3.5" />
                        <Mic2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  );
                })()}
              </>
            )}
            <button
              onClick={() => update("done", !show.done)}
              className="h-8 w-8 flex items-center justify-center rounded-lg border transition-all"
              style={show.done ? { borderColor: "#8CFF3D80", color: "#8CFF3D", backgroundColor: "#8CFF3D1a" } : { borderColor: "#333", color: "rgba(255,255,255,0.3)" }}
              title="Mark gig as done"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div ref={mainCaptureRef} className="bg-[#161616] rounded-2xl border border-[#222] p-4 space-y-3">
          {techPhone && isNew && identityBlock}
          {!techPhone && eventNameField}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-white/50 text-xs">Event Type</Label>
              <button onClick={() => setShowEventTypeManager(true)} className="text-white/30 hover:text-[#8CFF3D] p-0.5">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
            <Select
              value={show.event_type || ""}
              onValueChange={(v) => {
                if (v === "__add_new__") addCustomEventType();
                else update("event_type", v);
              }}
            >
              <SelectTrigger className="mt-1 h-11 bg-[#111] border-[#222] text-white text-base w-52">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                {buildEventTypeOptions([], preferences?.custom_event_types, preferences?.hidden_event_types, show.event_type).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              <SelectItem value="__add_new__">Other / Add New</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!techPhone && eventIconField}
          {/* Fan page: set up from the event once it exists, not while creating it. */}
          {FAN_RSVP_OPEN && !isNew && <div>
            <Label className="text-white/50 text-xs">Fan page</Label>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-[11px] tracking-[0.1em]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: show.fan_page_enabled ? "#8CFF3D" : "rgba(255,255,255,0.45)" }}>{show.fan_page_enabled ? "LIVE" : "OFF"}</span>
              <button
                type="button"
                onClick={() => setShowFanPage(true)}
                className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {show.fan_page_enabled ? "Edit fan page" : "Set up fan page"}
              </button>
            </div>
            <p className="text-white/25 text-[10px] mt-1">Once it's live, a fan page ticket shows on this event's row on Home.</p>
            {showFanPage && <FanPageSheet showId={id} onClose={closeFanPage} />}
          </div>}
          <div>
            <Label className="text-white/50 text-xs">Date *</Label>
            <Input type="date" value={show.date} onChange={(e) => update("date", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white [color-scheme:dark] w-44" />
          </div>
        </div>
        </>)}
        </div>

        <div ref={venuePrintRef} className="relative lg:col-start-2 xl:row-start-1">
          <CollapsibleSection title="Venue Info" icon={Info} color="#60A5FA" defaultOpen={isDesktop}>
            {techPhone && !isNew && identityBlock}
            <VenueInfoFields
              value={show}
              onChange={update}
              withPhoto={sectionPhotos}
              nameAction={isTechProductionAccount ? <LoadTemplateButton category="venue" label="Load Venue" onLoad={loadVenueTemplate} /> : null}
            />
        </CollapsibleSection>
        </div>

        <div ref={bandPrintRef} className="relative lg:col-start-2 xl:col-start-3 xl:row-start-1">
          <CollapsibleSection title="Performer" icon={Music} color="#EF4444" defaultOpen={isDesktop} badge={(() => {
            const namedCount = bands.filter((b) => b.band_name && b.band_name.trim() !== "").length;
            return namedCount > 0 ? namedCount : undefined;
          })()}>
          <div className="space-y-3 pt-3">
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={addOpener} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 h-8">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Act
            </Button>
          </div>
          {bands.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {bands.map((b, i) => {
                const colors = ROLE_COLORS[b.role] || ROLE_COLORS["N/A"];
                const isActive = activeBandIndex === i;
                const label = b.band_name || b.role || "Act";
                return (
                  <button
                    key={b.id || `new-${i}`}
                    onClick={() => setActiveBandIndex(i)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${isActive ? `${colors.activeBorder} ${colors.text} ${colors.bg}` : "border-[#222] text-white/40 hover:text-white/60"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {ROLE_OPTIONS.map((r) => {
                const colors = ROLE_COLORS[r];
                const active = (activeBand.role || "N/A") === r;
                return (
                  <button
                    key={r}
                    onClick={() => updateBandRole(activeBandIndex, r)}
                    className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border transition-all ${active ? `${colors.text} ${colors.bg} ${colors.border}` : "text-white/30 border-transparent hover:text-white/50"}`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-white/40 text-[10px] whitespace-nowrap">Order #</Label>
              <Input
                type="number"
                min={1}
                max={bands.length}
                value={orderDraft !== null ? orderDraft : bands.findIndex((b) => b === activeBand) + 1}
                onChange={(e) => setOrderDraft(e.target.value)}
                onBlur={() => {
                  if (orderDraft !== null) {
                    setOpenerPosition(activeBandIndex, orderDraft);
                    setOrderDraft(null);
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                className="w-14 h-7 bg-[#111] border-[#222] text-white text-xs px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {bands.length > 1 && (
                <>
                  <button type="button" aria-label="Move earlier in the lineup" disabled={activeBandIndex === 0} onClick={() => setOpenerPosition(activeBandIndex, activeBandIndex)} className="w-7 h-7 rounded-md border border-[#222] text-white/60 hover:text-white disabled:opacity-25 flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
                  <button type="button" aria-label="Move later in the lineup" disabled={activeBandIndex >= bands.length - 1} onClick={() => setOpenerPosition(activeBandIndex, activeBandIndex + 2)} className="w-7 h-7 rounded-md border border-[#222] text-white/60 hover:text-white disabled:opacity-25 flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
                </>
              )}
            </div>
            {bands.length > 1 && (
              <button onClick={() => removeOpener(activeBandIndex)} className="p-1 text-white/30 hover:text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <PerformerFields
            band={activeBand}
            withPhoto={sectionPhotos}
            onPatch={(patch) => setBands((prev) => { const next = [...prev]; next[activeBandIndex] = { ...next[activeBandIndex], ...patch }; return next; })}
            nameAction={isTechProductionAccount ? <LoadTemplateButton category="artist" label="Load Artist" onLoad={loadArtistTemplate} /> : null}
            afterName={<>
          <SubmittedBy
            name={activeBand.submitter_name}
            phone={activeBand.submitter_phone}
            email={activeBand.submitter_email}
            cardToken={submitterCard?.card_share_token}
            cardName={submitterCard?.display_name}
          />
          {activeBand.requested_order && (
            <p className="text-white/30 text-xs -mt-1">Requested lineup position: #{activeBand.requested_order}</p>
          )}
            </>}
            genreTags={genreTags}
            onAddGenre={openGenreSettings}
            onAddGenreFromTag={openGenreSettingsWithNewTag}
            iemMonitorColors={iemMonitorColors}
            onBusSettings={openBusSettings}
            onStagePlotUpload={handleStagePlotUpload}
          />
          </div>
        </CollapsibleSection>
        </div>

      {showFxModal && (() => {
        // One box, one row of chips under it (job 169): General (whole show),
        // then each act; the box shows whichever is picked.
        const isShow = fxTarget === "__show__" || !bands[fxTarget];
        const act = isShow ? null : bands[fxTarget];
        const actLabel = (b) => b.band_name || b.role || "Act";
        // One box (Jay): an act's notes, with any per-member notes it sent on
        // the intake form shown as "Name: note" lines; editing saves it all as
        // the act's notes.
        const memberLines = (b) => (b.artist_fx_notes || []).filter((n) => n.artist_name && String(n.notes || "").trim()).map((n) => `${n.artist_name}: ${n.notes}`);
        const actText = (b) => [b.general_notes || "", ...memberLines(b)].filter((t) => String(t).trim()).join("\n\n");
        const setActText = (v) => setBands((prev) => { const next = [...prev]; next[fxTarget] = { ...next[fxTarget], general_notes: v, artist_fx_notes: [] }; return next; });
        const actHasNotes = (b) => !!(b.general_notes || (b.artist_fx_notes || []).some((n) => n.notes));
        const chip = (on) => `px-3 py-1.5 rounded-full text-[13px] border transition-all flex items-center gap-1.5 ${on ? "border-[#8CFF3D]/50 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#2a2a2a] text-white/55 hover:text-white/80"}`;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3" style={{ height: "100dvh" }} onClick={() => setShowFxModal(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <StickyNote className="w-5 h-5 text-[#8CFF3D]" /> FX / Artist Notes
              </h3>
              <button onClick={() => setShowFxModal(false)} className="w-10 h-10 -mr-2 flex items-center justify-center text-white/40 hover:text-white" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <Textarea
                key={String(fxTarget)}
                value={isShow ? (show.show_notes || "") : actText(act)}
                onChange={(e) => (isShow ? update("show_notes", e.target.value) : setActText(e.target.value))}
                className="bg-[#111] border-[#222] text-white text-[15px] leading-relaxed min-h-[48dvh]"
                placeholder={isShow ? "General notes for the whole show..." : `Notes for ${actLabel(act)}...`}
              />

              <div className="flex flex-wrap gap-1.5 pt-1">
                <button type="button" onClick={() => setFxTarget("__show__")} className={chip(isShow)}>
                  General {show.show_notes ? <span aria-label="has notes">●</span> : null}
                </button>
                {bands.map((b, i) => (
                  <button type="button" key={b.id || `fx-${i}`} onClick={() => setFxTarget(i)} className={chip(!isShow && fxTarget === i)}>
                    {actLabel(b)} {actHasNotes(b) ? <span aria-label="has notes">●</span> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {showEventTypeManager && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4" onClick={() => setShowEventTypeManager(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold text-base mb-4">Manage Event Types</h3>
            {(preferences?.custom_event_types || []).length === 0 ? (
              <p className="text-white/40 text-sm">No custom event types yet</p>
            ) : (
              <div className="space-y-2">
                {(preferences?.custom_event_types || []).map((t) => (
                  <div key={t} className="flex items-center justify-between bg-[#111] rounded-lg px-3 py-2">
                    <span className="text-white text-sm">{t}</span>
                    <button onClick={() => removeCustomEventType(t)} className="text-white/30 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowEventTypeManager(false)} className="w-full mt-4 py-2.5 rounded-xl border border-[#2a2a2a] text-white/60 hover:bg-white/5 text-sm">
              Done
            </button>
          </div>
        </div>
      )}

      </div>
      {isTechProductionAccount && <BottomTabs railOnly />}
    </div>
  );
}
