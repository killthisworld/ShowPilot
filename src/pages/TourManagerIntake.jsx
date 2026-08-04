import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Send, CheckCircle, Music, Users, Info, Wifi, Save, X, ImageIcon, FileText, Paperclip } from "lucide-react";
import CollapsibleSection from "@/components/showpilot/CollapsibleSection";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming","District of Columbia",
];

const EVENT_TYPES = ["Concert", "Comedy Show", "Theatre Play", "Corporate Event", "Private Party", "Festival", "Open Mic", "Other"];

const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export default function TourManagerIntake() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const engineerUserId = params.get("engineer");
  const engineerName = params.get("name") ? decodeURIComponent(params.get("name")) : "your audio engineer";

  const [form, setForm] = useState({
    event_name: "",
    band_name: "",
    venue: "",
    date: "",
    city: "",
    state: "",
    event_type: "",
    genre_tags: [],
    set_length_minutes: "",
    console: "",
    wifi_network: "",
    wifi_password: "",
    contacts: [],
    stage_plot_url: "",
    stage_plot_files: [],
    band_members: [],
    openers: [],
    general_notes: "",
  });
  const [genreInput, setGenreInput] = useState("");
  const [openerGenreInputs, setOpenerGenreInputs] = useState({});
  const [uploadingStagePlot, setUploadingStagePlot] = useState(false);

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
          const { data } = await supabase
            .from("tour_manager_requests")
            .select("*")
            .eq("invite_token", token)
            .maybeSingle();
          if (data) setTmRequest(data);
        }
      } catch {}
      setLoadingView(false);
    };
    init();
  }, [token]);

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

  const addContact = () => update("contacts", [...form.contacts, { name: "", role: "", phone: "", email: "" }]);
  const updateContact = (i, f, v) => { const c = [...form.contacts]; c[i] = { ...c[i], [f]: v }; update("contacts", c); };
  const removeContact = (i) => update("contacts", form.contacts.filter((_, idx) => idx !== i));

  const addMember = () => update("band_members", [...form.band_members, { name: "", instrument: "", bus_type: "" }]);

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
  const removeInstrument = (i, ii) => {
    const members = [...form.band_members];
    const instruments = getInstruments(members[i]).filter((_, idx) => idx !== ii);
    members[i] = { ...members[i], instruments };
    update("band_members", members);
  };
  const updateMember = (i, f, v) => { const m = [...form.band_members]; m[i] = { ...m[i], [f]: v }; update("band_members", m); };
  const removeMember = (i) => update("band_members", form.band_members.filter((_, idx) => idx !== i));

  const removeGenreTag = (tag) => update("genre_tags", form.genre_tags.filter((t) => t !== tag));

  // Openers — a lightweight repeater the manager can fill in if they
  // know the info; each opener supports its own genre tag input, its
  // own band member list, and set length, same shape as the headliner.
  const addOpener = () => update("openers", [...form.openers, { band_name: "", genre_tags: [], band_members: [], set_length_minutes: "" }]);
  const updateOpener = (i, f, v) => { const o = [...form.openers]; o[i] = { ...o[i], [f]: v }; update("openers", o); };
  const removeOpener = (i) => {
    update("openers", form.openers.filter((_, idx) => idx !== i));
    setOpenerGenreInputs((s) => { const next = { ...s }; delete next[i]; return next; });
  };
  const addOpenerMember = (i) => updateOpener(i, "band_members", [...form.openers[i].band_members, { name: "", instrument: "", bus_type: "" }]);
  const updateOpenerMember = (i, mi, f, v) => {
    const members = [...form.openers[i].band_members];
    members[mi] = { ...members[mi], [f]: v };
    updateOpener(i, "band_members", members);
  };
  const removeOpenerMember = (i, mi) => updateOpener(i, "band_members", form.openers[i].band_members.filter((_, idx) => idx !== mi));
  const removeOpenerGenreTag = (i, tag) => updateOpener(i, "genre_tags", form.openers[i].genre_tags.filter((t) => t !== tag));

  // Anonymous submitters upload to a folder scoped to their invite token
  // (rather than a user ID, since they don't have an account). Requires a
  // storage policy allowing anon uploads to the stage-plots bucket — see
  // supabase/tour_manager_migration.sql.
  const handleStagePlotUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingStagePlot(true);
    for (const file of files) {
      try {
        const filePath = `tm-intake/${token}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from("stage-plots").upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("stage-plots").getPublicUrl(filePath);
        const isImage = file.type.startsWith("image/");
        setForm((s) => ({
          ...s,
          stage_plot_url: isImage && !s.stage_plot_url ? urlData.publicUrl : s.stage_plot_url,
          stage_plot_files: [...s.stage_plot_files, { url: urlData.publicUrl, name: file.name, type: file.type }],
        }));
      } catch (err) {
        console.error(err);
        setError("File upload failed. Please try again.");
      }
    }
    setUploadingStagePlot(false);
    e.target.value = "";
  };
  const removeStagePlotFile = (i) => setForm((s) => ({ ...s, stage_plot_files: s.stage_plot_files.filter((_, idx) => idx !== i) }));

  const handleSubmit = async () => {
    if (!form.band_name || !form.date) {
      setError("Band name and date are required.");
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
                <h1 className="text-white font-bold text-base leading-tight">Submitted Gig Info</h1>
                <p className="text-white/40 text-xs">Add your details below — syncs to the show</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
          {/* Read-only submitted data */}
          <div className="bg-[#111] rounded-2xl p-4 space-y-2">
            <p className="text-white/40 text-xs uppercase tracking-wider font-semibold mb-3">Manager Submitted</p>
            <p className="text-white font-semibold">{tmRequest.band_name}</p>
            <p className="text-white/50 text-sm">{tmRequest.date}{tmRequest.venue ? ` · ${tmRequest.venue}` : ""}{tmRequest.location ? ` · ${tmRequest.location}` : ""}</p>
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
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-16 h-16 text-[#8CFF3D] mx-auto mb-4" />
          <h2 className="text-white text-2xl font-bold mb-2">Submitted!</h2>
          <p className="text-white/50 text-sm">
            Your gig info has been sent to {engineerName}. The show has been added to their ShowPilot profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#8CFF3D]/10 flex items-center justify-center">
              <Music className="w-4 h-4 text-[#8CFF3D]" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Manager Import Link</h1>
              <p className="text-white/40 text-xs">Submitting for {engineerName}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <p className="text-white/40 text-xs pb-1">
          Fill in the show details below and hit Submit — this will create the gig directly on {engineerName}'s ShowPilot profile.
        </p>

        {/* Gig Info */}
        <CollapsibleSection title="Gig Info" icon={Info} defaultOpen={true}>
          <div className="space-y-3 pt-3">
            <div>
              <Label className="text-white/50 text-xs">Event Name</Label>
              <Input value={form.event_name || ""} onChange={(e) => update("event_name", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="e.g. Friday Night Showcase" />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Artist / Group Name *</Label>
              <Input value={form.band_name} onChange={(e) => update("band_name", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Band / Artist" />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white [color-scheme:dark] w-44" />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Event Type</Label>
              <Select
                value={form.event_type}
                onValueChange={(v) => {
                  if (v === "__add_new__") {
                    const newType = window.prompt("Enter a custom event type:");
                    if (newType && newType.trim()) update("event_type", newType.trim());
                  } else {
                    update("event_type", v);
                  }
                }}
              >
                <SelectTrigger className="mt-1 h-10 bg-[#111] border-[#222] text-white w-48">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                  {form.event_type && !EVENT_TYPES.includes(form.event_type) && (
                    <SelectItem key={form.event_type} value={form.event_type}>{form.event_type}</SelectItem>
                  )}
                  <SelectItem value="__add_new__">Other / Add New</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/50 text-xs">Venue</Label>
              <Input value={form.venue} onChange={(e) => update("venue", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="Venue name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/50 text-xs">City</Label>
                <Input value={form.city} onChange={(e) => update("city", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="City" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">State</Label>
                <Select value={form.state} onValueChange={(v) => update("state", v)}>
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
            <div>
              <Label className="text-white/50 text-xs">Genre / Style</Label>
              <div className="mt-1 flex flex-wrap gap-1.5 p-2 bg-[#111] border border-[#222] rounded-lg min-h-[42px]">
                {form.genre_tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#8CFF3D]/15 text-[#8CFF3D]"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeGenreTag(tag)}
                      className="hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = genreInput.trim();
                    if (trimmed && !form.genre_tags.includes(trimmed)) {
                      update("genre_tags", [...form.genre_tags, trimmed]);
                    }
                    setGenreInput("");
                  }}
                  className="flex-1 min-w-[100px]"
                >
                  <input
                    value={genreInput}
                    onChange={(e) => setGenreInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !genreInput && form.genre_tags.length > 0) {
                        update("genre_tags", form.genre_tags.slice(0, -1));
                      }
                    }}
                    placeholder={form.genre_tags.length === 0 ? "Type a genre, hit Enter..." : "Add another..."}
                    className="w-full bg-transparent text-white text-sm outline-none placeholder:text-white/25"
                  />
                </form>
              </div>
            </div>
            <div>
              <Label className="text-white/50 text-xs">Set Length (minutes)</Label>
              <Input
                type="number"
                value={form.set_length_minutes}
                onChange={(e) => update("set_length_minutes", e.target.value)}
                className="mt-1 bg-[#111] border-[#222] text-white w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="e.g. 60"
              />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Console (if known)</Label>
              <Input value={form.console} onChange={(e) => update("console", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="e.g. Yamaha CL5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/50 text-xs">WiFi Network</Label>
                <Input value={form.wifi_network} onChange={(e) => update("wifi_network", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">WiFi Password</Label>
                <Input value={form.wifi_password} onChange={(e) => update("wifi_password", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Contacts */}
        <CollapsibleSection title="Contacts" icon={Users} badge={form.contacts.length}>
          <div className="space-y-3 pt-3">
            {form.contacts.map((c, i) => (
              <div key={i} className="bg-[#111] rounded-xl p-3">
                <div className="flex justify-between items-start">
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <Input value={c.name} onChange={(e) => updateContact(i, "name", e.target.value)} placeholder="Name" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                    <Input value={c.role} onChange={(e) => updateContact(i, "role", e.target.value)} placeholder="Role" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                    <Input value={c.phone} onChange={(e) => updateContact(i, "phone", formatPhoneNumber(e.target.value))} placeholder="Phone" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                    <Input value={c.email} onChange={(e) => updateContact(i, "email", e.target.value)} placeholder="Email" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                  </div>
                  <button onClick={() => removeContact(i)} className="p-1.5 ml-2 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addContact} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact
            </Button>
          </div>
        </CollapsibleSection>

        {/* Stage Plot */}
        <CollapsibleSection title="Stage Plot" icon={ImageIcon}>
          <div className="pt-3 space-y-3">
            {form.stage_plot_files.length > 0 && (
              <div className="space-y-2">
                {form.stage_plot_files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-[#111] rounded-xl p-2">
                    {f.type?.startsWith("image/") ? (
                      <img src={f.url} alt={f.name} className="w-12 h-12 object-cover rounded-lg border border-[#222]" />
                    ) : (
                      <div className="w-12 h-12 flex items-center justify-center bg-[#1a1a1a] rounded-lg border border-[#222]">
                        <FileText className="w-5 h-5 text-white/40" />
                      </div>
                    )}
                    <span className="flex-1 text-sm text-white/60 truncate">{f.name}</span>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#8CFF3D] hover:underline">View</a>
                    <button onClick={() => removeStagePlotFile(i)} className="p-1 text-white/30 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center gap-3 py-4 border-2 border-dashed border-[#222] rounded-xl cursor-pointer hover:border-[#8CFF3D]/30 transition-colors px-4">
              <Paperclip className="w-5 h-5 text-white/30" />
              <span className="text-sm text-white/40">
                {uploadingStagePlot ? "Uploading..." : "Upload images or files"}
              </span>
              <input type="file" accept="image/*,.pdf,.png,.jpg,.jpeg" multiple className="hidden" onChange={handleStagePlotUpload} disabled={uploadingStagePlot} />
            </label>
          </div>
        </CollapsibleSection>

        {/* Band Members */}
        <CollapsibleSection title="Band Members" icon={Music} badge={form.band_members.length}>
          <div className="space-y-3 pt-3">
            {form.band_members.map((m, i) => (
              <div key={i} className="bg-[#111] rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={m.name} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Name" className="flex-1 h-8 bg-transparent border-[#222] text-white text-sm" />
                  <button onClick={() => removeMember(i)} className="p-1.5 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/30 text-[10px] uppercase tracking-widest font-medium">Instruments / Roles</Label>
                  {getInstruments(m).map((inst, ii) => (
                    <div key={ii} className="flex items-center gap-1.5">
                      <Input
                        value={inst.name}
                        onChange={(e) => updateInstrument(i, ii, "name", e.target.value)}
                        placeholder="e.g. Guitar"
                        className="flex-1 h-8 bg-[#1a1a1a] border-[#222] text-white text-sm"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        {["Mic", "DI"].map((type) => {
                          const active = (inst.mic_di || "Mic") === type;
                          return (
                            <button
                              key={type}
                              onClick={() => updateInstrument(i, ii, "mic_di", type)}
                              className={`h-8 px-2.5 rounded-lg text-xs font-semibold border transition-all ${active ? "border-blue-400/50 text-blue-400 bg-blue-500/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                            >
                              {type}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => updateInstrument(i, ii, "phantom_power", !inst.phantom_power)}
                        className={`h-8 px-2.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${inst.phantom_power ? "border-amber-400/50 text-amber-400 bg-amber-500/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                      >
                        +48V
                      </button>
                      <button onClick={() => removeInstrument(i, ii)} className="p-1.5 text-white/30 hover:text-red-400 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => addInstrument(i)} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full h-8 text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Instrument
                  </Button>
                </div>
                <div className="flex gap-3 pl-0.5">
                  {["IEM", "Monitor"].map((type) => (
                    <button
                      key={type}
                      onClick={() => updateMember(i, "bus_type", m.bus_type === type ? "" : type)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${m.bus_type === type ? "border-[#8CFF3D]/50 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addMember} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Member
            </Button>
          </div>
        </CollapsibleSection>

        {/* Openers — optional, if the manager knows the info */}
        <CollapsibleSection title="Openers" icon={Users} badge={form.openers.length}>
          <div className="space-y-4 pt-3">
            <p className="text-white/30 text-xs -mt-1">If you know who's opening, add them here. Otherwise the engineer can send a separate link directly to each opener.</p>
            {form.openers.map((o, i) => (
              <div key={i} className="bg-[#111] rounded-xl p-3 space-y-3 border border-[#222]">
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-xs font-semibold uppercase tracking-wide">Opener {i + 1}</span>
                  <button onClick={() => removeOpener(i)} className="p-1 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Input value={o.band_name} onChange={(e) => updateOpener(i, "band_name", e.target.value)} placeholder="Band / Artist Name" className="h-9 bg-[#1a1a1a] border-[#222] text-white text-sm" />
                <div>
                  <Label className="text-white/40 text-xs">Set Length (minutes)</Label>
                  <Input
                    type="number"
                    value={o.set_length_minutes}
                    onChange={(e) => updateOpener(i, "set_length_minutes", e.target.value)}
                    className="mt-1 h-9 bg-[#1a1a1a] border-[#222] text-white text-sm w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="e.g. 30"
                  />
                </div>
                <div>
                  <Label className="text-white/40 text-xs">Genre / Style</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5 p-2 bg-[#1a1a1a] border border-[#222] rounded-lg min-h-[38px]">
                    {o.genre_tags.map((tag) => (
                      <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#8CFF3D]/15 text-[#8CFF3D]">
                        {tag}
                        <button type="button" onClick={() => removeOpenerGenreTag(i, tag)} className="hover:text-white"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = openerGenreInputs[i] || "";
                        const trimmed = val.trim();
                        if (trimmed && !form.openers[i].genre_tags.includes(trimmed)) {
                          updateOpener(i, "genre_tags", [...form.openers[i].genre_tags, trimmed]);
                        }
                        setOpenerGenreInputs((s) => ({ ...s, [i]: "" }));
                      }}
                      className="flex-1 min-w-[80px]"
                    >
                      <input
                        value={openerGenreInputs[i] || ""}
                        onChange={(e) => setOpenerGenreInputs((s) => ({ ...s, [i]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace" && !(openerGenreInputs[i] || "") && form.openers[i].genre_tags.length > 0) {
                            updateOpener(i, "genre_tags", form.openers[i].genre_tags.slice(0, -1));
                          }
                        }}
                        placeholder="Type a genre, hit Enter..."
                        className="w-full bg-transparent text-white text-xs outline-none placeholder:text-white/25"
                      />
                    </form>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/40 text-xs">Band Members</Label>
                  {o.band_members.map((m, mi) => (
                    <div key={mi} className="bg-[#1a1a1a] rounded-lg p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <Input value={m.name} onChange={(e) => updateOpenerMember(i, mi, "name", e.target.value)} placeholder="Name" className="h-7 bg-transparent border-[#222] text-white text-xs" />
                          <Input value={m.instrument} onChange={(e) => updateOpenerMember(i, mi, "instrument", e.target.value)} placeholder="Instrument/Role" className="h-7 bg-transparent border-[#222] text-white text-xs" />
                        </div>
                        <button onClick={() => removeOpenerMember(i, mi)} className="p-1 text-white/30 hover:text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        {["IEM", "Monitor"].map((type) => (
                          <button
                            key={type}
                            onClick={() => updateOpenerMember(i, mi, "bus_type", m.bus_type === type ? "" : type)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${m.bus_type === type ? "border-[#8CFF3D]/50 text-[#8CFF3D] bg-[#8CFF3D]/10" : "border-[#333] text-white/40 hover:text-white/60"}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => addOpenerMember(i)} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Add Member
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addOpener} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Opener
            </Button>
          </div>
        </CollapsibleSection>

        {/* Notes */}
        <div className="bg-[#111] rounded-2xl p-4">
          <Label className="text-white/50 text-xs mb-2 block">Additional Notes</Label>
          <Textarea value={form.general_notes} onChange={(e) => update("general_notes", e.target.value)} className="bg-[#0d0d0d] border-[#222] text-white min-h-[100px]" placeholder="Anything else the engineer should know..." />
        </div>

        {error && <p className="text-red-400 text-sm px-1">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-12 rounded-xl font-semibold text-base"
        >
          <Send className="w-4 h-4 mr-2" />
          {submitting ? "Submitting..." : "Submit to Engineer"}
        </Button>
      </div>
    </div>
  );
}
