import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X, Loader2, ChevronRight } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { normalizeArtistTemplate } from "@/lib/showTemplates";

// "Upload template" on the intake form's Artist & Set circle (job 282).
// On ShowPilot: their artist templates (My Templates) to pick from; the one
// they pick fills the form - artist / group name, genre, members and inputs
// with the stage, stage plot files, notes and contact info. Not on ShowPilot:
// sign up / log in, then the templates open when they're back on the form.
const G = "#8CFF3D";
const PENDING = "showpilot_open_templates_after_auth";
const here = () => window.location.pathname + window.location.search;

// A template as intake form fields. Member notes live on the member on the
// intake form (band_members[i].notes); templates keep them by name.
export function intakeFromTemplate(name, data = {}) {
  const d = normalizeArtistTemplate(data);
  const noteOf = (n) => (d.artist_fx_notes || []).find((x) => x.artist_name === n)?.notes || "";
  const out = {
    band_name: name || d.band_name || "",
    genre_tags: d.genre_tags || [],
    band_members: (d.band_members || []).map((m) => (m?.name && noteOf(m.name) ? { ...m, notes: noteOf(m.name) } : m)),
    stage_plot_url: d.stage_plot_url || "",
    stage_plot_files: d.stage_plot_files || [],
    general_notes: d.general_notes || "",
  };
  if (d.set_length_minutes) out.set_length_minutes = String(d.set_length_minutes);
  // Contact info, only what the template has (keeps what they typed otherwise).
  if ((d.contact_name || "").trim()) out.submitter_name = d.contact_name.trim();
  if ((d.contact_phone || "").trim()) out.submitter_phone = d.contact_phone.trim();
  if ((d.contact_email || "").trim()) out.submitter_email = d.contact_email.trim();
  return out;
}

async function loadTemplates(userId) {
  const { data: rows, error } = await supabase
    .from("saved_templates")
    .select("id, name, data, updated_at")
    .eq("owner_id", userId)
    .eq("category", "artist")
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  if (rows?.length) return rows;
  // Older accounts kept one artist template on user_preferences.
  const { data } = await supabase.from("user_preferences").select("band_template").eq("user_id", userId).maybeSingle();
  const t = data?.band_template;
  return t && (t.band_name || (t.band_members || []).length) ? [{ id: "legacy", name: t.band_name || "My artist", data: t }] : [];
}

export default function UploadTemplateButton({ onApply }) {
  const [askAuth, setAskAuth] = useState(false);
  const [list, setList] = useState(null); // null = closed, "loading", "error" or the templates
  const open = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAskAuth(true); return; }
    setList("loading");
    try { setList(await loadTemplates(user.id)); } catch (e) { console.error(e); setList("error"); }
  };
  // Back from signing up / logging in: open their templates.
  useEffect(() => {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PENDING) || "null"); } catch {}
    if (!p || p.path !== here() || Date.now() - p.at > 3 * 24 * 3600 * 1000) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      try { localStorage.removeItem(PENDING); } catch {}
      open();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const goAuth = (to) => {
    try { localStorage.setItem(PENDING, JSON.stringify({ path: here(), at: Date.now() })); } catch {}
    try { sessionStorage.setItem("post_auth_redirect", here()); } catch {}
    window.location.href = `${to}?redirect=${encodeURIComponent(here())}`;
  };
  const pick = (t) => { onApply?.(intakeFromTemplate(t.name, t.data || {}), t.name); setList(null); };
  const summary = (t) => {
    const d = t.data || {};
    const n = (d.band_members || []).length;
    return [(d.genre_tags || []).slice(0, 3).join(", "), n ? `${n} member${n === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  };

  const modal = (children, label, onClose) => createPortal(
    <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-[420px] max-h-[85dvh] overflow-y-auto rounded-2xl border border-[#2a2a2a] bg-[#111] p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={label}>
        {children}
      </div>
    </div>,
    document.body
  );
  const head = (title, sub, onClose) => (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <p className="text-white text-[17px] font-semibold leading-snug">{title}</p>
        {sub && <p className="text-white/55 text-[13.5px] mt-1 leading-snug">{sub}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 -mt-1 flex items-center justify-center text-white/45"><X className="w-5 h-5" /></button>
    </div>
  );

  return (
    <>
      <button type="button" onClick={open} className="self-center min-h-[44px] px-4 rounded-[10px] border border-dashed border-[#8CFF3D]/40 text-[13.5px] font-semibold text-[#8CFF3D] flex items-center gap-1.5">
        <Upload className="w-4 h-4" />Upload template
      </button>
      {askAuth && modal(<>
        {head("Upload your template", "Templates live in your ShowPilot account: your artist / group, genre, members and inputs, stage plot, notes and contact info, ready for every form.", () => setAskAuth(false))}
        <button type="button" onClick={() => goAuth("/register")} className="min-h-[48px] rounded-xl font-semibold text-[15px]" style={{ background: G, color: "#0d0d0d" }}>Create my ShowPilot account</button>
        <button type="button" onClick={() => goAuth("/login")} className="min-h-[48px] rounded-xl border border-[#333] text-white font-semibold text-[15px]">I'm already on ShowPilot. Log in</button>
      </>, "Upload template", () => setAskAuth(false))}
      {list !== null && modal(<>
        {head("Your templates", Array.isArray(list) && list.length ? "Pick one to fill in this form." : null, () => setList(null))}
        {list === "loading" ? (
          <div className="py-6 flex justify-center text-white/50"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : list === "error" ? (
          <p className="text-[13.5px] text-[#f87171]">Couldn't load your templates. Try again.</p>
        ) : list.length === 0 ? (
          <>
            <p className="text-white/55 text-[13.5px] leading-snug">No artist templates yet. Make one in My Templates, then upload it here.</p>
            <a href="/my-templates" className="min-h-[46px] rounded-xl border border-[#333] text-white font-semibold text-[14.5px] flex items-center justify-center">Open My Templates</a>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((t) => (
              <button key={t.id} type="button" onClick={() => pick(t)} className="w-full min-h-[56px] rounded-xl border border-[#2a2a2a] bg-[#161616] px-3.5 py-2.5 flex items-center gap-3 text-left hover:border-[#8CFF3D]/50">
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-white truncate">{t.name || "Untitled"}</span>
                  {summary(t) && <span className="block text-[12.5px] text-white/45 truncate mt-0.5">{summary(t)}</span>}
                </span>
                <ChevronRight className="w-4 h-4 text-white/35 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </>, "Your templates", () => setList(null))}
    </>
  );
}
