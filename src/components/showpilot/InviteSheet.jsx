import React, { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Check, Copy, ArrowLeft, Share2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useToast } from "@/components/ui/use-toast";

const ROLE_OPTIONS = [
  { value: "venue", label: "Venue" },
  { value: "promoter", label: "Promoter" },
  { value: "booking_agent", label: "Booking Agent" },
  { value: "manager", label: "Manager" },
  { value: "band", label: "Band" },
  { value: "engineer", label: "Audio Engineer" },
  { value: "lighting", label: "Lighting Tech" },
];

// Every invited role lands the recipient on one home section (where they
// see "(You)" and are unlocked by default). The owner can additionally
// delegate edit access to any of the other sections below, per invite -
// so access isn't just a hard owner/not-owner switch.
const SECTION_OPTIONS = [
  { value: "venue", label: "Venue" },
  { value: "promoter", label: "Promoter" },
  { value: "booking_agent", label: "Booking Agent" },
  { value: "manager", label: "Manager / Band" },
  { value: "engineer", label: "Engineer / Lighting" },
];
const ROLE_HOME_SECTION = {
  venue: "venue",
  promoter: "promoter",
  booking_agent: "booking_agent",
  manager: "manager",
  band: "manager",
  engineer: "engineer",
  lighting: "engineer",
};

export default function InviteSheet({ showId, trigger }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [labels, setLabels] = useState({});
  const [grantedSections, setGrantedSections] = useState({}); // role -> string[] of extra sections delegated
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);

  const toggleRole = (value) => {
    setSelectedRoles((prev) =>
      prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]
    );
  };

  const toggleGrantedSection = (role, section) => {
    setGrantedSections((prev) => {
      const current = prev[role] || [];
      const next = current.includes(section) ? current.filter((s) => s !== section) : [...current, section];
      return { ...prev, [role]: next };
    });
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
        granted_sections: grantedSections[role] || [],
      }));
      const { data, error } = await supabase.from("gig_invites").insert(rows).select();
      if (error) throw error;

      const withUrls = data.map((inv) => ({
        ...inv,
        url: `${window.location.origin}/gig/shared?invite=${inv.invite_token}`,
        roleLabel: ROLE_OPTIONS.find((r) => r.value === inv.invited_role)?.label || inv.invited_role,
        grantedLabels: (inv.granted_sections || []).map((s) => SECTION_OPTIONS.find((o) => o.value === s)?.label || s),
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

  const handleShare = async (url, roleLabel) => {
    try {
      await navigator.share({ title: `${roleLabel} Invite`, url });
    } catch (e) {
      // user cancelled - nothing to do
    }
  };

  const reset = () => {
    setSelectedRoles([]);
    setLabels({});
    setGrantedSections({});
    setResults(null);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (v && !showId) {
          toast({ title: "Nothing to share", description: "Fill in and save the event before inviting anyone." });
          return;
        }
        setOpen(v);
        if (!v) reset();
      }}
    >
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
                <div className="space-y-4 mb-4">
                  {selectedRoles.map((role) => {
                    const roleLabel = ROLE_OPTIONS.find((r) => r.value === role)?.label;
                    const homeSection = ROLE_HOME_SECTION[role];
                    const otherSections = SECTION_OPTIONS.filter((s) => s.value !== homeSection);
                    const picked = grantedSections[role] || [];
                    return (
                      <div key={role} className="space-y-2">
                        <label className="text-white/40 text-[11px]">{roleLabel} — name (optional)</label>
                        <Input
                          value={labels[role] || ""}
                          onChange={(e) => setLabels((prev) => ({ ...prev, [role]: e.target.value }))}
                          placeholder="e.g. Joe's Bar, or a person's name"
                          className="mt-1 bg-[#1a1a1a] border-[#2a2a2a] text-white text-sm"
                        />
                        {otherSections.length > 0 && (
                          <div>
                            <p className="text-white/40 text-[11px] mb-1.5">
                              Also let this {roleLabel.toLowerCase()} edit (optional)
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {otherSections.map((s) => (
                                <button
                                  key={s.value}
                                  type="button"
                                  onClick={() => toggleGrantedSection(role, s.value)}
                                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                    picked.includes(s.value)
                                      ? "border-[#8CFF3D] bg-[#8CFF3D]/10 text-[#8CFF3D]"
                                      : "border-[#2a2a2a] text-white/50 hover:border-[#3a3a3a]"
                                  }`}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
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
                    {inv.grantedLabels?.length > 0 && (
                      <p className="text-[11px] text-white/40 mb-1.5">
                        Can also edit: {inv.grantedLabels.join(", ")}
                      </p>
                    )}
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
                      {typeof navigator !== "undefined" && navigator.share && (
                        <button
                          onClick={() => handleShare(inv.url, inv.roleLabel)}
                          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      )}
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
