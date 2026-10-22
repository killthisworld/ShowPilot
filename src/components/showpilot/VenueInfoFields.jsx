import React, { useState } from "react";
import { Trash2, Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import VenuePhoto from "@/components/showpilot/VenuePhoto";

// The Venue Info fields, shared by a show (ShowDetail) and a saved venue
// template (My Templates) so the two always ask for exactly the same things.
// Add a field here and both get it.
//
// `value` holds: venue (name), city, state, contacts [{ name, role, phone,
// email }], venue_checklist { [key]: { checked, notes } }, wifi_network,
// wifi_password, console, power_notes, venue_photo_url (the venue's photo).
// `onChange(field, val)` sets one of those. `nameAction` sits beside the
// Venue label (e.g. the Load Venue button on a show).

export const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware",
  "Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky",
  "Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi",
  "Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico",
  "New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania",
  "Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming","District of Columbia",
];

export const VENUE_CHECKLIST_ITEMS = [
  { key: "wifi", label: "WiFi" },
  { key: "console", label: "Console" },
  { key: "mics", label: "Mics" },
  { key: "di_boxes", label: "DI Boxes" },
  { key: "xlrs", label: "XLR's" },
  { key: "pa_house_monitors", label: "PA/House Monitors" },
  { key: "sub", label: "Sub" },
  { key: "onstage_monitors", label: "On-Stage Monitors" },
];

export const formatPhoneNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

export default function VenueInfoFields({ value, onChange, nameAction = null, namePlaceholder = "Venue name" }) {
  const [openNotesKey, setOpenNotesKey] = useState(null);
  const v = value || {};
  const contacts = v.contacts || [];
  const checklist = v.venue_checklist || {};

  const addContact = () => onChange("contacts", [...contacts, { name: "", role: "", phone: "", email: "" }]);
  const updateContact = (i, f, val) => {
    const c = [...contacts];
    c[i] = { ...c[i], [f]: f === "phone" ? formatPhoneNumber(val) : val };
    onChange("contacts", c);
  };
  const removeContact = (i) => onChange("contacts", contacts.filter((_, idx) => idx !== i));
  const toggleChecklistItem = (key) => onChange("venue_checklist", { ...checklist, [key]: { ...checklist[key], checked: !checklist[key]?.checked } });
  const updateChecklistNote = (key, notes) => onChange("venue_checklist", { ...checklist, [key]: { ...checklist[key], notes } });

  return (
    <div className="space-y-4 pt-3">
      <VenuePhoto value={v.venue_photo_url || ""} onChange={(url) => onChange("venue_photo_url", url)} />
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-white/50 text-xs">Venue</Label>
          {nameAction}
        </div>
        <Input value={v.venue || ""} onChange={(e) => onChange("venue", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder={namePlaceholder} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-white/50 text-xs">City</Label>
          <Input value={v.city || ""} onChange={(e) => onChange("city", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="City" />
        </div>
        <div>
          <Label className="text-white/50 text-xs">State</Label>
          <Select value={v.state || ""} onValueChange={(s) => onChange("state", s)}>
            <SelectTrigger className="mt-1 h-10 bg-[#111] border-[#222] text-white">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a] max-h-64">
              {/* A template saved before the State list keeps whatever was typed. */}
              {v.state && !US_STATES.includes(v.state) && <SelectItem value={v.state}>{v.state}</SelectItem>}
              {US_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-white/50 text-xs mb-2 block">Person of Contact</Label>
        <div className="space-y-2">
          {contacts.map((c, i) => (
            <div key={i} className="bg-[#111] rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div className="grid grid-cols-2 gap-2 flex-1">
                  <Input value={c.name || ""} onChange={(e) => updateContact(i, "name", e.target.value)} placeholder="Name" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                  <Input value={c.role || ""} onChange={(e) => updateContact(i, "role", e.target.value)} placeholder="Role" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                  <Input value={c.phone || ""} onChange={(e) => updateContact(i, "phone", e.target.value)} placeholder="Phone" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                  <Input value={c.email || ""} onChange={(e) => updateContact(i, "email", e.target.value)} placeholder="Email" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                </div>
                <button type="button" onClick={() => removeContact(i)} className="p-1.5 ml-2 text-white/30 hover:text-red-400" aria-label="Remove contact">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={addContact} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact
          </Button>
        </div>
      </div>

      <div className="pt-1">
        <Label className="text-white/50 text-xs mb-2 block">Venue Provides</Label>
        <div className="flex gap-1">
          {VENUE_CHECKLIST_ITEMS.map((item) => {
            const checked = !!checklist[item.key]?.checked;
            const notesOpen = openNotesKey === item.key;
            return (
              <div key={item.key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <span className={`text-[9px] font-semibold text-center leading-tight h-7 flex items-center justify-center transition-colors ${checked ? "text-[#8CFF3D]" : "text-white/40"}`}>
                  {item.label}
                </span>
                <button type="button" onClick={() => toggleChecklistItem(item.key)} className="relative w-3 h-16 rounded-full bg-[#111] border border-[#2a2a2a] overflow-visible" aria-label={`${item.label}: ${checked ? "provided" : "not provided"}`}>
                  <div className="absolute bottom-0 left-0 right-0 rounded-full bg-[#8CFF3D]/25 transition-all duration-500 ease-out" style={{ height: checked ? "100%" : "4%" }} />
                  <div
                    className="absolute left-1/2 -translate-x-1/2 w-5 h-2.5 rounded-sm border transition-all duration-500 ease-out"
                    style={{
                      bottom: checked ? "calc(100% - 10px)" : "2px",
                      backgroundColor: checked ? "#8CFF3D" : "#3a3a3a",
                      borderColor: checked ? "#8CFF3D" : "#4a4a4a",
                    }}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setOpenNotesKey((prev) => (prev === item.key ? null : item.key))}
                  className={`w-5 h-4 rounded flex items-center justify-center transition-colors ${notesOpen ? "bg-[#8CFF3D]/20 text-[#8CFF3D]" : "bg-white/5 text-white/30 hover:text-white/50"}`}
                  aria-label={`${item.label} details`}
                >
                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${notesOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
            );
          })}
        </div>

        {VENUE_CHECKLIST_ITEMS.filter((item) => openNotesKey === item.key).map((item) => (
          <div key={item.key} className="mt-2 p-2.5 bg-[#0d0d0d] border border-[#222] rounded-lg space-y-2">
            <Label className="text-white/40 text-[10px] uppercase tracking-wide">{item.label}</Label>
            {item.key === "wifi" ? (
              <div className="grid grid-cols-2 gap-2">
                <Input value={v.wifi_network || ""} onChange={(e) => onChange("wifi_network", e.target.value)} placeholder="Network" className="h-7 bg-[#111] border-[#222] text-white text-xs" />
                <Input value={v.wifi_password || ""} onChange={(e) => onChange("wifi_password", e.target.value)} placeholder="Password" className="h-7 bg-[#111] border-[#222] text-white text-xs" />
              </div>
            ) : item.key === "console" ? (
              <Input value={v.console || ""} onChange={(e) => onChange("console", e.target.value)} placeholder="e.g. Yamaha CL5" className="h-7 bg-[#111] border-[#222] text-white text-xs" />
            ) : (
              <Textarea
                value={checklist[item.key]?.notes || ""}
                onChange={(e) => updateChecklistNote(item.key, e.target.value)}
                placeholder={`${item.label} details...`}
                className="bg-[#111] border-[#222] text-white text-xs min-h-[50px]"
              />
            )}
          </div>
        ))}
      </div>

      <div>
        <Label className="text-white/50 text-xs">Power Notes</Label>
        <Textarea value={v.power_notes || ""} onChange={(e) => onChange("power_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Power availability, circuits, etc." />
      </div>
    </div>
  );
}
