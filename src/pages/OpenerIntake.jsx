import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Send, CheckCircle, Music, X } from "lucide-react";
import CollapsibleSection from "@/components/showpilot/CollapsibleSection";

export default function OpenerIntake() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const [context, setContext] = useState(null);
  const [loadingView, setLoadingView] = useState(true);
  const [form, setForm] = useState({
    band_name: "",
    genre_tags: [],
    band_members: [],
    set_length_minutes: "",
    general_notes: "",
  });
  const [genreInput, setGenreInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (!token) { setLoadingView(false); return; }
      try {
        const { data } = await supabase
          .from("opener_requests")
          .select("*, tour_manager_requests(band_name, venue, date, location)")
          .eq("invite_token", token)
          .maybeSingle();
        if (data) setContext(data);
      } catch (e) {
        console.error(e);
      }
      setLoadingView(false);
    };
    init();
  }, [token]);

  const update = (field, val) => setForm((s) => ({ ...s, [field]: val }));
  const addMember = () => update("band_members", [...form.band_members, { name: "", instrument: "", bus_type: "" }]);
  const updateMember = (i, f, v) => { const m = [...form.band_members]; m[i] = { ...m[i], [f]: v }; update("band_members", m); };
  const removeMember = (i) => update("band_members", form.band_members.filter((_, idx) => idx !== i));

  const handleGenreInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = genreInput.trim();
      if (trimmed && !form.genre_tags.includes(trimmed)) update("genre_tags", [...form.genre_tags, trimmed]);
      setGenreInput("");
    } else if (e.key === "Backspace" && !genreInput && form.genre_tags.length > 0) {
      update("genre_tags", form.genre_tags.slice(0, -1));
    }
  };
  const removeGenreTag = (tag) => update("genre_tags", form.genre_tags.filter((t) => t !== tag));

  const handleSubmit = async () => {
    if (!form.band_name) {
      setError("Band name is required.");
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
          <p className="text-white/30 text-sm">This opener intake link is not valid.</p>
        </div>
      </div>
    );
  }

  if (submitted || context.status === "submitted") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-16 h-16 text-[#8CFF3D] mx-auto mb-4" />
          <h2 className="text-white text-2xl font-bold mb-2">Submitted!</h2>
          <p className="text-white/50 text-sm">Your set info has been added to the gig.</p>
        </div>
      </div>
    );
  }

  const parent = context.tour_manager_requests;

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#8CFF3D]/10 flex items-center justify-center">
              <Music className="w-4 h-4 text-[#8CFF3D]" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Opener Set Info</h1>
              <p className="text-white/40 text-xs">
                {parent?.band_name ? `Opening for ${parent.band_name}` : "Submitting your set info"}
                {parent?.venue ? ` · ${parent.venue}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <p className="text-white/40 text-xs pb-1">
          Fill in your band's info below — this will be added to the gig{parent?.date ? ` on ${parent.date}` : ""}{parent?.location ? ` at ${parent.location}` : ""}. No need to re-enter venue or date details.
        </p>

        <div className="bg-[#111] rounded-2xl p-4 space-y-3">
          <div>
            <Label className="text-white/50 text-xs">Band / Artist Name *</Label>
            <Input value={form.band_name} onChange={(e) => update("band_name", e.target.value)} className="mt-1 bg-[#0d0d0d] border-[#222] text-white" placeholder="Band / Artist" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Set Length (minutes)</Label>
            <Input
              type="number"
              value={form.set_length_minutes}
              onChange={(e) => update("set_length_minutes", e.target.value)}
              className="mt-1 bg-[#0d0d0d] border-[#222] text-white w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="e.g. 30"
            />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Genre / Style</Label>
            <div className="mt-1 flex flex-wrap gap-1.5 p-2 bg-[#0d0d0d] border border-[#222] rounded-lg min-h-[42px]">
              {form.genre_tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#8CFF3D]/15 text-[#8CFF3D]">
                  {tag}
                  <button type="button" onClick={() => removeGenreTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <input
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={handleGenreInputKeyDown}
                placeholder={form.genre_tags.length === 0 ? "Type a genre, hit Enter..." : "Add another..."}
                className="flex-1 min-w-[100px] bg-transparent text-white text-sm outline-none placeholder:text-white/25"
              />
            </div>
          </div>
        </div>

        <CollapsibleSection title="Band Members" icon={Music} badge={form.band_members.length} defaultOpen={true}>
          <div className="space-y-3 pt-3">
            {form.band_members.map((m, i) => (
              <div key={i} className="bg-[#111] rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input value={m.name} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Name" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                    <Input value={m.instrument} onChange={(e) => updateMember(i, "instrument", e.target.value)} placeholder="Instrument/Role" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                  </div>
                  <button onClick={() => removeMember(i)} className="p-1.5 text-white/30 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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

        <div className="bg-[#111] rounded-2xl p-4">
          <Label className="text-white/50 text-xs mb-2 block">Additional Notes</Label>
          <Textarea value={form.general_notes} onChange={(e) => update("general_notes", e.target.value)} className="bg-[#0d0d0d] border-[#222] text-white min-h-[80px]" placeholder="Anything else the engineer should know..." />
        </div>

        {error && <p className="text-red-400 text-sm px-1">{error}</p>}

        <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-12 rounded-xl font-semibold text-base">
          <Send className="w-4 h-4 mr-2" />
          {submitting ? "Submitting..." : "Submit Set Info"}
        </Button>
      </div>
    </div>
  );
}
