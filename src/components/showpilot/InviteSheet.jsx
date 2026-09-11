import React, { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Check, Copy, ArrowLeft } from "lucide-react";
import { supabase } from "@/api/supabaseClient";

const ROLE_OPTIONS = [
  { value: "venue", label: "Venue" },
  { value: "promoter", label: "Promoter" },
  { value: "booking_agent", label: "Booking Agent" },
  { value: "manager", label: "Manager" },
  { value: "band", label: "Band" },
  { value: "engineer", label: "Audio Engineer" },
  { value: "lighting", label: "Lighting Tech" },
];

export default function InviteSheet({ showId, trigger }) {
  const [open, setOpen] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [labels, setLabels] = useState({});
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);

  const toggleRole = (value) => {
    setSelectedRoles((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    );
  };

  const handleGenerate = async () => {
    if (selectedRoles.length === 0 || !showId) return;
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const rows = selectedRoles.map((role) => ({
        show_id: showId,
        invited_role: role,
        label: labels[role]?.trim() || null,
        created_by: user.id,
      }));
      const { data, error } = await supabase.from("gig_invites").insert(rows).select();
      if (error) throw error;

      const withUrls = data.map((inv) => ({
        ...inv,
        url: `${window.location.origin}/gig/shared?invite=${inv.invite_token}`,
        roleLabel: ROLE_OPTIONS.find((r) => r.value === inv.invited_role)?.label || inv.invited_role,
      }));
      setResults(withUrls);
    } catch (e) {
      console.error(e);
    }
    setGenerating(false);
  };

  const handleCopy = async (url, token) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const reset = () => {
    setSelectedRoles([]);
    setLabels({});
    setResults(null);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="bg-[#111] border-[#222] rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <div className="p-5 max-w-lg mx-auto">
          {!results ? (
            <>
              <h2 className="text-lg font-bold text-white mb-1">Invite to this event</h2>
              <p className="text-white/40 text-xs mb-4">Select who you're bringing in — you can pick more than one.</p>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {ROLE_OPTIONS.map((role) => (
                  <button
                    key={role.value}
                    onClick={() => toggleRole(role.value)}
                    className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                      selectedRoles.includes(role.value)
                        ? "border-[#8CFF3D] bg-[#8CFF3D]/10 text-[#8CFF3D] font-medium"
                        : "border-[#2a2a2a] text-white/60 hover:border-[#3a3a3a]"
                    }`}
                  >
                    {role.label}
                  </button>
                ))}
              </div>

              {selectedRoles.length > 0 && (
                <div className="space-y-2 mb-4">
                  {selectedRoles.map((role) => {
                    const roleLabel = ROLE_OPTIONS.find((r) => r.value === role)?.label;
                    return (
                      <div key={role}>
                        <label className="text-white/40 text-[11px]">{roleLabel} — name (optional)</label>
                        <Input
                          value={labels[role] || ""}
                          onChange={(e) => setLabels((prev) => ({ ...prev, [role]: e.target.value }))}
                          placeholder="e.g. Joe's Bar, or a person's name"
                          className="mt-1 bg-[#1a1a1a] border-[#2a2a2a] text-white text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={selectedRoles.length === 0 || generating}
                className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e] disabled:opacity-40"
              >
                {generating ? "Generating..." : `Generate Invite Link${selectedRoles.length > 1 ? "s" : ""}`}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={reset} className="text-white/40 hover:text-white">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-lg font-bold text-white">Invite links ready</h2>
              </div>
              <div className="space-y-2">
                {results.map((inv) => (
                  <div key={inv.invite_token} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-white">
                        {inv.roleLabel}{inv.label ? ` — ${inv.label}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-xs text-white/40 truncate bg-[#111] rounded-lg px-2 py-1.5">
                        {inv.url}
                      </div>
                      <button
                        onClick={() => handleCopy(inv.url, inv.invite_token)}
                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[#8CFF3D]/10 text-[#8CFF3D] hover:bg-[#8CFF3D]/20"
                      >
                        {copiedToken === inv.invite_token ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
