import React, { useState, useEffect } from "react";
import { setMemberVocals } from "@/components/showpilot/VocalsQuestion";
import { usePersistedState, clearPersistedState } from "@/hooks/usePersistedState";
import { supabase } from "@/api/supabaseClient";
import { fetchMyArtistProfile } from "@/lib/roleTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Music, Users, Wifi, Save } from "lucide-react";
import CollapsibleSection from "@/components/showpilot/CollapsibleSection";
import { useToast } from "@/components/ui/use-toast";
import IntakeRating from "@/components/showpilot/IntakeRating";
import MultitrackQuestion from "@/components/showpilot/MultitrackQuestion";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import EventOverviewCard from "@/components/showpilot/EventOverviewCard";
import { intakeCircles } from "@/components/showpilot/IntakeFields";
import { Disc3 } from "lucide-react";

const EVENT_TYPES = ["Concert", "Comedy Show", "Theatre Play", "Corporate Event", "Private Party", "Festival", "Open Mic", "Other"];


const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

// `link` comes from a short /intake/<code> link (IntakeShortLink); the long
// /tm-intake?token=...&engineer=...&name=... link uses the URL instead.
export default function TourManagerIntake({ link } = {}) {
  const params = new URLSearchParams(window.location.search);
  const token = link?.token || params.get("token");
  const engineerUserId = link?.engineer || params.get("engineer");
  const engineerName = link ? (link.name || "your audio engineer") : params.get("name") ? decodeURIComponent(params.get("name")) : "your audio engineer";

  const [form, setForm] = usePersistedState(`tm_intake_draft_${token}`, {
    role: "Headliner",
    event_name: "",
    band_name: "",
    date: "",
    event_type: "",
    genre_tags: [],
    set_length_minutes: "",
    band_members: [],
    general_notes: "",
    stage_plot_url: "",
    stage_plot_files: [],
    submitter_name: "",
    submitter_phone: "",
    submitter_email: "",
    submitter_card_user_id: "",
    requested_order: "",
    multitrack_interest: null,
  });
  const [engineerCard, setEngineerCard] = useState(null);
  const [shareMyCard, setShareMyCard] = useState(false);
  const [genreInput, setGenreInput] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  // Which circles the act has saved on their web (job 195).
  const [seen, setSeen] = usePersistedState(`tm_intake_seen_${token}`, {});
  const { toast } = useToast();

  const handleLoadTemplate = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const path = window.location.pathname + window.location.search;
      try { sessionStorage.setItem("post_auth_redirect", path); } catch {}
      window.location.href = "/login?redirect=" + encodeURIComponent(path);
      return;
    }
    setLoadingTemplate(true);
    try {
      const t = await fetchMyArtistProfile(supabase, user.id);
      if (!t || (!t.band_name && (!t.band_members || t.band_members.length === 0))) {
        toast({ title: "No saved artist profile yet", description: "Set one up in Settings > My Templates." });
      } else {
        setForm((prev) => ({
          ...prev,
          band_name: t.band_name || "",
          genre_tags: t.genre_tags || [],
          band_members: t.band_members || [],
          stage_plot_url: t.stage_plot_url || "",
          stage_plot_files: t.stage_plot_files || [],
          general_notes: t.general_notes || "",
        }));
        toast({ title: "Loaded your artist profile" });
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingTemplate(false);
  };

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  // Engineer view state
  const [currentUser, setCurrentUser] = useState(null);
  const [tmRequest, setTmRequest] = useState(null);
  const [engineerForm, setEngineerForm] = useState({ wifi_network: "", wifi_password: "", contacts: [] });
  const [engineerSaving, setEngineerSaving] = useState(false);
  const [engineerSaved, setEngineerSaved] = useState(false);
  const [loadingView, setLoadingView] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);
        if (token) {
          // Token lookup: the engineer who made the link gets the full
          // request, anyone else just the event name / date / status.
          const { data } = await supabase.rpc("get_tour_manager_request", { p_token: token });
          if (data) setTmRequest(data);
        }
      } catch {}
      setLoadingView(false);
    };
    init();
  }, [token]);

  // These must stay above every early `return` below (loading/submitted/
  // engineer-view states) - React requires every hook to run in the same
  // order on every render, and a hook placed after a conditional return
  // gets skipped on some renders but not others, which crashes the whole
  // page with a blank/black screen.
  useEffect(() => {
    if (!engineerUserId) return;
    supabase
      .from("user_preferences")
      .select("display_name, job_title, profile_photo_url, card_bg_color, card_bg_image_url, card_text_color, card_share_token")
      .eq("user_id", engineerUserId)
      .maybeSingle()
      .then(({ data }) => setEngineerCard(data));
  }, [engineerUserId]);

  useEffect(() => {
    const currentlyIsEngineer = currentUser && currentUser.id === engineerUserId;
    if (currentUser && !currentlyIsEngineer && shareMyCard) {
      setForm((f) => ({ ...f, submitter_card_user_id: currentUser.id }));
    } else if (!shareMyCard) {
      setForm((f) => ({ ...f, submitter_card_user_id: "" }));
    }
  }, [shareMyCard, currentUser, engineerUserId]);

  const update = (field, val) => setForm((s) => ({ ...s, [field]: val }));
  const updateEngineer = (field, val) => setEngineerForm((s) => ({ ...s, [field]: val }));

  const addEngineerContact = () => updateEngineer("contacts", [...engineerForm.contacts, { name: "", role: "", phone: "", email: "" }]);
  const updateEngineerContact = (i, f, v) => { const c = [...engineerForm.contacts]; c[i] = { ...c[i], [f]: v }; updateEngineer("contacts", c); };
  const removeEngineerContact = (i) => updateEngineer("contacts", engineerForm.contacts.filter((_, idx) => idx !== i));

  // Engineer is logged in and owns this show, so plain Supabase calls work fine here
  // (normal Row Level Security allows it, unlike the anonymous submission below).
  const handleEngineerSave = async () => {
    if (!tmRequest?.created_show_id) return;
    setEngineerSaving(true);
    try {
      const { data: existingShow, error: fetchError } = await supabase
        .from("shows")
        .select("contacts")
        .eq("id", tmRequest.created_show_id)
        .single();
      if (fetchError) throw fetchError;

      const mergedContacts = [...(existingShow.contacts || [])];
      engineerForm.contacts.forEach(ec => {
        if (ec.name && !mergedContacts.find(c => c.name === ec.name)) mergedContacts.push(ec);
      });

      const { error: showError } = await supabase
        .from("shows")
        .update({
          wifi_network: engineerForm.wifi_network,
          wifi_password: engineerForm.wifi_password,
          contacts: mergedContacts,
        })
        .eq("id", tmRequest.created_show_id);
      if (showError) throw showError;

      const { error: reqError } = await supabase
        .from("tour_manager_requests")
        .update({
          wifi_network: engineerForm.wifi_network,
          wifi_password: engineerForm.wifi_password,
          contacts: mergedContacts,
        })
        .eq("id", tmRequest.id);
      if (reqError) throw reqError;

      setEngineerSaved(true);
      setTimeout(() => setEngineerSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setEngineerSaving(false);
  };

  const uploadFileToBucket = async (file, bucket) => {
    const filePath = `intake_${token}/${Date.now()}_${file.name}`;
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
        setForm((prev) => ({
          ...prev,
          stage_plot_url: isImage && !prev.stage_plot_url ? file_url : prev.stage_plot_url,
          stage_plot_files: [...(prev.stage_plot_files || []), { url: file_url, name: file.name, type: file.type }],
        }));
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = "";
  };

  const removeStagePlotFile = (i) => {
    setForm((prev) => ({
      ...prev,
      stage_plot_files: (prev.stage_plot_files || []).filter((_, idx) => idx !== i),
    }));
  };

  const addMember = () => update("band_members", [...form.band_members, { name: "", instrument: "", bus_type: "", notes: "" }]);

  const getInstruments = (m) => {
    if (m.instruments) return m.instruments;
    if (m.instrument) return [{ name: m.instrument, phantom_power: !!m.phantom_power, mic_di: "Mic" }];
    return [];
  };
  const addInstrument = (i) => {
    const members = [...form.band_members];
    const current = getInstruments(members[i]);
    members[i] = { ...members[i], instruments: [...current, { name: "", phantom_power: false, mic_di: "Mic" }] };
    update("band_members", members);
  };
  const updateInstrument = (i, ii, f, v) => {
    const members = [...form.band_members];
    const instruments = [...getInstruments(members[i])];
    instruments[ii] = { ...instruments[ii], [f]: v };
    members[i] = { ...members[i], instruments };
    update("band_members", members);
  };
  // Vocals? Yes / No per member (job 152).
  const setVocals = (i, yes) => {
    const members = [...form.band_members];
    members[i] = setMemberVocals(members[i], getInstruments(members[i]), yes);
    update("band_members", members);
  };
  const removeInstrument = (i, ii) => {
    const members = [...form.band_members];
    const instruments = getInstruments(members[i]).filter((_, idx) => idx !== ii);
    members[i] = { ...members[i], instruments };
    update("band_members", members);
  };
  const updateMember = (i, f, v) => { const m = [...form.band_members]; m[i] = { ...m[i], [f]: v }; update("band_members", m); };
  const removeMember = (i) => {
    update("band_members", form.band_members.filter((_, idx) => idx !== i));
    setNotesTarget("__general__");
  };
  const [notesTarget, setNotesTarget] = useState("__general__");
  const getActiveNotes = () => notesTarget === "__general__" ? form.general_notes : (form.band_members[notesTarget]?.notes || "");
  const setActiveNotes = (val) => notesTarget === "__general__" ? update("general_notes", val) : updateMember(notesTarget, "notes", val);

  const removeGenreTag = (tag) => update("genre_tags", form.genre_tags.filter((t) => t !== tag));

  const handleSubmit = async () => {
    if (!form.band_name) {
      setError("Artist / group name is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Anonymous submitters can't insert a Show owned by someone else through
      // normal permissions — this calls a secure server-side function that
      // verifies the token and does the privileged write. See
      // supabase/tour_manager_migration.sql and opener_intake_migration.sql.
      const { error: rpcError } = await supabase.rpc("submit_tour_manager_request", {
        p_token: token,
        p_form: form,
      });
      if (rpcError) throw rpcError;

      clearPersistedState(`tm_intake_draft_${token}`);
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  if (loadingView) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (!token || !engineerUserId) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Invalid link</p>
          <p className="text-white/30 text-sm">This import link is not valid.</p>
        </div>
      </div>
    );
  }

  // Engineer view: logged-in user is the engineer and submission exists
  const isEngineer = currentUser && currentUser.id === engineerUserId;

  if (isEngineer && tmRequest && tmRequest.status === "submitted") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] pb-16">
        {engineerSaved && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#8CFF3D] text-black text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
            Saved ✓
          </div>
        )}
        <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
          <div className="px-4 py-4 max-w-lg mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#8CFF3D]/10 flex items-center justify-center">
                <Music className="w-4 h-4 text-[#8CFF3D]" />
              </div>
              <div>
                <h1 className="text-white font-bold text-base leading-tight">Submitted Event Info</h1>
                <p className="text-white/40 text-xs">Add your details below — syncs to the show</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
          {/* Read-only submitted data */}
          <div className="bg-[#111] rounded-2xl p-4 space-y-2">
            <p className="text-white/40 text-xs uppercase tracking-wider font-semibold mb-3">Previously Submitted</p>
            <p className="text-white font-semibold">{tmRequest.band_name}</p>
            <p className="text-white/50 text-sm">{tmRequest.date}{tmRequest.venue ? ` · ${tmRequest.venue}` : ""}{tmRequest.location ? ` · ${tmRequest.location}` : ""}</p>
            {tmRequest.include_services && (
              <p className="text-sm text-white/70">
                Multi-track recording:{" "}
                <span className={tmRequest.multitrack_interest ? "text-[#8CFF3D] font-semibold" : "text-white/45"}>
                  {tmRequest.multitrack_interest === true ? "Yes, interested" : tmRequest.multitrack_interest === false ? "No" : "No answer"}
                </span>
              </p>
            )}
            {tmRequest.band_members?.length > 0 && (
              <div className="mt-2 space-y-1">
                {tmRequest.band_members.filter(m => m.name).map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-white/60">{m.name}</span>
                    {m.instrument && <span className="text-white/30 text-xs">· {m.instrument}</span>}
                    {m.bus_type && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${m.bus_type === "IEM" ? "bg-blue-500/20 text-blue-400" : "bg-orange-500/20 text-orange-400"}`}>
                        {m.bus_type}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Engineer WiFi */}
          <CollapsibleSection title="WiFi Details" icon={Wifi} defaultOpen={true}>
            <div className="grid grid-cols-2 gap-3 pt-3">
              <div>
                <Label className="text-white/50 text-xs">WiFi Network</Label>
                <Input value={engineerForm.wifi_network} onChange={(e) => updateEngineer("wifi_network", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">WiFi Password</Label>
                <Input value={engineerForm.wifi_password} onChange={(e) => updateEngineer("wifi_password", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
            </div>
          </CollapsibleSection>

          {/* Engineer Contacts */}
          <CollapsibleSection title="Contacts" icon={Users} badge={engineerForm.contacts.length}>
            <div className="space-y-3 pt-3">
              {engineerForm.contacts.map((c, i) => (
                <div key={i} className="bg-[#111] rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <Input value={c.name} onChange={(e) => updateEngineerContact(i, "name", e.target.value)} placeholder="Name" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                      <Input value={c.role} onChange={(e) => updateEngineerContact(i, "role", e.target.value)} placeholder="Role" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                      <Input value={c.phone} onChange={(e) => updateEngineerContact(i, "phone", formatPhoneNumber(e.target.value))} placeholder="Phone" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                      <Input value={c.email} onChange={(e) => updateEngineerContact(i, "email", e.target.value)} placeholder="Email" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                    </div>
                    <button onClick={() => removeEngineerContact(i)} className="p-1.5 ml-2 text-white/30 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addEngineerContact} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact
              </Button>
            </div>
          </CollapsibleSection>

          <Button onClick={handleEngineerSave} disabled={engineerSaving} className="w-full bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-12 rounded-xl font-semibold text-base">
            <Save className="w-4 h-4 mr-2" />
            {engineerSaving ? "Saving..." : "Save to Show"}
          </Button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <IntakeSent seed={token} title="Sent!" line={`Your event info went to ${engineerName}. The event is on their ShowPilot now.`}>
        <IntakeRating token={token} />
      </IntakeSent>
    );
  }

  // The Performer Intake form as an access key and web (job 195).
  const showTitle = tmRequest?.event_name || tmRequest?.band_name || "Your show";
  const dayLine = [tmRequest?.date ? new Date(tmRequest.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "", tmRequest?.venue].filter(Boolean).join(" · ");
  const shownName = engineerCard?.display_name || engineerName;
  const h = {
    form, update, genreInput, setGenreInput, removeGenreTag,
    getInstruments, addMember, updateMember, removeMember, addInstrument, updateInstrument, removeInstrument, setVocals,
    handleStagePlotUpload, removeStagePlotFile,
    notesTarget, setNotesTarget, getActiveNotes, setActiveNotes,
    fillFromProfile: !isEngineer ? { onClick: handleLoadTemplate, loading: loadingTemplate } : null,
    formatPhone: formatPhoneNumber,
  };
  const onCard = () => {
    if (!currentUser) {
      const path = window.location.pathname + window.location.search;
      try { sessionStorage.setItem("post_auth_redirect", path); } catch {}
      window.location.href = "/login?redirect=" + encodeURIComponent(path);
      return;
    }
    setShareMyCard((v) => !v);
  };
  const circles = intakeCircles(h, { seen, card: { onCard, cardOn: shareMyCard, showCard: !isEngineer } });
  return (
    <IntakeKeyWeb
      seed={token}
      image={engineerCard?.profile_photo_url || ""}
      keyCode={link?.code ? String(link.code).toUpperCase() : ""}
      fromLine={`${shownName} (Audio) sent you a key to`}
      title={showTitle}
      dateLine={dayLine}
      actName={form.band_name}
      center={{
        name: shownName, photo: engineerCard?.profile_photo_url || "", label: "Audio",
        href: engineerCard?.card_share_token ? `/pilot/${engineerCard.card_share_token}` : "",
      }}
      circles={circles}
      onSave={(key) => setSeen((v) => ({ ...(v || {}), [key]: true }))}
      corner={tmRequest?.include_services ? {
        label: "Additional services", icon: Disc3, done: form.multitrack_interest === true || form.multitrack_interest === false,
        body: () => <MultitrackQuestion value={form.multitrack_interest ?? null} onChange={(v) => update("multitrack_interest", v)} />,
      } : null}
      show={() => (
        <div className="flex flex-col gap-3 text-center">
          <EventOverviewCard ov={{ image: tmRequest?.image || "", event_type: tmRequest?.event_type }} title={showTitle} date={tmRequest?.date} venue={tmRequest?.venue} color="#8CFF3D" />
          <div className="text-[13.5px] text-white/60">Sending this puts the event on {shownName}'s ShowPilot.</div>
        </div>
      )}
      needLine={!form.band_name ? "Your artist name is needed to send." : ""}
      canSend={!!form.band_name}
      onSend={handleSubmit}
      sending={submitting}
      sendLabel="Submit"
      error={error || ""}
    />
  );
}
