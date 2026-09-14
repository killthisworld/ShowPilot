import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { FolderOpen, X } from "lucide-react";

// A small "Load Template" button that, on click, fetches the current
// user's saved_templates for the given category (venue or artist) and
// lets them pick one. The picked template's { name, data } is handed to
// onLoad - the caller decides how to map those fields onto its own show
// or gig state, since ShowDetail, SharedGig, and NewEventForNonTech each
// keep that state in a different shape.
export default function LoadTemplateButton({ category, label, onLoad, className }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState(null); // null = not fetched yet

  const openPicker = async (e) => {
    e?.stopPropagation();
    setOpen(true);
    if (templates !== null) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setTemplates([]); return; }
      const { data, error } = await supabase
        .from("saved_templates")
        .select("id, name, data")
        .eq("owner_id", user.id)
        .eq("category", category)
        .order("name");
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error(err);
      setTemplates([]);
    }
    setLoading(false);
  };

  const pick = (t) => {
    onLoad(t.name, t.data || {});
    setOpen(false);
  };

  const categoryLabel = category === "venue" ? "venue" : "artist";

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={className || "flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors shrink-0"}
      >
        <FolderOpen className="w-3 h-3" /> {label || "Load Template"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[#222] sticky top-0 bg-[#161616]">
              <p className="text-white font-semibold text-sm">Load {categoryLabel === "venue" ? "Venue" : "Artist"} Template</p>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-1.5 pb-5">
              {loading && <p className="text-white/30 text-sm p-3">Loading...</p>}
              {!loading && templates && templates.length === 0 && (
                <p className="text-white/30 text-sm p-3 leading-relaxed">
                  No saved {categoryLabel} templates yet. Add some from My Templates in Settings.
                </p>
              )}
              {!loading && templates && templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t)}
                  className="w-full text-left px-3 py-2.5 rounded-xl bg-[#1a1a1a] hover:bg-[#222] active:bg-[#262626] text-white text-sm transition-colors"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
