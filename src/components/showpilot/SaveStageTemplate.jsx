import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookmarkPlus, Check, Loader2, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { normalizeArtistTemplate } from "@/lib/showTemplates";

// Save an act's stage to My Templates (job 254), for artists / managers (from
// their intake form) and engineers (from the show-night stage plot). It's an
// artist template (saved_templates, category "artist", named after the act):
// the members with their stage positions, inputs, vocals and monitors, plus
// the stage plot files. Saving again under the same name updates it; the
// template's other fields (genres, set length, photo...) are kept.
const G = "#8CFF3D";

export async function saveStageTemplate(act) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save templates");
  const name = (act.band_name || "").trim() || "My act";
  const stage = {
    band_members: (act.band_members || []).map(({ notes, ...m }) => m),
    stage_plot_files: act.stage_plot_files || [],
    ...(act.stage_plot_url ? { stage_plot_url: act.stage_plot_url } : {}),
  };
  const { data: existing } = await supabase.from("saved_templates").select("id, data").eq("owner_id", user.id).eq("category", "artist").eq("name", name).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("saved_templates").update({ data: { ...(existing.data || {}), ...stage }, updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }
  const fresh = normalizeArtistTemplate({
    set_length_minutes: act.set_length_minutes ?? null,
    genre_tags: act.genre_tags || [],
    general_notes: act.general_notes || "",
    ...(act.photo_url ? { photo_url: act.photo_url } : {}),
    ...stage,
  });
  const { error } = await supabase.from("saved_templates").insert({ owner_id: user.id, category: "artist", name, data: fresh });
  if (error) throw error;
  return "saved";
}

// Not on ShowPilot yet (job 257): Save to template asks them to make an account
// or log in, and remembers to save once they're back on this page signed in.
const PENDING = "showpilot_save_stage_after_auth";
const here = () => window.location.pathname + window.location.search;

// Back from signing up / logging in (job 257): the intake page finishes the
// save they asked for. onDone("saved" | "updated" | "error").
export function useResumeStageSave(act, onDone) {
  useEffect(() => {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PENDING) || "null"); } catch {}
    if (!p || p.path !== here() || Date.now() - p.at > 3 * 24 * 3600 * 1000) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || !(act?.band_members || []).length) return;
      try { localStorage.removeItem(PENDING); } catch {}
      try { onDone?.(await saveStageTemplate(act)); } catch (e) { console.error(e); onDone?.("error"); }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function SaveStageTemplateButton({ act, className = "", primary = false }) {
  const [state, setState] = useState("idle"); // idle | saving | saved | updated | error
  const [askAuth, setAskAuth] = useState(false);
  const save = async () => {
    setState("saving");
    try { setState(await saveStageTemplate(act)); } catch (e) { console.error(e); setState("error"); }
  };
  const onClick = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { save(); return; }
    setAskAuth(true);
  };
  const goAuth = (to) => {
    try { localStorage.setItem(PENDING, JSON.stringify({ path: here(), at: Date.now() })); } catch {}
    try { sessionStorage.setItem("post_auth_redirect", here()); } catch {}
    window.location.href = `${to}?redirect=${encodeURIComponent(here())}`;
  };
  const label = state === "saving" ? "Saving…" : state === "saved" ? "Saved to My Templates" : state === "updated" ? "Updated in My Templates" : state === "error" ? "Couldn't save. Try again" : primary ? "Save to template" : "Save to my templates";
  const done = state === "saved" || state === "updated";
  const look = primary && !done && state !== "error"
    ? { background: G, borderColor: G, color: "#0d0d0d" }
    : { borderColor: done ? G : "#3a3a3a", color: state === "error" ? "#f87171" : done ? G : "rgba(255,255,255,0.8)" };
  return (
    <>
      <button type="button" onClick={onClick} disabled={state === "saving" || !(act?.band_members || []).length}
        className={`${primary ? "min-h-[46px] text-[14.5px]" : "min-h-[44px] text-[14px]"} px-4 rounded-xl border font-semibold flex items-center justify-center gap-2 disabled:opacity-40 ${className}`}
        style={look}>
        {state === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <Check className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
        {label}
      </button>
      {askAuth && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setAskAuth(false)}>
          <div className="w-full max-w-[400px] rounded-2xl border border-[#2a2a2a] bg-[#111] p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Save to template">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-white text-[17px] font-semibold leading-snug">Save your stage to a template</p>
                <p className="text-white/55 text-[13.5px] mt-1 leading-snug">Templates live in your ShowPilot account, so your stage is ready for the next show. Your form stays as it is.</p>
              </div>
              <button type="button" onClick={() => setAskAuth(false)} aria-label="Close" className="w-9 h-9 -mr-2 -mt-1 flex items-center justify-center text-white/45"><X className="w-5 h-5" /></button>
            </div>
            <button type="button" onClick={() => goAuth("/register")} className="min-h-[48px] rounded-xl font-semibold text-[15px]" style={{ background: G, color: "#0d0d0d" }}>Create my ShowPilot account</button>
            <button type="button" onClick={() => goAuth("/login")} className="min-h-[48px] rounded-xl border border-[#333] text-white font-semibold text-[15px]">I'm already on ShowPilot. Log in</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
