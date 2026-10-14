import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/lib/navHistory";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Plus, Trash2, Music, MapPin, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { usePreferences } from "@/hooks/usePreferences";
import VenueInfoFields from "@/components/showpilot/VenueInfoFields";
import PerformerFields from "@/components/showpilot/PerformerFields";
import { emptyVenueTemplate, emptyArtistTemplate, normalizeVenueTemplate, normalizeArtistTemplate } from "@/lib/showTemplates";
import { addGenreTag } from "@/lib/eventTypes";

// Section colors mirror SharedGig's SECTION_COLORS so a Venue template
// here visually connects to the Venue section it gets loaded into, and
// same for Artist templates and the Manager/Band lineup.
const GROUP_STYLE = {
  venue: { color: "#F2FF00", icon: MapPin, label: "Venues" },
  artist: { color: "#EF4444", icon: Music, label: "Artists" },
};

// Templates use exactly the fields of a show's Venue Info / Performer
// sections (the same VenueInfoFields / PerformerFields components), so
// what you save here is what fills a show.
const emptyData = (category) => (category === "venue" ? emptyVenueTemplate() : emptyArtistTemplate());
const normalizeData = (category, data) => (category === "venue" ? normalizeVenueTemplate(data || {}) : normalizeArtistTemplate(data || {}));

export default function MyTemplates() {
  const navigate = useNavigate(); const goBack = useGoBack();
  const { toast } = useToast();
  const { preferences, reload: reloadPreferences } = usePreferences();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]); // { key, id, category, name, data, open, saving, saved }
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);

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
          setTemplates(
            (data || []).map((t) => ({ key: `id:${t.id}`, id: t.id, category: t.category, name: t.name, data: normalizeData(t.category, t.data), open: false, saving: false, saved: false }))
          );
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const findIdx = (key) => templates.findIndex((t) => t.key === key);
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

  const addTemplate = (category) => {
    const key = `new:${Date.now()}`;
    setTemplates((prev) => [...prev, { key, id: null, category, name: "", data: emptyData(category), open: true, saving: false, saved: false }]);
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
  const saveTemplate = async (key) => {
    const t = templates.find((tt) => tt.key === key);
    if (!t || !user) return;
    if (!t.name.trim()) {
      toast({ title: `Give this ${t.category} template a name first`, variant: "destructive" });
      return;
    }
    setTemplate(key, { saving: true });
    let finalKey = key;
    try {
      if (t.id) {
        const { error } = await supabase
          .from("saved_templates")
          .update({ name: t.name.trim(), data: t.data, updated_at: new Date().toISOString() })
          .eq("id", t.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("saved_templates")
          .insert({ owner_id: user.id, category: t.category, name: t.name.trim(), data: t.data })
          .select()
          .single();
        if (error) throw error;
        finalKey = `id:${inserted.id}`;
        setTemplate(key, { id: inserted.id, key: finalKey });
      }
      setTemplate(finalKey, { saved: true, saving: false });
      setTimeout(() => setTemplate(finalKey, { saved: false }), 2000);
      toast({ title: "Template saved" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error saving template", variant: "destructive" });
      setTemplate(key, { saving: false });
    }
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
    if (t.category === "venue") {
      const parts = [[t.data.city, t.data.state].filter(Boolean).join(", "), t.data.console].filter(Boolean);
      return parts.join(" · ");
    }
    const parts = [(t.data.genre_tags || []).join(", "), t.data.band_members?.length ? `${t.data.band_members.length} member${t.data.band_members.length !== 1 ? "s" : ""}` : ""].filter(Boolean);
    return parts.join(" · ");
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

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <button onClick={() => goBack()} className="p-1 -ml-1 text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">My Templates</h1>
            <p className="text-white/40 text-xs">Save venue and artist info once, reuse it every time you're back</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-6">
        {["venue", "artist"].map((category) => {
          const style = GROUP_STYLE[category];
          const list = templates.filter((t) => t.category === category);
          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <style.icon className="w-4 h-4" style={{ color: style.color }} />
                  <p className="font-semibold text-sm" style={{ color: style.color }}>{style.label}</p>
                </div>
                <button
                  onClick={() => addTemplate(category)}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors"
                  style={{ borderColor: style.color + "50", color: style.color, backgroundColor: style.color + "12" }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>

              {list.length === 0 && (
                <p className="text-white/25 text-xs px-1">
                  {category === "venue"
                    ? "No venue templates yet. Save one for a room you work often, even if it doesn't use ShowPilot."
                    : "No artist templates yet. Save one for an artist you work with repeatedly."}
                </p>
              )}

              <div className="space-y-2.5">
                {list.map((t) => (
                  <div key={t.key} className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: style.color + "50" }}>
                    <button
                      type="button"
                      onClick={() => toggleOpen(t.key)}
                      className="w-full flex items-center justify-between gap-2 p-3.5"
                      style={{ backgroundColor: style.color + "10" }}
                    >
                      <div className="min-w-0 text-left">
                        <p className="font-semibold text-sm text-white truncate">{t.name || `Untitled ${category === "venue" ? "venue" : "artist"}`}</p>
                        {!t.open && summaryLine(t) && <p className="text-white/35 text-xs truncate mt-0.5">{summaryLine(t)}</p>}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-white/40 transition-transform shrink-0 ${t.open ? "rotate-180" : ""}`} />
                    </button>

                    {t.open && (
                      <div className="p-4 space-y-3 bg-[#161616]">
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
                          {confirmDeleteKey === t.key ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => deleteTemplate(t.key)} className="text-xs font-semibold px-3 py-2 rounded-xl bg-red-500/20 text-red-400">Confirm</button>
                              <button onClick={() => setConfirmDeleteKey(null)} className="text-xs font-semibold px-3 py-2 rounded-xl bg-white/5 text-white/50">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteKey(t.key)} className="p-2.5 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
