import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Music, Users, Mic, Zap, Info, Plus, Trash2 } from "lucide-react";
import CollapsibleSection from "@/components/showpilot/CollapsibleSection";
import StatusBadge from "@/components/showpilot/StatusBadge";
import { useToast } from "@/components/ui/use-toast";
import moment from "moment";

export default function SharedShow() {
  const { id } = useParams();
  const token = new URLSearchParams(window.location.search).get("token");
  const { toast } = useToast();
  const [show, setShow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("shows")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError("Show not found");
        } else if (data.share_token !== token) {
          setError("Invalid share link");
        } else {
          setShow(data);
        }
      })
      .finally(() => setLoading(false));
  }, [id, token]);

  const update = (field, val) => setShow((s) => ({ ...s, [field]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Uses a secure server-side function that verifies the token before
      // updating — see supabase/shared_show_migration.sql. A direct table
      // update wouldn't work here since this visitor isn't logged in as the owner.
      const { error } = await supabase.rpc("update_shared_show", {
        p_show_id: id,
        p_token: token,
        p_updates: {
          band_name: show.band_name,
          venue: show.venue,
          location: show.location,
          console: show.console,
          contacts: show.contacts,
          band_members: show.band_members,
          general_notes: show.general_notes,
        },
      });
      if (error) throw error;
      toast({ title: "Show updated!" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error saving", variant: "destructive" });
    }
    setSaving(false);
  };

  // Array helpers
  const addContact = () => update("contacts", [...(show.contacts || []), { name: "", role: "", phone: "", email: "" }]);
  const updateContact = (i, f, v) => { const c = [...(show.contacts || [])]; c[i] = { ...c[i], [f]: v }; update("contacts", c); };
  const removeContact = (i) => update("contacts", (show.contacts || []).filter((_, idx) => idx !== i));

  const addMember = () => update("band_members", [...(show.band_members || []), { name: "", instrument: "", bus_color: "", bus_number: 1, bus_type: "IEM", bus_label: "" }]);
  const updateMember = (i, f, v) => { const m = [...(show.band_members || [])]; m[i] = { ...m[i], [f]: v }; update("band_members", m); };
  const removeMember = (i) => update("band_members", (show.band_members || []).filter((_, idx) => idx !== i));

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">{error}</p>
          <p className="text-white/30 text-sm">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-8">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <div>
            <h1 className="text-lg font-bold text-white">{show.band_name}</h1>
            <p className="text-xs text-white/40">{moment(show.date).format("MMM D, YYYY")} · {show.venue || "No venue"}</p>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-8 rounded-lg">
            <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        <CollapsibleSection title="Header Info" icon={Info} defaultOpen={true}>
          <div className="space-y-3 pt-3">
            <div>
              <Label className="text-white/50 text-xs">Band Name</Label>
              <Input value={show.band_name} onChange={(e) => update("band_name", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/50 text-xs">Venue</Label>
                <Input value={show.venue || ""} onChange={(e) => update("venue", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">Location</Label>
                <Input value={show.location || ""} onChange={(e) => update("location", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
              </div>
            </div>
            <div>
              <Label className="text-white/50 text-xs">Console</Label>
              <Input value={show.console || ""} onChange={(e) => update("console", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Contacts" icon={Users} badge={show.contacts?.length || 0}>
          <div className="space-y-3 pt-3">
            {(show.contacts || []).map((c, i) => (
              <div key={i} className="bg-[#111] rounded-xl p-3 space-y-2">
                <div className="flex justify-between">
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <Input value={c.name} onChange={(e) => updateContact(i, "name", e.target.value)} placeholder="Name" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                    <Input value={c.role} onChange={(e) => updateContact(i, "role", e.target.value)} placeholder="Role" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                    <Input value={c.phone} onChange={(e) => updateContact(i, "phone", e.target.value)} placeholder="Phone" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                    <Input value={c.email} onChange={(e) => updateContact(i, "email", e.target.value)} placeholder="Email" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                  </div>
                  <button onClick={() => removeContact(i)} className="p-1.5 ml-2 text-white/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addContact} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Contact</Button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Band Members" icon={Music} badge={show.band_members?.length || 0}>
          <div className="space-y-3 pt-3">
            {(show.band_members || []).map((m, i) => (
              <div key={i} className="bg-[#111] rounded-xl p-3 flex items-center gap-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input value={m.name} onChange={(e) => updateMember(i, "name", e.target.value)} placeholder="Name" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                  <Input value={m.instrument} onChange={(e) => updateMember(i, "instrument", e.target.value)} placeholder="Instrument" className="h-8 bg-transparent border-[#222] text-white text-sm" />
                </div>
                <button onClick={() => removeMember(i)} className="p-1.5 text-white/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addMember} className="text-[#8CFF3D] hover:bg-[#8CFF3D]/10 w-full"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Member</Button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Notes" icon={Zap}>
          <div className="pt-3">
            <Textarea value={show.general_notes || ""} onChange={(e) => update("general_notes", e.target.value)} className="bg-[#111] border-[#222] text-white min-h-[120px]" placeholder="Notes..." />
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
