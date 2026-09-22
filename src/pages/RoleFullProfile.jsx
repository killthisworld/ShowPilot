import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, LogIn, UserPlus, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import DocumentsUploader from "@/components/showpilot/DocumentsUploader";
import { usePreferences } from "@/hooks/usePreferences";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";
import { Field, RequirementsList, BandDetails, ROLE_COLORS, ROLE_OPTIONS } from "@/pages/SharedGig";

// The real, full-page editor for one role's section on one gig - reached
// from Gig Web's "Open full profile". Reuses the exact same data (get_shared_gig
// / get_gig_section_permissions) and save RPCs (update_gig_section,
// update_shared_gig) that SharedGig.jsx's inline accordion sections already
// use, so this works identically for the show's owner and for whichever
// invited promoter/agent/manager/engineer actually holds that section - it's
// the same section, just given a page of its own instead of a collapsed card.
const SECTION_LABELS = { venue: "Venue", promoter: "Promoter", booking_agent: "Booking Agent", manager: "Manager / Band", engineer: "Audio / Lighting" };

export default function RoleFullProfile() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const role = params.get("role");
  const currentPath = window.location.pathname + window.location.search;

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [gig, setGig] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedBands, setExpandedBands] = useState(new Set());
  const { preferences } = usePreferences();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setCheckingAuth(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!token || !role) { setNotFound(true); setLoading(false); return; }
      try {
        const [gigRes, permsRes] = await Promise.all([
          supabase.rpc("get_shared_gig", { p_token: token }),
          supabase.rpc("get_gig_section_permissions", { p_token: token }),
        ]);
        if (gigRes.error || !gigRes.data) { setNotFound(true); setLoading(false); return; }
        setGig({ ...gigRes.data, bands: (gigRes.data.bands || []).map((b, i) => ({ ...b, sort_order: i })) });
        setPermissions(permsRes.data || { is_owner: false, my_roles: [], claimed_roles: [], invited_roles: [], granted_sections: [] });
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [token, role]);

  const update = (field, val) => setGig((g) => ({ ...g, [field]: val }));
  const updateSection = (section, field, val) => setGig((g) => ({ ...g, [section]: { ...(g[section] || {}), [field]: val } }));
  const updateEngineerRole = (r, field, val) => setGig((g) => ({
    ...g,
    engineer_info: { ...(g.engineer_info || {}), [r]: { ...((g.engineer_info || {})[r] || {}), [field]: val } },
  }));

  const updateBand = (i, field, val) => {
    const bands = [...(gig.bands || [])];
    bands[i] = { ...bands[i], [field]: val };
    update("bands", bands);
  };
  const addBand = () => update("bands", [...(gig.bands || []), { role: "N/A", band_name: "", genre_tags: [], set_length_minutes: "", sort_order: (gig.bands || []).length }]);
  const removeBand = (i) => update("bands", (gig.bands || []).filter((_, idx) => idx !== i));
  const toggleExpanded = (i) => setExpandedBands((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const canEdit = !!user;
  const busPresets = preferences?.mix_bus_presets || [];
  const iemMonitorColors = {
    IEM: busPresets.find((p) => p.bus_type === "IEM")?.color || "#EAB308",
    Monitor: busPresets.find((p) => p.bus_type === "Monitor")?.color || "#F97316",
  };

  const canEditSection = (section) => {
    if (!canEdit) return false;
    if (permissions?.is_owner) return true;
    if (permissions?.my_roles?.includes(section)) return true;
    if (permissions?.granted_sections?.includes(section)) return true;
    return !!permissions?.invited_roles?.includes(section) && !permissions?.claimed_roles?.includes(section);
  };
  const canEditEngineerSection = () => {
    if (!canEdit) return false;
    if (permissions?.is_owner) return true;
    if (permissions?.my_roles?.includes("engineer") || permissions?.my_roles?.includes("lighting")) return true;
    if (permissions?.granted_sections?.includes("engineer") || permissions?.granted_sections?.includes("lighting")) return true;
    const invited = permissions?.invited_roles?.includes("engineer") || permissions?.invited_roles?.includes("lighting");
    const claimed = permissions?.claimed_roles?.includes("engineer") || permissions?.claimed_roles?.includes("lighting");
    return !!invited && !claimed;
  };
  const myEngineerRole = () => (permissions?.my_roles?.includes("lighting") && !permissions?.my_roles?.includes("engineer") ? "lighting" : "engineer");
  const editable = role === "engineer" ? canEditEngineerSection() : canEditSection(role);

  const markLinkedAndAccepted = async () => {
    if (!user || !gig?.id || permissions?.is_owner) return;
    await supabase.from("linked_gigs").upsert({ user_id: user.id, show_id: gig.id, share_token: token }, { onConflict: "user_id,show_id" });
  };

  const saveSection = async (sectionKey, data) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_gig_section", { p_token: token, p_section: sectionKey, p_updates: data });
      if (error) throw error;
      await markLinkedAndAccepted();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (role === "venue") {
      await saveSection("venue", {
        venue: gig.venue, city: gig.city, state: gig.state,
        wifi_network: gig.wifi_network, wifi_password: gig.wifi_password,
        console: gig.console, power_notes: gig.power_notes, venue_checklist: gig.venue_checklist,
      });
    } else if (role === "promoter") {
      await saveSection("promoter", gig.promoter_info || {});
    } else if (role === "booking_agent") {
      await saveSection("booking_agent", gig.booking_agent_info || {});
    } else if (role === "manager") {
      setSaving(true);
      try {
        const [sectionRes, bandsRes] = await Promise.all([
          supabase.rpc("update_gig_section", { p_token: token, p_section: "manager", p_updates: gig.manager_info || {} }),
          supabase.rpc("update_shared_gig", { p_token: token, p_updates: { bands: gig.bands || [] } }),
        ]);
        if (sectionRes.error) throw sectionRes.error;
        if (bandsRes.error) throw bandsRes.error;
        await markLinkedAndAccepted();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        console.error(e);
      }
      setSaving(false);
    } else if (role === "engineer") {
      await saveSection(myEngineerRole(), gig.engineer_info || {});
    }
  };

  const addRequirement = async (section, name, value) => {
    const { data, error } = await supabase.rpc("add_show_requirement", { p_token: token, p_section: section, p_name: name, p_value: value || null });
    if (error) { console.error(error); throw error; }
    setGig((g) => ({ ...g, requirements: [...(g.requirements || []), data] }));
  };
  const updateRequirementStatus = async (id, status) => {
    try {
      const { data, error } = await supabase.rpc("update_show_requirement", { p_token: token, p_requirement_id: id, p_status: status });
      if (error) throw error;
      setGig((g) => ({ ...g, requirements: (g.requirements || []).map((r) => (r.id === id ? data : r)) }));
    } catch (e) {
      console.error(e);
    }
  };
  const deleteRequirement = async (id) => {
    try {
      const { error } = await supabase.rpc("delete_show_requirement", { p_token: token, p_requirement_id: id });
      if (error) throw error;
      setGig((g) => ({ ...g, requirements: (g.requirements || []).filter((r) => r.id !== id) }));
    } catch (e) {
      console.error(e);
    }
  };

  const goSignIn = (toRegister) => {
    try { sessionStorage.setItem("post_auth_redirect", currentPath); } catch {}
    window.location.href = `${toRegister ? "/register" : "/login"}?redirect=${encodeURIComponent(currentPath)}`;
  };

  if (loading || checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !gig || !SECTION_LABELS[role]) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Not found</p>
          <p className="text-white/30 text-sm">This link may be invalid.</p>
        </div>
      </div>
    );
  }

  const style = ACCOUNT_TYPE_STYLES[role] || ACCOUNT_TYPE_STYLES.engineer;
  const Icon = style.icon;
  const title = SECTION_LABELS[role];
  const promoterInfo = gig.promoter_info || {};
  const bookingInfo = gig.booking_agent_info || {};
  const managerInfo = gig.manager_info || {};

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate(`/gig/web?token=${token}`)} className="p-1 text-white/60 hover:text-white shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: style.color + "18", color: style.color }}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-lg leading-tight truncate">{title}</h1>
            <p className="text-white/40 text-xs mt-0.5 truncate">{gig.event_name || gig.band_name || "Untitled Gig"}</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 max-w-lg mx-auto space-y-4">
        {!user && (
          <div className="bg-[#111] border border-[#222] rounded-2xl p-4 flex items-center justify-between gap-3">
            <p className="text-white/50 text-xs">Sign in to edit this section</p>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => goSignIn(false)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-1.5 rounded-lg hover:bg-[#222]">
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>
              <button onClick={() => goSignIn(true)} className="flex items-center gap-1.5 text-xs font-semibold text-black bg-[#8CFF3D] px-3 py-1.5 rounded-lg hover:bg-[#7ae62e]">
                <UserPlus className="w-3.5 h-3.5" /> Create Account
              </button>
            </div>
          </div>
        )}

        {!editable && user && !permissions?.is_owner && (
          <div className="bg-[#111] border border-[#222] rounded-2xl p-3.5">
            <p className="text-white/40 text-xs">This section is locked to whoever holds the {title} role on this gig. Ask the owner for an invite from the Gig page.</p>
          </div>
        )}

        {role === "venue" && (
          <>
            <Field label="Venue" value={gig.venue} onChange={(v) => update("venue", v)} editable={editable} placeholder="Venue name" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" value={gig.city} onChange={(v) => update("city", v)} editable={editable} placeholder="City" />
              <Field label="State" value={gig.state} onChange={(v) => update("state", v)} editable={editable} placeholder="State" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="WiFi Network" value={gig.wifi_network} onChange={(v) => update("wifi_network", v)} editable={editable} placeholder="Network name" />
              <Field label="WiFi Password" value={gig.wifi_password} onChange={(v) => update("wifi_password", v)} editable={editable} placeholder="Password" />
            </div>
            <Field label="Console" value={gig.console} onChange={(v) => update("console", v)} editable={editable} placeholder="e.g. Yamaha CL5" />
            <div>
              <Label className="text-white/50 text-xs">Power Notes</Label>
              {editable ? (
                <Textarea value={gig.power_notes || ""} onChange={(e) => update("power_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Power availability, circuits, etc." />
              ) : (
                <p className="mt-1 text-white/70 text-sm">{gig.power_notes || <span className="text-white/25">Not filled in yet</span>}</p>
              )}
            </div>
            <DocumentsUploader documents={gig.venue_documents} onChange={(docs) => update("venue_documents", docs)} uploadPathPrefix={`gig_docs/${gig.id}/venue`} editable={editable} />
            <RequirementsList requirements={(gig.requirements || []).filter((r) => r.section === "venue")} editable={editable} onAdd={(name, value) => addRequirement("venue", name, value)} onUpdateStatus={updateRequirementStatus} onDelete={deleteRequirement} />

            <a href={`/gig/venue?token=${token}`} className="flex items-center justify-between gap-2 bg-[#161616] border border-[#222222] rounded-[14px] px-4 py-3.5 text-white text-sm font-medium hover:bg-[#1a1a1a]">
              Other events at this venue
              <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
            </a>
          </>
        )}

        {role === "promoter" && (
          <>
            <Field label="Contact Name" value={promoterInfo.contact_name} onChange={(v) => updateSection("promoter_info", "contact_name", v)} editable={editable} placeholder="Name" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" value={promoterInfo.contact_phone} onChange={(v) => updateSection("promoter_info", "contact_phone", v)} editable={editable} placeholder="Phone" />
              <Field label="Email" value={promoterInfo.contact_email} onChange={(v) => updateSection("promoter_info", "contact_email", v)} editable={editable} placeholder="Email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Door Time" value={promoterInfo.door_time} onChange={(v) => updateSection("promoter_info", "door_time", v)} editable={editable} placeholder="e.g. 7:00 PM" />
              <Field label="Capacity" value={promoterInfo.capacity} onChange={(v) => updateSection("promoter_info", "capacity", v)} editable={editable} placeholder="e.g. 250" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ticket Price" value={promoterInfo.ticket_price} onChange={(v) => updateSection("promoter_info", "ticket_price", v)} editable={editable} placeholder="$20" />
              <Field label="Ticket Link" value={promoterInfo.ticket_link} onChange={(v) => updateSection("promoter_info", "ticket_link", v)} editable={editable} placeholder="URL" />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Settlement Notes</Label>
              {editable ? (
                <Textarea value={promoterInfo.settlement_notes || ""} onChange={(e) => updateSection("promoter_info", "settlement_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Payment terms" />
              ) : (
                <p className="mt-1 text-white/70 text-sm">{promoterInfo.settlement_notes || <span className="text-white/25">Not filled in yet</span>}</p>
              )}
            </div>
            <DocumentsUploader documents={promoterInfo.documents} onChange={(docs) => updateSection("promoter_info", "documents", docs)} uploadPathPrefix={`gig_docs/${gig.id}/promoter`} editable={editable} />
            <RequirementsList requirements={(gig.requirements || []).filter((r) => r.section === "promoter")} editable={editable} onAdd={(name, value) => addRequirement("promoter", name, value)} onUpdateStatus={updateRequirementStatus} onDelete={deleteRequirement} />
          </>
        )}

        {role === "booking_agent" && (
          <>
            <Field label="Contact Name" value={bookingInfo.contact_name} onChange={(v) => updateSection("booking_agent_info", "contact_name", v)} editable={editable} placeholder="Name" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" value={bookingInfo.contact_phone} onChange={(v) => updateSection("booking_agent_info", "contact_phone", v)} editable={editable} placeholder="Phone" />
              <Field label="Email" value={bookingInfo.contact_email} onChange={(v) => updateSection("booking_agent_info", "contact_email", v)} editable={editable} placeholder="Email" />
            </div>
            <Field label="Deal Terms" value={bookingInfo.deal_terms} onChange={(v) => updateSection("booking_agent_info", "deal_terms", v)} editable={editable} placeholder="Guarantee, percentage, etc." />
            <Field label="Contract Status" value={bookingInfo.contract_status} onChange={(v) => updateSection("booking_agent_info", "contract_status", v)} editable={editable} placeholder="Signed / Pending" />
            <Field label="Agency Contact" value={bookingInfo.agency_contact} onChange={(v) => updateSection("booking_agent_info", "agency_contact", v)} editable={editable} placeholder="Name, phone, or email" />
            <DocumentsUploader documents={bookingInfo.documents} onChange={(docs) => updateSection("booking_agent_info", "documents", docs)} uploadPathPrefix={`gig_docs/${gig.id}/booking_agent`} editable={editable} />
            <RequirementsList requirements={(gig.requirements || []).filter((r) => r.section === "booking_agent")} editable={editable} onAdd={(name, value) => addRequirement("booking_agent", name, value)} onUpdateStatus={updateRequirementStatus} onDelete={deleteRequirement} />
          </>
        )}

        {role === "manager" && (
          <>
            <Field label="Contact Name" value={managerInfo.contact_name} onChange={(v) => updateSection("manager_info", "contact_name", v)} editable={editable} placeholder="Name" />
            <Field label="Title" value={managerInfo.contact_title} onChange={(v) => updateSection("manager_info", "contact_title", v)} editable={editable} placeholder="e.g. Manager, Band Member" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" value={managerInfo.contact_phone} onChange={(v) => updateSection("manager_info", "contact_phone", v)} editable={editable} placeholder="Phone" />
              <Field label="Email" value={managerInfo.contact_email} onChange={(v) => updateSection("manager_info", "contact_email", v)} editable={editable} placeholder="Email" />
            </div>
            <div>
              <Label className="text-white/50 text-xs">Advancing Notes</Label>
              {editable ? (
                <Textarea value={managerInfo.advancing_notes || ""} onChange={(e) => updateSection("manager_info", "advancing_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Load-in, soundcheck confirmed, etc." />
              ) : (
                <p className="mt-1 text-white/70 text-sm">{managerInfo.advancing_notes || <span className="text-white/25">Not filled in yet</span>}</p>
              )}
            </div>
            <Field label="Guest List" value={managerInfo.guest_list} onChange={(v) => updateSection("manager_info", "guest_list", v)} editable={editable} placeholder="Names for the door" />
            <DocumentsUploader documents={managerInfo.documents} onChange={(docs) => updateSection("manager_info", "documents", docs)} uploadPathPrefix={`gig_docs/${gig.id}/manager`} editable={editable} />
            <RequirementsList requirements={(gig.requirements || []).filter((r) => r.section === "manager")} editable={editable} onAdd={(name, value) => addRequirement("manager", name, value)} onUpdateStatus={updateRequirementStatus} onDelete={deleteRequirement} />

            <div className="pt-2 border-t border-white/10">
              <div className="flex items-center justify-between mb-3 pt-2">
                <p className="text-white font-semibold text-sm">Lineup</p>
                {canEdit && (
                  <button onClick={addBand} className="flex items-center gap-1 text-[#8CFF3D] text-xs font-semibold hover:bg-[#8CFF3D]/10 px-2 py-1 rounded-lg">
                    <Plus className="w-3.5 h-3.5" /> Add Act
                  </button>
                )}
              </div>
              {(!gig.bands || gig.bands.length === 0) && !canEdit && <p className="text-white/30 text-sm">No lineup info yet.</p>}
              <div className="space-y-2">
                {(gig.bands || []).map((b, i) => {
                  const colors = ROLE_COLORS[b.role] || ROLE_COLORS["N/A"];
                  if (!canEdit) {
                    if (!b.band_name) return null;
                    const hasDetails = (b.band_members && b.band_members.length > 0) || b.stage_plot_url || (b.stage_plot_files && b.stage_plot_files.length > 0) || b.artist_fx_notes || b.general_notes || b.submitter_name || b.submitter_phone || b.submitter_email;
                    const expanded = expandedBands.has(i);
                    return (
                      <div key={i} className="bg-[#1a1a1a] rounded-xl overflow-hidden">
                        <div onClick={() => hasDetails && toggleExpanded(i)} className={`flex items-center justify-between px-3 py-2.5 ${hasDetails ? "cursor-pointer" : ""}`}>
                          <div className="min-w-0 flex items-center gap-1.5">
                            {hasDetails && <ChevronDown className={`w-3.5 h-3.5 text-white/30 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />}
                            <div className="min-w-0">
                              <p className="text-white text-sm font-medium truncate">{b.band_name}</p>
                              {b.genre_tags && b.genre_tags.length > 0 && <p className="text-white/30 text-xs truncate">{b.genre_tags.join(", ")}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {b.set_length_minutes && <span className="text-white/40 text-xs">{b.set_length_minutes} min</span>}
                            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${colors.text} ${colors.bg}`}>{b.role}</span>
                          </div>
                        </div>
                        {expanded && <BandDetails band={b} editable={false} onUpdate={() => {}} iemMonitorColors={iemMonitorColors} />}
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="bg-[#1a1a1a] rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input value={b.band_name || ""} onChange={(e) => updateBand(i, "band_name", e.target.value)} placeholder="Artist / Group Name" className="flex-1 h-8 bg-[#111] border-[#222] text-white text-sm" />
                        <button onClick={() => removeBand(i)} className="p-1.5 text-white/30 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex gap-1 flex-wrap">
                          {ROLE_OPTIONS.map((r) => {
                            const c = ROLE_COLORS[r];
                            const active = (b.role || "N/A") === r;
                            return (
                              <button key={r} onClick={() => updateBand(i, "role", r)} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border transition-all ${active ? `${c.text} ${c.bg} ${c.border}` : "text-white/30 border-transparent hover:text-white/50"}`}>
                                {r}
                              </button>
                            );
                          })}
                        </div>
                        <Input type="number" value={b.set_length_minutes || ""} onChange={(e) => updateBand(i, "set_length_minutes", e.target.value)} placeholder="Set (min)" className="h-7 w-24 bg-[#111] border-[#222] text-white text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                      <button onClick={() => toggleExpanded(i)} className="flex items-center gap-1 text-[#8CFF3D] text-xs font-medium hover:underline">
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedBands.has(i) ? "rotate-180" : ""}`} />
                        {expandedBands.has(i) ? "Hide" : "Show"} tech details
                      </button>
                      {expandedBands.has(i) && <BandDetails band={b} editable={true} onUpdate={(field, val) => updateBand(i, field, val)} iemMonitorColors={iemMonitorColors} />}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {role === "engineer" && (
          <>
            {["audio", "lighting"].map((r, i) => {
              const info = (gig.engineer_info || {})[r] || {};
              return (
                <div key={r} className={i > 0 ? "pt-3 mt-3 border-t border-white/10" : ""}>
                  <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-2">{r === "audio" ? "Audio Engineer" : "Lighting Tech"}</p>
                  <Field label="Contact Name" value={info.contact_name} onChange={(v) => updateEngineerRole(r, "contact_name", v)} editable={editable} placeholder="Name" />
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <Field label="Phone" value={info.contact_phone} onChange={(v) => updateEngineerRole(r, "contact_phone", v)} editable={editable} placeholder="Phone" />
                    <Field label="Email" value={info.contact_email} onChange={(v) => updateEngineerRole(r, "contact_email", v)} editable={editable} placeholder="Email" />
                  </div>
                </div>
              );
            })}
            <RequirementsList requirements={(gig.requirements || []).filter((r) => r.section === "engineer")} editable={editable} onAdd={(name, value) => addRequirement("engineer", name, value)} onUpdateStatus={updateRequirementStatus} onDelete={deleteRequirement} />
          </>
        )}
      </div>

      {editable && (
        <div className="fixed left-0 right-0 bottom-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-t border-[#1a1a1a] px-4 py-3">
          <div className="max-w-lg mx-auto">
            <button onClick={handleSave} disabled={saving} className="w-full font-bold text-sm rounded-2xl px-4 py-3.5 disabled:opacity-50" style={{ background: style.color, color: "#0d0d0d" }}>
              {saved ? "Saved ✓" : saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
