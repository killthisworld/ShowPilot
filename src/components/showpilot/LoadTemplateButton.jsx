import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { FolderOpen, MapPin, Music, Search, X } from "lucide-react";
import { SCENE_FONT, SCENE_MONO } from "@/lib/sceneStyle";

// A small "Load Template" button that, on click, fetches the current
// user's saved_templates for the given category (venue or artist) and
// lets them pick one in a centered box. The picked template's { name, data }
// is handed to onLoad - the caller decides how to map those fields onto its
// own show or gig state, since ShowDetail, SharedGig, and NewEventForNonTech
// each keep that state in a different shape.
const ACCENT = { venue: "#F2FF00", artist: "#EF4444" };

function subtitle(category, data) {
  const d = data || {};
  if (category === "venue") {
    return [d.city, d.state].filter(Boolean).join(", ");
  }
  const genres = Array.isArray(d.genre_tags) ? d.genre_tags : (d.genre_tag ? [d.genre_tag] : []);
  const members = Array.isArray(d.band_members) ? d.band_members.length : 0;
  return [genres.slice(0, 2).join(" / "), members ? `${members} member${members === 1 ? "" : "s"}` : ""]
    .filter(Boolean).join(" · ");
}

export default function LoadTemplateButton({ category, label, onLoad, className }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState(null); // null = not fetched yet
  const [q, setQ] = useState("");

  const isVenue = category === "venue";
  const categoryLabel = isVenue ? "venue" : "artist";
  const accent = ACCENT[isVenue ? "venue" : "artist"];
  const Icon = isVenue ? MapPin : Music;

  const close = () => { setOpen(false); setQ(""); };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
    } finally {
      setLoading(false);
    }
  };

  const pick = (t) => {
    onLoad(t.name, t.data || {});
    close();
  };

  const list = (templates || []).filter((t) => !q.trim() || (t.name || "").toLowerCase().includes(q.trim().toLowerCase()));

  const modal = open && (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/75"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={`Load ${categoryLabel} template`}
    >
      <div
        className="w-full max-w-[380px] max-h-[88vh] flex flex-col bg-[#0d0d0d] border border-[#2a2a2a] rounded-[18px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <div className="text-[11.5px] tracking-[0.14em] uppercase" style={{ fontFamily: SCENE_MONO, color: accent }}>
              My templates
            </div>
            <div className="mt-1 text-[26px] leading-none uppercase text-white" style={{ fontFamily: SCENE_FONT, fontWeight: 700, letterSpacing: "0.02em" }}>
              Load {isVenue ? "venue" : "artist"}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-full border border-[#2a2a2a] flex items-center justify-center text-white/50 hover:text-white hover:border-white/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {templates && templates.length > 5 && (
          <div className="px-5 pb-2">
            <div className="flex items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#141414] px-3 h-10 focus-within:border-white/30">
              <Search className="w-3.5 h-3.5 text-white/40 shrink-0" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${categoryLabel} templates`}
                className="flex-1 min-w-0 bg-transparent outline-none text-white text-sm placeholder:text-white/30"
              />
            </div>
          </div>
        )}

        <div className="px-5 pb-5 pt-1 overflow-y-auto space-y-2">
          {loading && (
            <p className="py-6 text-center text-[11.5px] tracking-[0.14em] uppercase text-white/40" style={{ fontFamily: SCENE_MONO }}>
              Loading…
            </p>
          )}

          {!loading && templates && templates.length === 0 && (
            <div className="py-6 text-center">
              <div className="mx-auto w-11 h-11 rounded-full border border-[#2a2a2a] flex items-center justify-center" style={{ color: accent }}>
                <FolderOpen className="w-5 h-5" />
              </div>
              <p className="mt-3 text-white text-sm font-semibold">No {categoryLabel} templates yet</p>
              <p className="mt-1 text-white/45 text-[13px] leading-relaxed">
                Save one from My Templates and it will show up here.
              </p>
              <Link
                to="/my-templates"
                onClick={close}
                className="mt-4 inline-flex items-center h-9 px-4 rounded-full text-[11.5px] tracking-[0.14em] uppercase font-semibold text-black"
                style={{ background: accent, fontFamily: SCENE_MONO }}
              >
                Open My Templates
              </Link>
            </div>
          )}

          {!loading && templates && templates.length > 0 && list.length === 0 && (
            <p className="py-6 text-center text-white/40 text-sm">No match for “{q}”.</p>
          )}

          {!loading && list.map((t) => {
            const sub = subtitle(category, t.data);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t)}
                className="group w-full flex items-center gap-3 text-left px-3.5 py-3 rounded-xl border border-[#2a2a2a] bg-[#141414] hover:bg-[#1a1a1a] active:bg-[#1f1f1f] transition-colors"
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent + "99"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; }}
              >
                <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: accent + "1f", color: accent }}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-white text-[15px] font-semibold">{t.name}</span>
                  {sub && (
                    <span className="block truncate mt-0.5 text-[11.5px] tracking-[0.08em] text-white/45" style={{ fontFamily: SCENE_MONO }}>
                      {sub}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={className || "flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors shrink-0"}
      >
        <FolderOpen className="w-3 h-3" /> {label || "Load Template"}
      </button>
      {modal && createPortal(modal, document.body)}
    </>
  );
}
