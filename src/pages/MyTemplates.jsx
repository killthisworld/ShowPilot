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
import RoleWorkspace from "@/components/showpilot/RoleWorkspace";
import { emptyVenueTemplate, emptyArtistTemplate, normalizeVenueTemplate, normalizeArtistTemplate } from "@/lib/showTemplates";
import { COMPANY_TEMPLATE_ROLES, gigFromTemplate, templateFromGig, templateSubtitle } from "@/lib/roleTemplates";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";
import { addGenreTag } from "@/lib/eventTypes";

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
    venue: "Your room once: address, load-in, schedule, house gear, hospitality. Load it on every show.",
    manager: "Contact, advance checklist, vehicle, standing guest list and merch.",
    artist: "Members, genres, stage plot and notes. Load it as an act in the lineup, or into a performer intake.",
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
  // Wallets (like Fellow Pilots): each template kind is a wallet; swipe one
  // left to see its templates.
  const [activeCat, setActiveCat] = useState(null);
  const [openCat, setOpenCat] = useState(null);
  const drag = useRef({ on: false, cat: null, x0: 0, moved: false, dx: 0 });
  const [swipe, setSwipe] = useState({ cat: null, dx: 0 });

  const accountType = preferences?.account_type || "engineer";
  const isTech = ["engineer", "lighting"].includes(accountType);
  const own = MANAGER_SIDE[accountType] || accountType;
  // Wallets (job 124): company accounts get one Manager / Artist wallet that
  // holds both manager-section and artist templates; techs keep Venue + Artist.
  const WALLETS = isTech
    ? [{ id: "venue", cats: ["venue"] }, { id: "artist", cats: ["artist"] }]
    : [{ id: "venue", cats: ["venue"] }, { id: "manager", cats: ["manager", "artist"] }].sort((a, b) => (a.id === own ? -1 : b.id === own ? 1 : 0));
  const walletOf = (id) => WALLETS.find((w) => w.id === id) || WALLETS[0];
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
      toast({ title: "Error saving template", variant: "destructive" });
      setTemplate(key, { saving: false });
    }
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
      toast({ title: "Error saving template", description: "Check your connection and try again.", variant: "destructive" });
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
                      showNotes
                    />
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
        aria-label={`${g.plural} wallet, ${n} template${n === 1 ? "" : "s"}. ${desktop ? "Open" : "Swipe left to open"}`}
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
          <span className="flex-1 min-w-0 truncate text-[20px] font-bold text-[#0d0d0d]">{g.plural}</span>
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
          {!desktop && (
            <button type="button" onClick={() => setOpenCat(null)} aria-label="Back to wallets" className="p-1 -ml-1 text-white/60 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          )}
          <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "1f" }}>
            <Icon className="w-[18px] h-[18px]" style={{ color }} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-bold leading-none text-white">{g.plural}</h2>
            <div className="mt-1 text-[11px] tracking-[0.1em] text-white/45" style={{ fontFamily: SCENE_MONO }}>{n} TEMPLATE{n === 1 ? "" : "S"}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {w.cats.map((c) => {
              const cc = GROUP[c].style.color;
              return (
                <button key={c} onClick={() => addTemplate(c)}
                  className="flex items-center gap-1 text-[13px] font-bold tracking-[0.04em] px-3 py-2 rounded-lg"
                  style={{ border: `1px solid ${cc}66`, color: cc, background: cc + "14" }}>
                  <Plus className="w-4 h-4" /> {w.cats.length > 1 ? GROUP[c].label.toUpperCase() : "NEW"}
                </button>
              );
            })}
          </div>
        </div>
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
              {isTech ? "Save venue and artist info once, reuse it every time you're back." : "Fill a section in once, then press Load template on any event."}
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
          {openCat ? openedWallet(openCat) : walletStack}
        </div>
      )}
      {editor}
      <BottomTabs railOnly />
    </div>
  );
}
