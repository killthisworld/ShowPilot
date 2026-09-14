import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePreferences } from "@/hooks/usePreferences";

const EVENT_TYPES = ["Concert", "Comedy Show", "Theatre Play", "Corporate Event", "Private Party", "Festival", "Open Mic", "Other"];

const SECTION_OPTIONS = [
  { key: "venue", label: "Venue", color: "#F97316" },
  { key: "promoter", label: "Promoter", color: "#60A5FA" },
  { key: "booking_agent", label: "Booking Agent", color: "#C026D3" },
  { key: "manager", label: "Manager / Band", color: "#EF4444" },
  { key: "engineer", label: "Audio / Lighting", color: "#8CFF3D" },
];

// Maps each account type to the section it always owns on any event it
// creates - that section is locked in (can't be unchecked) since it
// belongs to the creator by definition.
const ACCOUNT_TYPE_TO_SECTION = {
  band: "manager",
  venue: "venue",
  promoter: "promoter",
  booking_agent: "booking_agent",
  manager: "manager",
};

export default function NewEventForNonTech() {
  const navigate = useNavigate();
  const location = useLocation();
  const { preferences } = usePreferences();
  const mySection = ACCOUNT_TYPE_TO_SECTION[preferences?.account_type] || "manager";
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("");
  const [date, setDate] = useState(location.state?.prefillDate || "");
  const [selectedSections, setSelectedSections] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const toggleSection = (key) => {
    if (key === mySection) return;
    setSelectedSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleCreate = async () => {
    if (!eventName.trim()) {
      setError("Event name is required.");
      return;
    }
    if (!date) {
      setError("Date is required.");
      return;
    }
    setError("");
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const includedSections = Array.from(new Set([mySection, ...selectedSections]));
      const { data, error: insertError } = await supabase
        .from("shows")
        .insert({
          owner_id: user.id,
          event_name: eventName.trim(),
          band_name: "",
          event_type: eventType || null,
          date,
          included_sections: includedSections,
          status: "not_started",
        })
        .select()
        .single();
      if (insertError) throw insertError;
      navigate(`/gig/shared?token=${data.share_token}`);
    } catch (e) {
      console.error(e);
      setError("Something went wrong. Please try again.");
    }
    setCreating(false);
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white">New Event</h1>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <div className="bg-[#111] rounded-2xl p-4 space-y-3">
          <div>
            <Label className="text-white/50 text-xs">Event Name *</Label>
            <Input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g. Friday Night Showcase" className="mt-1 bg-[#0d0d0d] border-[#222] text-white" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Event Type</Label>
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="mt-1 w-full h-10 bg-[#0d0d0d] border border-[#222] rounded-md text-white text-sm px-3">
              <option value="">Select type</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-white/50 text-xs">Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 bg-[#0d0d0d] border-[#222] text-white [color-scheme:dark] w-44" />
          </div>
        </div>

        <div className="bg-[#111] rounded-2xl p-4">
          <p className="text-white/50 text-xs mb-3">Which sections does this event need? Your own section is always included - add whichever others are relevant.</p>
          <div className="space-y-2">
            {SECTION_OPTIONS.map((opt) => {
              const isMine = opt.key === mySection;
              const isSelected = isMine || selectedSections.includes(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleSection(opt.key)}
                  disabled={isMine}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-colors disabled:cursor-not-allowed"
                  style={{
                    borderColor: isSelected ? opt.color : "#2a2a2a",
                    backgroundColor: isSelected ? opt.color + "14" : "transparent",
                  }}
                >
                  <span className="text-sm font-medium" style={{ color: isSelected ? opt.color : "rgba(255,255,255,0.5)" }}>
                    {opt.label}
                    {isMine ? " (You)" : ""}
                  </span>
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: isSelected ? opt.color : "#3a3a3a", backgroundColor: isSelected ? opt.color : "transparent" }}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-black" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm px-1">{error}</p>}

        <Button onClick={handleCreate} disabled={creating} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e] h-12 rounded-xl">
          {creating ? "Creating..." : "Create Event"}
        </Button>
      </div>
    </div>
  );
}
