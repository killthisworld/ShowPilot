import React, { useState, useEffect } from "react";
import { setMemberVocals } from "@/components/showpilot/VocalsQuestion";
import { usePersistedState, clearPersistedState } from "@/hooks/usePersistedState";
import { supabase } from "@/api/supabaseClient";
import { fetchMyArtistProfile } from "@/lib/roleTemplates";

import IntakeRating from "@/components/showpilot/IntakeRating";
import MultitrackQuestion from "@/components/showpilot/MultitrackQuestion";
import IntakeKeyWeb, { IntakeSent } from "@/components/showpilot/IntakeKeyWeb";
import EventOverviewCard from "@/components/showpilot/EventOverviewCard";
import { intakeCircles } from "@/components/showpilot/IntakeFields";
import { Disc3 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";


// `link` comes from a short /intake/<code> link (IntakeShortLink); the long
// /opener-intake?token=... link uses the URL instead.
export default function OpenerIntake({ link } = {}) {
  const params = new URLSearchParams(window.location.search);
  const token = link?.token || params.get("token");

  const [context, setContext] = useState(null);
  const [loadingView, setLoadingView] = useState(true);
  const [form, setForm] = usePersistedState(`opener_intake_draft_${token}`, {
    role: "Opener",
    band_name: "",
    genre_tags: [],
    band_members: [],
    set_length_minutes: "",
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
  const [currentUser, setCurrentUser] = useState(null);
  const [engineerCard, setEngineerCard] = useState(null);
  const [shareMyCard, setShareMyCard] = useState(false);
  const [genreInput, setGenreInput] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  // Which circles the act has saved on their web (job 195).
  const [seen, setSeen] = usePersistedState(`opener_intake_seen_${token}`, {});
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
  const [sentOff, setSentOff] = useState(false); // the send-off animation has played (job 200)
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (!token) { setLoadingView(false); return; }
      try {
        // Token lookup: this opener's status plus the show they're joining.
        const { data } = await supabase.rpc("get_opener_request", { p_token: token });
        if (data) setContext(data);
      } catch (e) {
        console.error(e);
      }
      setLoadingView(false);
    };
    init();
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      setCurrentUser(u);
    });
  }, [token]);

  useEffect(() => {
    const engineerUserId = context?.tour_manager_requests?.engineer_user_id;
    if (!engineerUserId) return;
    supabase
      .from("user_preferences")
      .select("display_name, job_title, profile_photo_url, card_bg_color, card_bg_image_url, card_text_color, card_share_token")
      .eq("user_id", engineerUserId)
      .maybeSingle()
      .then(({ data }) => setEngineerCard(data));
  }, [context]);

  useEffect(() => {
    if (currentUser && shareMyCard) {
      setForm((f) => ({ ...f, submitter_card_user_id: currentUser.id }));
    } else if (!shareMyCard) {
      setForm((f) => ({ ...f, submitter_card_user_id: "" }));
    }
  }, [shareMyCard, currentUser]);

  const update = (field, val) => setForm((s) => ({ ...s, [field]: val }));
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
  const updateMember = (i, f, v) => { const m = [...form.band_members]; m[i] = { ...m[i], [f]: v }; update("band_members", m); };
  const removeMember = (i) => {
    update("band_members", form.band_members.filter((_, idx) => idx !== i));
    setNotesTarget("__general__");
  };
  const [notesTarget, setNotesTarget] = useState("__general__");
  const getActiveNotes = () => notesTarget === "__general__" ? form.general_notes : (form.band_members[notesTarget]?.notes || "");
  const setActiveNotes = (val) => notesTarget === "__general__" ? update("general_notes", val) : updateMember(notesTarget, "notes", val);

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

  const removeGenreTag = (tag) => update("genre_tags", form.genre_tags.filter((t) => t !== tag));

  const handleSubmit = async () => {
    if (!form.band_name) {
      setError("Artist / group name is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc("submit_opener_request", {
        p_token: token,
        p_form: form,
      });
      if (rpcError) throw rpcError;
      clearPersistedState(`opener_intake_draft_${token}`);
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

  if (!token || !context) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Invalid link</p>
          <p className="text-white/30 text-sm">This intake link is not valid.</p>
        </div>
      </div>
    );
  }

  const parent = context.tour_manager_requests;
  const showTitle = parent?.event_name || parent?.band_name || "Your show";
  const dayLine = [parent?.date ? new Date(parent.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "", parent?.venue].filter(Boolean).join(" · ");
  const engineerName = engineerCard?.display_name || "Your audio engineer";

  if ((submitted && sentOff) || context.status === "submitted") {
    return (
      <IntakeSent seed={token} title="Sent!" line={`Your set info is on the event${parent?.band_name ? ` with ${parent.band_name}` : ""}.`}>
        {submitted && <IntakeRating token={token} />}
      </IntakeSent>
    );
  }

  // The Opener Set Info form as an access key and web (job 195).
  const h = {
    form, update, genreInput, setGenreInput, removeGenreTag,
    getInstruments, addMember, updateMember, removeMember, addInstrument, updateInstrument, removeInstrument, setVocals,
    handleStagePlotUpload, removeStagePlotFile,
    notesTarget, setNotesTarget, getActiveNotes, setActiveNotes,
    fillFromProfile: { onClick: handleLoadTemplate, loading: loadingTemplate },
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
  const circles = intakeCircles(h, { seen, card: { onCard, cardOn: shareMyCard, showCard: true } });
  return (
    <IntakeKeyWeb
      seed={token}
      image={engineerCard?.profile_photo_url || ""}
      keyCode={link?.code ? String(link.code).toUpperCase() : ""}
      fromLine={`${engineerName} (Audio) sent you a key to`}
      title={showTitle}
      dateLine={dayLine}
      actName={form.band_name}
      center={{
        name: engineerName, photo: engineerCard?.profile_photo_url || "", label: "Audio",
        href: engineerCard?.card_share_token ? `/pilot/${engineerCard.card_share_token}` : "",
      }}
      circles={circles}
      onSave={(key) => setSeen((v) => ({ ...(v || {}), [key]: true }))}
      corner={context.include_services ? {
        label: "Additional services", icon: Disc3, done: form.multitrack_interest === true || form.multitrack_interest === false,
        body: () => <MultitrackQuestion value={form.multitrack_interest ?? null} onChange={(v) => update("multitrack_interest", v)} />,
      } : null}
      show={() => (
        <div className="flex flex-col gap-3 text-center">
          <EventOverviewCard ov={{ image: parent?.image || "", event_type: parent?.event_type }} title={showTitle} date={parent?.date} venue={parent?.venue} color="#8CFF3D" />
          {parent?.band_name && <div className="text-[14px] text-white/75">You're joining {parent.band_name}</div>}
        </div>
      )}
      needLine={!form.band_name ? "Your artist name is needed to send." : ""}
      canSend={!!form.band_name}
      onSend={handleSubmit}
      sending={submitting}
      sendLabel="Submit"
      sent={submitted}
      onSentOff={() => setSentOff(true)}
      error={error || ""}
    />
  );
}
