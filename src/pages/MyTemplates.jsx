import React, { useState, useEffect, useRef } from "react";
import BottomTabs from "@/components/showpilot/BottomTabs";
import { useGoBack } from "@/lib/navHistory";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { usePreferences } from "@/hooks/usePreferences";
import useIsDesktop from "@/hooks/useIsDesktop";
import VenueInfoFields from "@/components/showpilot/VenueInfoFields";
import PerformerFields from "@/components/showpilot/PerformerFields";
import StageEditor from "@/components/showpilot/StageEditor";
import StagePlotPdfActions from "@/components/showpilot/StagePlotBuilder";
import { instrumentsOf, StagePlotView, ActStagePlotButton } from "@/components/showpilot/StagePlotView";
import FxNotesWindow, { ActNotesButton } from "@/components/showpilot/FxNotesWindow";
import ApplyTemplateSheet from "@/components/showpilot/ApplyTemplateSheet";
import RoleWorkspace from "@/components/showpilot/RoleWorkspace";
import { emptyVenueTemplate, emptyArtistTemplate, normalizeVenueTemplate, normalizeArtistTemplate } from "@/lib/showTemplates";
import { COMPANY_TEMPLATE_ROLES, gigFromTemplate, templateFromGig, templateSubtitle } from "@/lib/roleTemplates";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { addGenreTag } from "@/lib/eventTypes";
import TemplatePlansSheet, { useTemplatePlan, templateLimitKind } from "@/components/showpilot/TemplatePlans";

// One group per template kind, in the profile colors. Venue + Artist use
// the show's own Venue Info / Performer fields for audio and lighting
// accounts; company accounts (venue, manager /
// artist) edit their section templates in the same workspace tabs they
// use on an event (RoleWorkspace in template mode).
const GROUP = {
  venue: { style: ACCOUNT_TYPE_STYLES.venue, label: "Venue", plural: "Venues" },
  manager: { style: ACCOUNT_TYPE_STYLES.manager, label: "Manager", plural: "Manager / Artist" },
  artist: { style: ACCOUNT_TYPE_STYLES.band, label: "Artist", plural: "Artists" },
};
const EMPTY_NOTE = {
  tech: {
    venue: "No venue templates yet. Save one for a room you work often, even if it doesn't use ShowPilot.",
    artist: "No artist templates yet. Save one for an artist you work with repeatedly.",
  },
  company: {
    venue: "Your room, once: address, load-in, schedule, house gear, hospitality. Load it on every show. Other rooms come from your Fellow Pilots.",
    manager: "Your side, once: contact, advance checklist, vehicle, standing guest list and merch.",
    artist: "Each act you manage or book: members, genres, stage plot and notes. Load it as an act in the lineup, or into a performer intake.",
  },
};

const MANAGER_SIDE = { band: "manager", manager: "manager" };
const IMPORT_FLAG = "showpilot_band_template_imported";

const emptyData = (category) => (category === "venue" ? emptyVenueTemplate() : category === "artist" ? emptyArtistTemplate() : { section: {}, gig: {} });
const normalizeData = (category, data) => (category === "venue" ? normalizeVenueTemplate(data || {}) : category === "artist" ? normalizeArtistTemplate(data || {}) : { section: {}, gig: {}, ...(data || {}) });

export default function MyTemplates() {
  const goBack = useGoBack();
  const desktop = useIsDesktop();
  const { toast } = useToast();
  const { preferences, reload: reloadPreferences } = usePreferences();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]); // { key, id, category, name, data, open, saving, saved }
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [editing, setEditing] = useState(null); // workspace editor: { key, role, name, gig }
  const [edSaving, setEdSaving] = useState(false);
  const [edSaved, setEdSaved] = useState(false);
  // An artist template's notes window and full stage page (job 73): the same
  // Notes and Stage Plot buttons as an act on a show. Each holds the
  // template's key.
  const [notesKey, setNotesKey] = useState(null);
  const [stageKey, setStageKey] = useState(null);
  const stageChanged = useRef(false);
  // "Put on your dates" (job 73, On the road stage 4): the template's key.
  const [applyKey, setApplyKey] = useState(null);
  // Wallets (like Fellow Pilots): each template kind is a wallet; swipe one
  // left to see its templates.
  const [activeCat, setActiveCat] = useState(null);
  const [openCat, setOpenCat] = useState(null);
  const drag = useRef({ on: false, cat: null, x0: 0, moved: false, dx: 0 });
  const [swipe, setSwipe] = useState({ cat: null, dx: 0 });

  const accountType = preferences?.account_type || "engineer";
  const isTech = ["engineer", "lighting"].includes(accountType);
  const own = MANAGER_SIDE[accountType] || accountType;
  // Wallets (job 124): techs keep Venue + Artist (as many as they like).
  // Company accounts build only their own (job 295): a venue keeps one venue
  // template; a manager / artist keeps one manager template and their acts
  // (1 free, more on a plan). The database holds the same rule.
  const WALLETS = isTech
    ? [{ id: "venue", cats: ["venue"] }, { id: "artist", cats: ["artist"] }]
    : own === "venue" ? [{ id: "venue", cats: ["venue"] }] : [{ id: "manager", cats: ["manager", "artist"] }];
  const { plan: tplPlan, reload: reloadPlan, setPlan: setTplPlan } = useTemplatePlan(!isTech && !!preferences);
  const [plansOpen, setPlansOpen] = useState(false);
  const walletOf = (id) => WALLETS.find((w) => w.id === id) || WALLETS[0];
  const walletTitle = (id) => (!isTech && id === "venue" ? "Your venue" : GROUP[id].plural);
  const workspaceKind = (category) => !isTech && COMPANY_TEMPLATE_ROLES.includes(category);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data, error } = await supabase
          .from("saved_templates")
          .select("id, category, name, data")
          .eq("owner_id", user.id)
          .order("category")
          .order("name");
        if (error) {
          console.error(error);
        } else {
          let rows = data || [];
          rows = await importOldArtistTemplate(user, rows);
          setTemplates(rows.map((t) => ({ key: `id:${t.id}`, id: t.id, category: t.category, name: t.name, data: normalizeData(t.category, t.data), open: false, saving: false, saved: false })));
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  // Templates live in the account (saved_templates), so a change on the
  // phone shows up on the desktop and back (job 124): refetch when this page
  // comes back into view and every 20s while it's open. Anything being
  // edited here right now (open, new or in the editor) is kept as it is.
  const editingKeyRef = useRef(null);
  useEffect(() => { editingKeyRef.current = editing?.key || null; }, [editing]);
  useEffect(() => {
    if (!user) return undefined;
    let stop = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await supabase.from("saved_templates").select("id, category, name, data").eq("owner_id", user.id).order("category").order("name");
      if (stop || error || !data) return;
      setTemplates((prev) => {
        const busy = prev.filter((t) => !t.id || t.open || t.saving || t.key === editingKeyRef.current);
        const busyIds = new Set(busy.filter((t) => t.id).map((t) => t.id));
        const fresh = data.filter((t) => !busyIds.has(t.id)).map((t) => {
          const old = prev.find((o) => o.id === t.id);
          return { key: `id:${t.id}`, id: t.id, category: t.category, name: t.name, data: normalizeData(t.category, t.data), open: false, saving: false, saved: !!old?.saved };
        });
        // Keep an open one only if it still exists (deleted elsewhere = gone).
        const kept = busy.filter((t) => !t.id || data.some((d) => d.id === t.id));
        return [...fresh, ...kept].sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.name || "").localeCompare(b.name || ""));
      });
    };
    const onVis = () => refresh();
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    const iv = setInterval(refresh, 20000);
    return () => { stop = true; window.removeEventListener("focus", onVis); document.removeEventListener("visibilitychange", onVis); clearInterval(iv); };
  }, [user]);

  // Artist accounts used to keep one artist profile on user_preferences
  // (the old My Templates page). Bring it in once as an Artist template.
  async function importOldArtistTemplate(user, rows) {
    try {
      if (rows.some((r) => r.category === "artist")) return rows;
      if (localStorage.getItem(`${IMPORT_FLAG}:${user.id}`)) return rows;
      const { data } = await supabase.from("user_preferences").select("band_template").eq("user_id", user.id).maybeSingle();
      const t = data?.band_template;
      localStorage.setItem(`${IMPORT_FLAG}:${user.id}`, "1");
      if (!t || (!t.band_name && !(t.band_members || []).length)) return rows;
      const { band_name, documents, ...rest } = t;
      const { data: inserted, error } = await supabase
        .from("saved_templates")
        .insert({ owner_id: user.id, category: "artist", name: band_name || "My artist", data: rest })
        .select("id, category, name, data")
        .single();
      return error ? rows : [...rows, inserted];
    } catch {
      return rows;
    }
  }

  const setTemplate = (key, updater) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.key === key);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = typeof updater === "function" ? updater(next[idx]) : { ...next[idx], ...updater };
      return next;
    });
  };
  const setData = (key, field, val) => setTemplate(key, (t) => ({ ...t, data: { ...t.data, [field]: val } }));

  const openEditor = (t) => {
    setEdSaved(false);
    setEditing({ key: t.key, role: t.category, name: t.name, gig: { id: `tpl_${user?.id}`, ...gigFromTemplate(t.category, t.name, t.data) } });
  };

  const addTemplate = (category) => {
    const key = `new:${Date.now()}`;
    const t = { key, id: null, category, name: "", data: emptyData(category), open: !workspaceKind(category), saving: false, saved: false };
    setTemplates((prev) => [...prev, t]);
    if (workspaceKind(category)) openEditor(t);
  };

  const toggleOpen = (key) => setTemplate(key, (t) => ({ ...t, open: !t.open }));

  // Genres come from the person's genre list, same as on a show; "+" or
  // tapping a genre that isn't on the list yet adds it there.
  const addGenre = async (presetName) => {
    const name = (presetName ?? window.prompt("Add a genre:") ?? "").trim();
    if (!name) return;
    try {
      await addGenreTag(preferences, name);
      await reloadPreferences();
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't add that genre", variant: "destructive" });
    }
  };

  const uploadFileToBucket = async (file) => {
    const filePath = `saved_templates/${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("stage-plots").upload(filePath, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("stage-plots").getPublicUrl(filePath);
    return urlData.publicUrl;
  };
  const handleStagePlotUpload = async (key, e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const file_url = await uploadFileToBucket(file);
        const isImage = file.type.startsWith("image/");
        setTemplate(key, (t) => ({
          ...t,
          data: {
            ...t.data,
            stage_plot_url: isImage && !t.data.stage_plot_url ? file_url : t.data.stage_plot_url,
            stage_plot_files: [...(t.data.stage_plot_files || []), { url: file_url, name: file.name, type: file.type }],
          },
        }));
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = "";
  };

  // Insert or update one template row. Returns the saved row's key.
  const writeTemplate = async (t, name, data) => {
    if (t.id) {
      const { error } = await supabase.from("saved_templates").update({ name, data, updated_at: new Date().toISOString() }).eq("id", t.id);
      if (error) throw error;
      setTemplate(t.key, { name, data });
      return t.key;
    }
    const { data: inserted, error } = await supabase
      .from("saved_templates")
      .insert({ owner_id: user.id, category: t.category, name, data })
      .select()
      .single();
    if (error) throw error;
    const key = `id:${inserted.id}`;
    setTemplate(t.key, { id: inserted.id, key, name, data });
    return key;
  };

  const saveTemplate = async (key) => {
    const t = templates.find((tt) => tt.key === key);
    if (!t || !user) return;
    if (!t.name.trim()) {
      toast({ title: `Give this ${GROUP[t.category].label.toLowerCase()} template a name first`, variant: "destructive" });
      return;
    }
    setTemplate(key, { saving: true });
    try {
      const finalKey = await writeTemplate(t, t.name.trim(), t.data);
      setTemplate(finalKey, { saved: true, saving: false });
      setTimeout(() => setTemplate(finalKey, { saved: false }), 2000);
      toast({ title: "Template saved" });
    } catch (e) {
      console.error(e);
      if (!limitToast(e, t.category)) toast({ title: "Error saving template", variant: "destructive" });
      setTemplate(key, { saving: false });
    }
    if (!isTech) reloadPlan();
  };

  // Save from the workspace editor.
  const saveEditor = async () => {
    if (!editing || !user) return;
    const t = templates.find((tt) => tt.key === editing.key);
    if (!t) return;
    const name = (editing.name || (editing.role === "venue" ? editing.gig.venue : "") || "").trim();
    if (!name) {
      toast({ title: `Give this ${GROUP[editing.role].label.toLowerCase()} template a name first`, variant: "destructive" });
      return;
    }
    setEdSaving(true);
    try {
      // Keep fields this editor doesn't show (e.g. an engineer's venue contacts).
      const data = { ...(t.data || {}), ...templateFromGig(editing.role, editing.gig) };
      const key = await writeTemplate(t, name, data);
      setEditing((e) => (e ? { ...e, key, name } : e));
      setEdSaved(true);
      setTimeout(() => setEdSaved(false), 1800);
    } catch (e) {
      console.error(e);
      if (!limitToast(e, editing.role)) toast({ title: "Error saving template", description: "Check your connection and try again.", variant: "destructive" });
    }
    setEdSaving(false);
  };

  const closeEditor = () => {
    // Drop a brand-new template that was never saved.
    if (editing) {
      const t = templates.find((tt) => tt.key === editing.key);
      if (t && !t.id) setTemplates((prev) => prev.filter((tt) => tt.key !== t.key));
    }
    setEditing(null);
  };

  const deleteTemplate = async (key) => {
    const t = templates.find((tt) => tt.key === key);
    if (!t) return;
    try {
      if (t.id) {
        const { error } = await supabase.from("saved_templates").delete().eq("id", t.id);
        if (error) throw error;
      }
      setTemplates((prev) => prev.filter((tt) => tt.key !== key));
      setConfirmDeleteKey(null);
      toast({ title: "Template deleted" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error deleting template", variant: "destructive" });
    }
  };

  const summaryLine = (t) => {
    if (workspaceKind(t.category) || !["venue", "artist"].includes(t.category)) return templateSubtitle(t.category, t.data);
    if (t.category === "venue") {
      return [[t.data.city, t.data.state].filter(Boolean).join(", "), t.data.console].filter(Boolean).join(" · ");
    }
    return [(t.data.genre_tags || []).join(", "), t.data.band_members?.length ? `${t.data.band_members.length} member${t.data.band_members.length !== 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  const busPresets = preferences?.mix_bus_presets || [];
  const iemMonitorColors = {
    IEM: busPresets.find((p) => p.bus_type === "IEM")?.color || "#EAB308",
    Monitor: busPresets.find((p) => p.bus_type === "Monitor")?.color || "#F97316",
  };

  const deleteControls = (t) => (confirmDeleteKey === t.key ? (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={() => deleteTemplate(t.key)} className="text-xs font-bold tracking-[0.06em] px-3 py-2 rounded-xl bg-red-500/20 text-red-400">DELETE</button>
      <button onClick={() => setConfirmDeleteKey(null)} className="text-xs font-bold tracking-[0.06em] px-3 py-2 rounded-xl bg-white/5 text-white/50">KEEP</button>
    </div>
  ) : (
    <button onClick={() => setConfirmDeleteKey(t.key)} aria-label="Delete template" className="p-2.5 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 shrink-0">
      <Trash2 className="w-4 h-4" />
    </button>
  ));

  const listFor = (category) => templates.filter((t) => t.category === category && (t.id || !workspaceKind(category)));
  const listForWallet = (w) => w.cats.flatMap((c) => listFor(c));
  // What a company account may still add (job 295): one venue / manager
  // template, and acts up to the plan (null = no limit).
  const savedCount = (c) => templates.filter((t) => t.category === c && t.id).length;
  const actsLimit = tplPlan ? tplPlan.acts_limit : 1;
  const canAdd = (c) => isTech || (c === "artist" ? actsLimit == null || savedCount("artist") < actsLimit : savedCount(c) === 0)
    && !templates.some((t) => t.category === c && !t.id && !isTech && c !== "artist");
  const limitToast = (e, category) => {
    const kind = templateLimitKind(e);
    if (kind === "acts") { setPlansOpen(true); return true; }
    if (kind === "one") { toast({ title: `You already have your ${GROUP[category]?.label.toLowerCase() || ""} template`, description: "Edit that one instead.", variant: "destructive" }); return true; }
    return false;
  };

  // The templates inside one wallet. A wallet with two kinds (Manager /
  // Artist) tags each row with its kind.
  const templateList = (w) => {
    const list = listForWallet(w);
    const mixed = w.cats.length > 1;
    return (
      <>
        <div className="px-3 pb-3 space-y-2">
          {list.length === 0 && (
            <p className="px-1 pb-1 text-[14px] leading-snug text-white/40">{w.cats.map((c) => EMPTY_NOTE[isTech ? "tech" : "company"][c]).join(" ")}</p>
          )}
          {list.map((t) => {
            const category = t.category;
            const g = GROUP[category];
            const color = g.style.color;
            const kindTag = mixed && <span className="shrink-0 text-[10px] tracking-[0.1em] px-1.5 py-[2px] rounded" style={{ fontFamily: SCENE_MONO, color, background: color + "1f" }}>{g.label.toUpperCase()}</span>;
            return (workspaceKind(category) ? (
            <div key={t.key} className="flex items-center gap-1 rounded-xl bg-[#161616] border border-[#242424]" style={{ borderLeft: `3px solid ${color}` }}>
              <button type="button" onClick={() => openEditor(t)} className="flex-1 min-w-0 flex items-center gap-2 px-3.5 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><span className="block text-[16px] font-semibold text-white truncate">{t.name}</span>{kindTag}</span>
                  {summaryLine(t) && <span className="block text-[13px] text-white/45 truncate mt-0.5">{summaryLine(t)}</span>}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: color + "aa" }} />
              </button>
              <div className="pr-1.5">{deleteControls(t)}</div>
            </div>
          ) : (
            <div key={t.key} className="rounded-xl border overflow-hidden" style={{ borderColor: color + "40", borderLeftWidth: 3, borderLeftColor: color }}>
              <button type="button" onClick={() => toggleOpen(t.key)} className="w-full flex items-center justify-between gap-2 px-3.5 py-3 bg-[#161616]">
                <div className="min-w-0 text-left">
                  <p className="flex items-center gap-2"><span className="text-[16px] font-semibold text-white truncate">{t.name || `Untitled ${g.label.toLowerCase()}`}</span>{kindTag}</p>
                  {!t.open && summaryLine(t) && <p className="text-[13px] text-white/45 truncate mt-0.5">{summaryLine(t)}</p>}
                </div>
                <ChevronDown className={`w-4 h-4 text-white/40 transition-transform shrink-0 ${t.open ? "rotate-180" : ""}`} />
              </button>
              {t.open && (
                <div className="p-4 space-y-3 bg-[#141414]">
                  {category === "venue" ? (
                    <VenueInfoFields
                      value={{ ...t.data, venue: t.name }}
                      onChange={(field, val) => (field === "venue" ? setTemplate(t.key, { name: val }) : setData(t.key, field, val))}
                      namePlaceholder="e.g. The Fillmore"
                    />
                  ) : (
                    <PerformerFields
                      band={{ ...t.data, band_name: t.name }}
                      onPatch={({ band_name, ...rest }) => setTemplate(t.key, (cur) => ({
                        ...cur,
                        ...(band_name !== undefined ? { name: band_name } : {}),
                        data: { ...cur.data, ...rest },
                      }))}
                      genreTags={preferences?.genre_tags || []}
                      onAddGenre={() => addGenre()}
                      onAddGenreFromTag={(name) => addGenre(name)}
                      iemMonitorColors={iemMonitorColors}
                      onStagePlotUpload={(e) => handleStagePlotUpload(t.key, e)}
                      // Notes and the stage plot, beside Set Length as on a
                      // show's act (job 73): notes open their window (General
                      // + a chip per member), the stage opens its full page.
                      setLengthAction={(
                        <div className="flex items-center gap-2">
                          <ActNotesButton act={{ ...t.data, band_name: t.name }} onClick={() => setNotesKey(t.key)} />
                          <ActStagePlotButton act={{ ...t.data, band_name: t.name }} always onClick={() => setStageKey(t.key)} />
                        </div>
                      )}
                      // Contact info (job 282), filled into intake forms.
                      afterName={(
                        <div className="space-y-1.5">
                          <span className="block text-white/40 text-[10px] uppercase tracking-widest font-medium">Contact</span>
                          <input value={t.data.contact_name || ""} onChange={(e) => setData(t.key, "contact_name", e.target.value)} placeholder="Name" aria-label="Contact name" autoComplete="name"
                            className="w-full min-h-[44px] rounded-lg bg-[#111] border border-[#262626] px-3 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30" />
                          <div className="grid grid-cols-2 gap-1.5">
                            <input value={t.data.contact_phone || ""} onChange={(e) => setData(t.key, "contact_phone", e.target.value)} placeholder="Phone" aria-label="Contact phone" type="tel" inputMode="tel" autoComplete="tel"
                              className="w-full min-h-[44px] rounded-lg bg-[#111] border border-[#262626] px-3 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30" />
                            <input value={t.data.contact_email || ""} onChange={(e) => setData(t.key, "contact_email", e.target.value)} placeholder="Email" aria-label="Contact email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email"
                              className="w-full min-h-[44px] rounded-lg bg-[#111] border border-[#262626] px-3 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30" />
                          </div>
                        </div>
                      )}
                      // The stage (job 254): who stands where and what they play,
                      // saved with the template and loaded into intake forms.
                      membersSlot={(
                        <StageEditor
                          members={t.data.band_members || []}
                          setMembers={(list) => setData(t.key, "band_members", list)}
                          getInstruments={instrumentsOf}
                          colors={preferences?.stage_plot_colors || null}
                          onRemoveMember={(i) => setData(t.key, "band_members", (t.data.band_members || []).filter((_, k) => k !== i))}
                        />
                      )}
                      stagePlotExtra={(
                        <StagePlotPdfActions
                          members={t.data.band_members || []}
                          getInstruments={instrumentsOf}
                          actName={t.name}
                          files={t.data.stage_plot_files || []}
                          onRemoveFile={(i) => setTemplate(t.key, (cur) => ({ ...cur, data: { ...cur.data, stage_plot_files: (cur.data.stage_plot_files || []).filter((_, k) => k !== i) } }))}
                          onAddFile={(file) => handleStagePlotUpload(t.key, { target: { files: [file], value: "" } })}
                          colors={preferences?.stage_plot_colors || null}
                        />
                      )}
                    />
                  )}
                  {t.category === "artist" && t.name.trim() && (
                    <button
                      type="button"
                      onClick={() => setApplyKey(t.key)}
                      className="w-full h-12 rounded-xl border text-[15px] font-semibold"
                      style={{ borderColor: GROUP.artist.style.color, color: GROUP.artist.style.color }}
                    >
                      Put on your dates
                    </button>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button onClick={() => saveTemplate(t.key)} disabled={t.saving} className="flex-1 bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e] rounded-xl">
                      {t.saving ? "Saving..." : t.saved ? "Saved ✓" : "Save Template"}
                    </Button>
                    {deleteControls(t)}
                  </div>
                </div>
              )}
            </div>
          ));
          })}
        </div>
      </>
    );
  };

  // ---- Wallets ----
  // One wallet per template kind, all shown full size (there's only ever one
  // of each). Swipe a wallet left to open it; on desktop a click opens it in
  // the panel on the right. Enter / Space also opens it.
  const SWIPE_OPEN = -70;
  const openWallet = (id) => { setOpenCat(id); setActiveCat(id); };
  const onDown = (e, category) => {
    if (e.target.closest("button")) return;
    drag.current = { on: true, cat: category, x0: e.clientX, moved: false, dx: 0 };
  };
  const onMove = (e) => {
    if (!drag.current.on) return;
    const dx = Math.min(0, e.clientX - drag.current.x0);
    if (Math.abs(dx) > 10) drag.current.moved = true;
    drag.current.dx = dx;
    setSwipe({ cat: drag.current.cat, dx });
  };
  const onUp = () => {
    if (!drag.current.on) return;
    const { cat, dx, moved } = drag.current;
    drag.current.on = false;
    if (dx < SWIPE_OPEN || (desktop && !moved)) openWallet(cat);
    setSwipe({ cat: null, dx: 0 });
  };

  const walletCard = (w) => {
    const category = w.id;
    const g = GROUP[category];
    const color = g.style.color;
    const Icon = g.style.icon;
    const n = listForWallet(w).length;
    const yours = !isTech && category === own;
    const dx = swipe.cat === category ? swipe.dx : 0;
    const selected = desktop && (openCat || WALLETS[0].id) === category;
    return (
      <div
        key={category}
        role="button"
        tabIndex={0}
        aria-label={`${walletTitle(category)} wallet, ${n} template${n === 1 ? "" : "s"}. ${desktop ? "Open" : "Swipe left to open"}`}
        onPointerDown={(e) => onDown(e, category)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openWallet(category); } }}
        className="relative rounded-2xl px-5 py-4 overflow-hidden select-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white"
        style={{
          height: 150,
          background: `linear-gradient(135deg, ${color}, ${color}b3)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 12px 26px rgba(0,0,0,0.45)${selected ? ", 0 0 0 2px #fff" : ""}`,
          transform: `translateX(${dx}px)`,
          transition: drag.current.on ? "none" : "transform .25s ease-out",
          touchAction: "pan-y",
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 15% -10%, rgba(255,255,255,0.32), transparent 55%)" }} />
        <div className="relative z-10 flex items-center gap-2.5">
          <Icon className="w-6 h-6 shrink-0" style={{ color: "#0d0d0d" }} />
          <span className="flex-1 min-w-0 truncate text-[20px] font-bold text-[#0d0d0d]">{walletTitle(category)}</span>
          {yours && <span className="text-[10px] tracking-[0.12em] px-1.5 py-[2px] rounded bg-[#0d0d0d] shrink-0" style={{ color, fontFamily: SCENE_MONO }}>YOURS</span>}
        </div>
        <p className="relative z-10 mt-2 text-[13px] text-[#0d0d0d]/70">{n} template{n === 1 ? "" : "s"}</p>
        {/* No NEW here (job 124): open the wallet to add one. */}
        <div className="relative z-10 mt-4 flex items-center gap-2 h-10">
          {!desktop && (
            <span className="ml-auto flex items-center gap-1 text-[#0d0d0d]/50" aria-hidden="true">
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">swipe to open</span>
            </span>
          )}
        </div>
      </div>
    );
  };

  const walletStack = <div className="flex flex-col gap-3">{WALLETS.map(walletCard)}</div>;

  // One wallet opened: its templates, with a way back to the stack.
  const openedWallet = (id) => {
    const w = walletOf(id);
    const category = w.id;
    const g = GROUP[category];
    const color = g.style.color;
    const Icon = g.style.icon;
    const n = listForWallet(w).length;
    return (
      <section className="rounded-2xl bg-[#111] border border-[#1f1f1f] overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          {!desktop && WALLETS.length > 1 && (
            <button type="button" onClick={() => setOpenCat(null)} aria-label="Back to wallets" className="p-1 -ml-1 text-white/60 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          )}
          <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "1f" }}>
            <Icon className="w-[18px] h-[18px]" style={{ color }} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-bold leading-none text-white">{walletTitle(category)}</h2>
            <div className="mt-1 text-[11px] tracking-[0.1em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{n} TEMPLATE{n === 1 ? "" : "S"}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {w.cats.map((c) => {
              const cc = GROUP[c].style.color;
              // Their one venue / manager template is made: no button. Acts
              // at the plan's limit: the button opens Host more acts.
              if (!canAdd(c) && c !== "artist") return null;
              const more = !canAdd(c);
              return (
                <button key={c} onClick={() => (more ? setPlansOpen(true) : addTemplate(c))}
                  className="flex items-center gap-1 text-[13px] font-bold tracking-[0.04em] px-3 py-2 rounded-lg"
                  style={{ border: `1px solid ${cc}66`, color: cc, background: cc + "14" }}>
                  <Plus className="w-4 h-4" /> {more ? "MORE ACTS" : w.cats.length > 1 ? (c === "artist" ? "ACT" : GROUP[c].label.toUpperCase()) : "NEW"}
                </button>
              );
            })}
          </div>
        </div>
        {/* Acts on the plan (job 295). */}
        {!isTech && w.cats.includes("artist") && (
          <div className="mx-4 mb-3 -mt-1 flex items-center gap-2 text-[12.5px] text-white/55">
            <span style={{ fontFamily: SCENE_MONO }} className="tracking-[0.08em]">ACTS {savedCount("artist")} OF {actsLimit == null ? "∞" : actsLimit}</span>
            <button type="button" onClick={() => setPlansOpen(true)} className="ml-auto min-h-[32px] px-2 text-[12.5px] font-semibold underline underline-offset-2" style={{ color: GROUP.artist.style.color }}>Host more acts</button>
          </div>
        )}
        {templateList(w)}
      </section>
    );
  };

  // The workspace editor: same tabs as the event section, template only.
  const tplP = editing ? {
    gig: editing.gig,
    editable: true,
    canEdit: true,
    user,
    permissions: { is_owner: true },
    canEditSection: () => true,
    update: (k, v) => setEditing((e) => (e ? { ...e, gig: { ...e.gig, [k]: v } } : e)),
    updateSection: (s, k, v) => setEditing((e) => (e ? { ...e, gig: { ...e.gig, [s]: { ...(e.gig[s] || {}), [k]: v } } } : e)),
    handleSave: saveEditor,
    saving: edSaving,
    saved: edSaved,
    addRequirement: () => {}, updateRequirementStatus: () => {}, deleteRequirement: () => {},
    claimTask: async () => {}, markTaskDone: async () => {}, setTaskDetails: async () => {}, setTaskDueDate: async () => {}, setTaskDone: () => {},
    addBand: () => {}, updateBand: () => {}, removeBand: () => {},
  } : null;
  const tplMeta = editing ? { name: editing.name, setName: (n) => setEditing((e) => (e ? { ...e, name: n } : e)) } : null;

  const editor = editing && (desktop ? (
    <RoleWorkspace role={editing.role} p={tplP} template={tplMeta} modal onClose={closeEditor} />
  ) : (
    <div className="fixed inset-0 z-[70] bg-[#0d0d0d] overflow-y-auto" style={{ fontFamily: SCENE_FONT }}>
      <div className="sticky top-0 z-10 bg-[#0d0d0d]/95 backdrop-blur border-b border-[#1a1a1a] px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={closeEditor} aria-label="Back to My Templates" className="p-1 -ml-1 text-white/60 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
        <input
          value={editing.name}
          onChange={(e) => tplMeta.setName(e.target.value)}
          placeholder={`${GROUP[editing.role].label} template name`}
          aria-label="Template name"
          className="flex-1 min-w-0 bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[16px] font-semibold text-white placeholder:text-white/30 outline-none focus:border-white/40"
        />
      </div>
      <div className="px-4 py-4 max-w-lg mx-auto">
        <RoleWorkspace role={editing.role} p={tplP} template={tplMeta} layout="web" onClose={closeEditor} />
      </div>
    </div>
  ));

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24 text-white" style={{ fontFamily: SCENE_FONT }}>
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className={`flex items-center gap-3 px-4 py-4 mx-auto ${desktop ? "max-w-[1180px]" : "max-w-lg"}`}>
          <button onClick={() => goBack()} className="p-1 -ml-1 text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-[26px] font-bold leading-none">My Templates</h1>
            <p className="mt-1 text-white/50 text-[14px]">
              {isTech ? "Save venue and artist info once, reuse it every time you're back." : own === "venue" ? "Your venue, filled in once. Press Load template on any event." : "Your side and your acts, filled in once. Press Load template on any event."}
            </p>
          </div>
        </div>
      </div>

      {desktop ? (
        <div className="px-4 pt-5 mx-auto max-w-[1180px] grid gap-6 items-start" style={{ gridTemplateColumns: "380px minmax(0, 1fr)" }}>
          <div>{walletStack}</div>
          <div>{openedWallet(openCat || activeCat || WALLETS[0].id)}</div>
        </div>
      ) : (
        <div className="px-4 pt-5 mx-auto max-w-lg">
          {/* One wallet (company accounts, job 295): straight to it. */}
          {openCat || WALLETS.length === 1 ? openedWallet(openCat || WALLETS[0].id) : walletStack}
        </div>
      )}
      {editor}
      {plansOpen && tplPlan && <TemplatePlansSheet plan={{ ...tplPlan, acts_used: savedCount("artist") }} onClose={() => setPlansOpen(false)} onChanged={(d) => d && setTplPlan(d)} />}
      {(() => {
        const nt = notesKey && templates.find((x) => x.key === notesKey);
        const st = stageKey && templates.find((x) => x.key === stageKey);
        const actOf = (x) => ({ ...x.data, band_name: x.name });
        const at = applyKey && templates.find((x) => x.key === applyKey);
        return (
          <>
            {at && <ApplyTemplateSheet template={at} accent={GROUP.artist.style.color} onClose={() => setApplyKey(null)} />}
            {nt && (
              <FxNotesWindow
                acts={[actOf(nt)]}
                target={0}
                onTarget={() => {}}
                actOnly={0}
                onActPatch={(_, patch) => setTemplate(nt.key, (cur) => ({ ...cur, data: { ...cur.data, ...patch } }))}
                onSave={async () => { await saveTemplate(nt.key); setNotesKey(null); }}
                saving={!!nt.saving}
                onClose={() => setNotesKey(null)}
              />
            )}
            {st && (
              <StagePlotView
                acts={[actOf(st)]}
                start={0}
                // Changes on the stage page are kept with the template when
                // you leave it, so nobody loses a stage they built.
                onClose={() => { if (stageChanged.current) saveTemplate(st.key); stageChanged.current = false; setStageKey(null); }}
                onEditMembers={async (_, list) => { setData(st.key, "band_members", list); stageChanged.current = true; return null; }}
                busColors={iemMonitorColors}
                onOpenNotes={() => setNotesKey(st.key)}
              />
            )}
          </>
        );
      })()}
      <BottomTabs railOnly />
    </div>
  );
}
