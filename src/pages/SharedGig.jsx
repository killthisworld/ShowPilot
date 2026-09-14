import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Calendar, Music, LogIn, UserPlus, Plus, Trash2, Save, ArrowLeft, Wifi, Speaker, Zap, Lock, User, Ticket, FileSignature, ChevronDown, Users, Image as ImageIcon, Copy, Check, X, Headphones, ExternalLink, Share2 } from "lucide-react";
import BottomTabs from "@/components/showpilot/BottomTabs";
import BandBottomTabs from "@/components/showpilot/BandBottomTabs";
import { usePreferences } from "@/hooks/usePreferences";

const ROLE_COLORS = {
  Headliner: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-400/40" },
  Opener: { text: "text-[#8CFF3D]", bg: "bg-[#8CFF3D]/10", border: "border-[#8CFF3D]/40" },
  "Performer/Group": { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-400/40" },
  "N/A": { text: "text-white/50", bg: "bg-white/10", border: "border-white/20" },
};
const ROLE_OPTIONS = ["Opener", "Headliner", "Performer/Group", "N/A"];
const EVENT_TYPES = ["Concert", "Comedy Show", "Theatre Play", "Corporate Event", "Private Party", "Festival", "Open Mic", "Other"];

// One color per section, consistent everywhere this app shows section
// progress (the Home page progress bar uses the same palette) so position
// and color together become a language the user only has to learn once.
const SECTION_COLORS = {
  venue: "#FB923C",
  promoter: "#60A5FA",
  booking_agent: "#C026D3",
  manager: "#EF4444",
  engineer: "#8CFF3D",
};
const ENGINEER_ROLE_OPTIONS = [
  { value: "engineer", label: "Audio Engineer" },
  { value: "lighting", label: "Lighting Tech" },
];

// A card wrapper for each role-owned section. Collapsed by default so a
// long list of sections stays scannable; outlined in the role's color so
// position + color together teach the viewer what's what across every
// event. Shows a lock indicator when the section is claimed by a role the
// current viewer doesn't hold, an inline Invite affordance for the owner,
// and a per-section Update button for whoever can actually edit it - so
// nobody has to save the whole page just to log their own update.
function GigSection({ title, icon: Icon, color, locked, editable, isOwner, onInvite, onSave, saving, saved, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: color }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 p-3.5"
        style={{ backgroundColor: color + "14" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 shrink-0" style={{ color }} />
          <p className="font-semibold text-sm truncate" style={{ color }}>{title}</p>
          {locked && <Lock className="w-3 h-3 text-white/30 shrink-0" />}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isOwner && onInvite && (
            <button
              type="button"
              onClick={onInvite}
              className="text-[10px] font-semibold px-2 py-1 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors"
            >
              Invite
            </button>
          )}
          {editable && onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="text-[10px] font-semibold px-2 py-1 rounded-full transition-colors disabled:opacity-50"
              style={{ color, backgroundColor: color + "22" }}
            >
              {saved ? "Updated ✓" : saving ? "Saving..." : "Update"}
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-white/40 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && <div className="p-4 space-y-3 bg-[#161616]">{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, editable, placeholder, type = "text" }) {
  return (
    <div>
      <Label className="text-white/50 text-xs">{label}</Label>
      {editable ? (
        <Input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 bg-[#111] border-[#222] text-white"
        />
      ) : (
        <p className="mt-1 text-white/70 text-sm min-h-[20px]">{value || <span className="text-white/25">Not filled in yet</span>}</p>
      )}
    </div>
  );
}

// Technical details for one act - band members with per-instrument mic/DI
// and phantom power needs, stage plot files, and per-member FX notes plus
// general notes. Read-only for anyone without access; fully editable for
// anyone who does, matching what the event owner can already do on their
// own version of this show.
function getMemberNote(fxNotes, name) {
  return (fxNotes || []).find((n) => n.artist_name === name)?.notes || "";
}

function BandDetails({ band, editable, onUpdate }) {
  const [noteModal, setNoteModal] = useState(null); // { label, value, onChange }

  const members = band.band_members || [];
  const fxNotes = band.artist_fx_notes || [];
  const stagePlotFiles = band.stage_plot_files || [];

  const updateMembers = (next) => onUpdate("band_members", next);
  const updateMemberBusType = (i, busType) => {
    const next = [...members];
    next[i] = { ...next[i], bus_type: busType };
    updateMembers(next);
  };

  const addMember = () => updateMembers([...members, { name: "", instruments: [] }]);
  const updateMemberName = (i, name) => {
    const next = [...members];
    next[i] = { ...next[i], name };
    updateMembers(next);
  };
  const removeMember = (i) => updateMembers(members.filter((_, idx) => idx !== i));

  const addInstrument = (i) => {
    const next = [...members];
    next[i] = { ...next[i], instruments: [...(next[i].instruments || []), { name: "", mic_di: "Mic", phantom_power: false }] };
    updateMembers(next);
  };
  const updateInstrument = (i, ii, field, val) => {
    const next = [...members];
    const instruments = [...(next[i].instruments || [])];
    instruments[ii] = { ...instruments[ii], [field]: val };
    next[i] = { ...next[i], instruments };
    updateMembers(next);
  };
  const removeInstrument = (i, ii) => {
    const next = [...members];
    next[i] = { ...next[i], instruments: (next[i].instruments || []).filter((_, idx) => idx !== ii) };
    updateMembers(next);
  };

  const updateMemberNote = (name, notes) => {
    const existing = [...fxNotes];
    const idx = existing.findIndex((n) => n.artist_name === name);
    if (idx >= 0) existing[idx] = { ...existing[idx], notes };
    else existing.push({ artist_name: name, notes });
    onUpdate("artist_fx_notes", existing);
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const filePath = `${user.id}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("stage-plots").upload(filePath, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("stage-plots").getPublicUrl(filePath);
        const isImage = file.type.startsWith("image/");
        onUpdate("stage_plot_files", [...(band.stage_plot_files || []), { url: urlData.publicUrl, name: file.name, type: file.type }]);
        if (isImage && !band.stage_plot_url) onUpdate("stage_plot_url", urlData.publicUrl);
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = "";
  };

  const removeFile = (i) => onUpdate("stage_plot_files", stagePlotFiles.filter((_, idx) => idx !== i));

  const stagePlotImages = [...(band.stage_plot_url ? [{ url: band.stage_plot_url, type: "image/" }] : []), ...stagePlotFiles];

  const noteModalOverlay = noteModal && (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setNoteModal(null)}>
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b border-[#222] shrink-0">
          <button onClick={() => setNoteModal(null)} className="text-white/50 hover:text-white p-1.5 -ml-1.5 rounded-lg hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <p className="text-white font-semibold text-sm">{noteModal.label}</p>
        </div>
        <div className="p-4 overflow-y-auto">
          <Textarea
            value={noteModal.value}
            onChange={noteModal.onChange ? (e) => noteModal.onChange(e.target.value) : undefined}
            readOnly={!noteModal.onChange}
            autoFocus={!!noteModal.onChange}
            className="bg-[#111] border-[#222] text-white text-sm min-h-[220px]"
          />
        </div>
      </div>
    </div>
  );

  if (!editable) {
    return (
      <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#222] mt-1">
        {members.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-white/40 text-[11px] uppercase tracking-wide font-semibold mb-1.5">
              <Users className="w-3 h-3" /> Band Members
            </p>
            <div className="space-y-1.5">
              {members.map((m, mi) => {
                const note = getMemberNote(fxNotes, m.name);
                return (
                  <div key={mi} className="text-sm">
                    <span className="text-white font-medium">{m.name || "Unnamed"}</span>
                    {m.bus_type && (
                      <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">{m.bus_type}</span>
                    )}
                    {m.instruments && m.instruments.length > 0 && (
                      <span className="text-white/50">
                        {" — "}
                        {m.instruments.map((inst, ii) => (
                          <span key={ii}>
                            {ii > 0 && ", "}
                            {inst.name}
                            {(inst.mic_di || inst.phantom_power) && (
                              <span className="text-white/30">
                                {" ("}
                                {[inst.mic_di, inst.phantom_power ? "+48V" : null].filter(Boolean).join(", ")}
                                {")"}
                              </span>
                            )}
                          </span>
                        ))}
                      </span>
                    )}
                    {note && (
                      <p
                        onClick={() => setNoteModal({ label: `${m.name || "Member"} — Notes`, value: note })}
                        className="text-white/30 text-xs mt-0.5 truncate cursor-pointer hover:text-white/50"
                      >
                        {note}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {stagePlotImages.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-white/40 text-[11px] uppercase tracking-wide font-semibold mb-1.5">
              <ImageIcon className="w-3 h-3" /> Stage Plot
            </p>
            <div className="flex gap-2 flex-wrap">
              {stagePlotImages.map((f, ui) => (
                <a key={ui} href={f.url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden border border-[#333] hover:border-[#8CFF3D]/50">
                  {(!f.type || f.type.startsWith("image/")) ? (
                    <img src={f.url} alt="Stage plot" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center text-white/40 text-[10px] p-1 text-center">{f.name}</div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
        {(band.submitter_name || band.submitter_phone || band.submitter_email) && (
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-wide font-semibold mb-1">Submitted By</p>
            <p className="text-white/70 text-sm">{band.submitter_name || "Unnamed"}</p>
            <p className="text-white/40 text-xs">{[band.submitter_phone, band.submitter_email].filter(Boolean).join(" · ")}</p>
            {band.submitter_card_share_token && (
              <a href={`/pilot/${band.submitter_card_share_token}`} target="_blank" rel="noopener noreferrer" className="text-[#8CFF3D] text-xs hover:underline">
                View {band.submitter_card_display_name || "their"} ShowPilot card
              </a>
            )}
          </div>
        )}
        {band.general_notes && (
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-wide font-semibold mb-1">General Notes</p>
            <p
              onClick={() => setNoteModal({ label: "General Notes", value: band.general_notes })}
              className="text-white/70 text-sm truncate cursor-pointer hover:text-white"
            >
              {band.general_notes}
            </p>
          </div>
        )}
        {noteModalOverlay}
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#222] mt-1">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="flex items-center gap-1.5 text-white/40 text-[11px] uppercase tracking-wide font-semibold">
            <Users className="w-3 h-3" /> Band Members
          </p>
          <button onClick={addMember} className="text-[#8CFF3D] text-xs font-medium hover:bg-[#8CFF3D]/10 px-3 py-2 rounded-lg">+ Add Member</button>
        </div>
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={i} className="bg-[#111] rounded-lg p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <Input value={m.name || ""} onChange={(e) => updateMemberName(i, e.target.value)} placeholder="Member name" className="h-9 bg-[#1a1a1a] border-[#222] text-white text-xs flex-1" />
                <select
                  value={m.bus_type || "IEM"}
                  onChange={(e) => updateMemberBusType(i, e.target.value)}
                  className="h-9 bg-[#1a1a1a] border border-[#222] text-white text-xs rounded px-1.5 shrink-0"
                >
                  <option value="IEM">IEM</option>
                  <option value="Monitor">Monitor</option>
                </select>
                <button onClick={() => removeMember(i)} className="text-white/30 hover:text-red-400 shrink-0 p-2 -m-1"><Trash2 className="w-5 h-5" /></button>
              </div>
              {(m.instruments || []).map((inst, ii) => (
                <div key={ii} className="flex items-center gap-1.5 pl-2">
                  <Input value={inst.name || ""} onChange={(e) => updateInstrument(i, ii, "name", e.target.value)} placeholder="Instrument" className="h-8 bg-[#1a1a1a] border-[#222] text-white text-xs flex-1" />
                  <select
                    value={inst.mic_di || "Mic"}
                    onChange={(e) => updateInstrument(i, ii, "mic_di", e.target.value)}
                    className="h-8 bg-[#1a1a1a] border border-[#222] text-white text-xs rounded px-1.5"
                  >
                    <option value="Mic">Mic</option>
                    <option value="DI">DI</option>
                  </select>
                  <button
                    onClick={() => updateInstrument(i, ii, "phantom_power", !inst.phantom_power)}
                    className={`text-xs font-medium px-3 py-2 rounded shrink-0 ${inst.phantom_power ? "bg-[#8CFF3D]/20 text-[#8CFF3D]" : "text-white/30 border border-[#333]"}`}
                  >
                    +48V
                  </button>
                  <button onClick={() => removeInstrument(i, ii)} className="text-white/20 hover:text-red-400 shrink-0 p-2 -m-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => addInstrument(i)} className="text-[#8CFF3D] text-xs font-medium hover:bg-[#8CFF3D]/10 px-3 py-2 rounded-lg ml-1">+ Instrument</button>
              <button
                onClick={() => setNoteModal({
                  label: `${m.name || "Member"} — Notes`,
                  value: getMemberNote(fxNotes, m.name),
                  onChange: (v) => updateMemberNote(m.name, v),
                })}
                className="w-full text-left text-white/40 text-xs bg-[#1a1a1a] border border-[#222] rounded-lg px-3 py-2.5 hover:border-[#8CFF3D]/40 hover:text-white/60 truncate ml-2"
                style={{ width: "calc(100% - 0.5rem)" }}
              >
                {getMemberNote(fxNotes, m.name) || "Add notes for this member (FX, monitor mix, etc.)"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="flex items-center gap-1.5 text-white/40 text-[11px] uppercase tracking-wide font-semibold">
            <ImageIcon className="w-3 h-3" /> Stage Plot
          </p>
          <label className="text-[#8CFF3D] text-xs font-medium hover:bg-[#8CFF3D]/10 px-3 py-2 rounded-lg cursor-pointer">
            + Upload
            <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleUpload} />
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
          {stagePlotFiles.map((f, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#333]">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                {f.type?.startsWith("image/") ? (
                  <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center text-white/40 text-[10px] p-1 text-center">{f.name}</div>
                )}
              </a>
              <button onClick={() => removeFile(i)} className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-black/70 text-white/80 hover:text-white flex items-center justify-center text-sm">✕</button>
            </div>
          ))}
        </div>
      </div>

      {(band.submitter_name || band.submitter_phone || band.submitter_email) && (
        <div className="bg-[#111] border border-[#222] rounded-lg p-2.5">
          <p className="text-white/40 text-[11px] uppercase tracking-wide font-semibold mb-1">Submitted By</p>
          <p className="text-white/70 text-sm">{band.submitter_name || "Unnamed"}</p>
          <p className="text-white/40 text-xs">{[band.submitter_phone, band.submitter_email].filter(Boolean).join(" · ")}</p>
          {band.submitter_card_share_token && (
            <a href={`/pilot/${band.submitter_card_share_token}`} target="_blank" rel="noopener noreferrer" className="text-[#8CFF3D] text-xs hover:underline">
              View {band.submitter_card_display_name || "their"} ShowPilot card
            </a>
          )}
        </div>
      )}

      <button
        onClick={() => setNoteModal({ label: "General Notes", value: band.general_notes || "", onChange: (v) => onUpdate("general_notes", v) })}
        className="w-full text-left"
      >
        <Label className="text-white/40 text-[11px] uppercase tracking-wide font-semibold cursor-pointer">General Notes</Label>
        <p className="mt-1 bg-[#111] border border-[#222] rounded-lg px-3 py-2.5 text-white/50 text-sm truncate hover:border-[#8CFF3D]/40 hover:text-white/70">
          {band.general_notes || "Add general notes"}
        </p>
      </button>

      {noteModalOverlay}
    </div>
  );
}

export default function SharedGig() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  const inviteToken = params.get("invite");
  const [resolvedToken, setResolvedToken] = useState(inviteToken ? null : urlToken);
  const currentPath = window.location.pathname + window.location.search;

  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [gig, setGig] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { preferences } = usePreferences();
  const [sectionSaving, setSectionSaving] = useState({});
  const [sectionSaved, setSectionSaved] = useState({});
  const [inviteFor, setInviteFor] = useState(null); // { section, label } while the invite popover is open
  const [inviteRoleChoice, setInviteRoleChoice] = useState(null); // for the engineer section's dual role choice
  const [inviteUrl, setInviteUrl] = useState(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [engineerCards, setEngineerCards] = useState({});
  const [isLinkedAlready, setIsLinkedAlready] = useState(false);

  useEffect(() => {
    const audioId = (gig?.engineer_info || {}).audio?.card_user_id;
    const lightingId = (gig?.engineer_info || {}).lighting?.card_user_id;
    const ids = [audioId, lightingId].filter(Boolean);
    if (ids.length === 0) return;
    supabase
      .from("user_preferences")
      .select("user_id, display_name, card_share_token")
      .in("user_id", ids)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach((row) => { map[row.user_id] = row; });
        setEngineerCards(map);
      });
  }, [gig?.engineer_info]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setCheckingAuth(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    const resolveInvite = async () => {
      try {
        const { data, error } = await supabase.rpc("get_gig_invite", { p_token: inviteToken });
        if (error || !data || !data.share_token) { setNotFound(true); setLoading(false); return; }
        setResolvedToken(data.share_token);
      } catch (e) {
        console.error(e);
        setNotFound(true);
        setLoading(false);
      }
    };
    resolveInvite();
  }, [inviteToken]);

  useEffect(() => {
    const load = async () => {
      if (!resolvedToken) {
        if (!inviteToken && !urlToken) { setNotFound(true); setLoading(false); }
        return;
      }
      try {
        const [gigRes, permsRes] = await Promise.all([
          supabase.rpc("get_shared_gig", { p_token: resolvedToken }),
          supabase.rpc("get_gig_section_permissions", { p_token: resolvedToken }),
        ]);
        if (gigRes.error) throw gigRes.error;
        if (!gigRes.data) { setNotFound(true); setLoading(false); return; }
        setGig({ ...gigRes.data, bands: (gigRes.data.bands || []).map((b, i) => ({ ...b, sort_order: i })) });
        if (permsRes.error) console.error(permsRes.error);
        setPermissions(permsRes.data || { is_owner: false, my_roles: [], claimed_roles: [] });

        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser && gigRes.data.id) {
          const { data: linkRow } = await supabase
            .from("linked_gigs")
            .select("id")
            .eq("user_id", authUser.id)
            .eq("show_id", gigRes.data.id)
            .maybeSingle();
          setIsLinkedAlready(!!linkRow);
        }
      } catch (e) {
        console.error(e);
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [resolvedToken]);

  const update = (field, val) => setGig((g) => ({ ...g, [field]: val }));
  const updateSection = (section, field, val) =>
    setGig((g) => ({ ...g, [section]: { ...(g[section] || {}), [field]: val } }));
  const updateEngineerRole = (role, field, val) =>
    setGig((g) => ({
      ...g,
      engineer_info: {
        ...(g.engineer_info || {}),
        [role]: { ...((g.engineer_info || {})[role] || {}), [field]: val },
      },
    }));
  const toggleConnectCard = (role) => {
    if (!user) {
      const path = window.location.pathname + window.location.search;
      try { sessionStorage.setItem("post_auth_redirect", path); } catch {}
      navigate("/login?redirect=" + encodeURIComponent(path));
      return;
    }
    const current = (gig.engineer_info || {})[role] || {};
    updateEngineerRole(role, "card_user_id", current.card_user_id === user.id ? null : user.id);
  };
  const [expandedBands, setExpandedBands] = useState(new Set());
  const toggleExpanded = (i) => {
    setExpandedBands((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const updateBand = (i, field, val) => {
    const bands = [...gig.bands];
    bands[i] = { ...bands[i], [field]: val };
    update("bands", bands);
  };
  const addBand = () => update("bands", [...(gig.bands || []), { role: "N/A", band_name: "", genre_tags: [], set_length_minutes: "", sort_order: gig.bands.length }]);
  const removeBand = (i) => update("bands", gig.bands.filter((_, idx) => idx !== i));

  const canEdit = !!user;
  const isTechProductionAccount = ["engineer", "lighting"].includes(preferences?.account_type || "engineer");
  const canEditSection = (section) => {
    if (!canEdit) return false;
    if (permissions?.is_owner) return true;
    if (permissions?.my_roles?.includes(section)) return true;
    return !permissions?.claimed_roles?.includes(section);
  };
  const isLocked = (section) => canEdit && !permissions?.is_owner && !canEditSection(section);

  // The Engineer/Lighting section covers two distinct invite roles that
  // write to the same data, so its permission check considers either role
  // held, and the section counts as "claimed" if either has been accepted.
  const canEditEngineerSection = () => {
    if (!canEdit) return false;
    if (permissions?.is_owner) return true;
    if (permissions?.my_roles?.includes("engineer") || permissions?.my_roles?.includes("lighting")) return true;
    return !permissions?.claimed_roles?.includes("engineer") && !permissions?.claimed_roles?.includes("lighting");
  };
  const isEngineerLocked = () => canEdit && !permissions?.is_owner && !canEditEngineerSection();
  const isSectionIncluded = (key) => !gig?.included_sections || gig.included_sections.includes(key);
  const ACCOUNT_TYPE_TO_SECTION = { band: "manager", venue: "venue", promoter: "promoter", booking_agent: "booking_agent", manager: "manager" };
  const isMyOwnerSection = (key) => permissions?.is_owner && ACCOUNT_TYPE_TO_SECTION[preferences?.account_type] === key;
  const isMyOwnerEngineerSection = () => permissions?.is_owner && ["engineer", "lighting"].includes(preferences?.account_type);
  const myEngineerRole = () => (permissions?.my_roles?.includes("lighting") && !permissions?.my_roles?.includes("engineer") ? "lighting" : "engineer");

  // Marks the gig as linked to this account and accepts any invite that
  // brought them here - called after any section save so a person only
  // ever touching their own section still ends up properly linked.
  const markLinkedAndAccepted = async () => {
    if (!user || !gig?.id) return;
    // The owner never needs to be linked to their own show - doing so
    // creates a self-referential linked_gigs row that then makes the
    // event appear twice on their own Home page (once as owned, once as
    // linked).
    if (permissions?.is_owner) return;
    await supabase
      .from("linked_gigs")
      .upsert({ user_id: user.id, show_id: gig.id, share_token: resolvedToken }, { onConflict: "user_id,show_id" });
    if (inviteToken) {
      await supabase.rpc("accept_gig_invite", { p_token: inviteToken });
    }
    setIsLinkedAlready(true);
  };

  const saveSection = async (sectionKey, data) => {
    setSectionSaving((s) => ({ ...s, [sectionKey]: true }));
    try {
      const { error } = await supabase.rpc("update_gig_section", { p_token: resolvedToken, p_section: sectionKey, p_updates: data });
      if (error) throw error;
      await markLinkedAndAccepted();
      setSectionSaved((s) => ({ ...s, [sectionKey]: true }));
      setTimeout(() => setSectionSaved((s) => ({ ...s, [sectionKey]: false })), 2000);
    } catch (e) {
      console.error(e);
    }
    setSectionSaving((s) => ({ ...s, [sectionKey]: false }));
  };

  const saveVenueSection = () => saveSection("venue", {
    venue: gig.venue, city: gig.city, state: gig.state,
    wifi_network: gig.wifi_network, wifi_password: gig.wifi_password,
    console: gig.console, power_notes: gig.power_notes, venue_checklist: gig.venue_checklist,
  });
  // This section covers both the Manager contact fields (saved via
  // update_gig_section) and the Lineup/band members list, which lives in
  // a separate table and is only persisted through update_shared_gig -
  // so its Update button needs to trigger both saves together.
  const saveManagerSection = async () => {
    setSectionSaving((s) => ({ ...s, manager: true }));
    try {
      const [sectionRes, bandsRes] = await Promise.all([
        supabase.rpc("update_gig_section", { p_token: resolvedToken, p_section: "manager", p_updates: gig.manager_info || {} }),
        supabase.rpc("update_shared_gig", { p_token: resolvedToken, p_updates: { bands: gig.bands || [] } }),
      ]);
      if (sectionRes.error) throw sectionRes.error;
      if (bandsRes.error) throw bandsRes.error;
      await markLinkedAndAccepted();
      setSectionSaved((s) => ({ ...s, manager: true }));
      setTimeout(() => setSectionSaved((s) => ({ ...s, manager: false })), 2000);
    } catch (e) {
      console.error(e);
    }
    setSectionSaving((s) => ({ ...s, manager: false }));
  };
  const savePromoterSection = () => saveSection("promoter", gig.promoter_info || {});
  const saveBookingSection = () => saveSection("booking_agent", gig.booking_agent_info || {});
  const saveEngineerSection = () => saveSection(myEngineerRole(), gig.engineer_info || {});

  const openInvite = (section, label) => {
    setInviteFor({ section, label });
    setInviteRoleChoice(null);
    setInviteUrl(null);
    setInviteCopied(false);
  };

  const generateInvite = async (role) => {
    if (!gig?.id || !user) return;
    setGeneratingInvite(true);
    try {
      const { data, error } = await supabase
        .from("gig_invites")
        .insert({ show_id: gig.id, invited_role: role, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      setInviteUrl(`${window.location.origin}/gig/shared?invite=${data.invite_token}`);
    } catch (e) {
      console.error(e);
    }
    setGeneratingInvite(false);
  };

  const copyInviteUrl = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const shareInviteUrl = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.share({ title: `${inviteFor?.label || "Gig"} Invite`, url: inviteUrl });
    } catch (e) {
      // user cancelled - nothing to do
    }
  };

  // Handles the top-level event details (name, date, venue basics) plus
  // marking the gig linked - the 5 role sections below now save
  // independently via their own Update buttons.
  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_shared_gig", { p_token: resolvedToken, p_updates: gig });
      if (error) throw error;
      await markLinkedAndAccepted();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  if (loading || checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !gig) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/50 text-lg mb-2">Gig not found</p>
          <p className="text-white/30 text-sm">This share link may be invalid.</p>
        </div>
      </div>
    );
  }

  const title = gig.event_name || gig.band_name || "Untitled Gig";
  const location = [gig.venue, [gig.city, gig.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const managerInfo = gig.manager_info || {};
  const promoterInfo = gig.promoter_info || {};
  const bookingInfo = gig.booking_agent_info || {};

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(-1)} className="p-1 text-white/60 hover:text-white shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-white font-bold text-lg leading-tight truncate">{title}</h1>
              <p className="text-white/40 text-xs mt-0.5">{canEdit ? "Editing shared gig" : "Viewing shared gig"}</p>
            </div>
          </div>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 flex items-center gap-1.5 bg-[#8CFF3D] text-black font-semibold text-sm px-3 py-2 rounded-xl hover:bg-[#7ae62e] transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : saved ? "Saved ✓" : (permissions?.is_owner || isLinkedAlready) ? "Save" : "Save to Linked"}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        {!canEdit && (
          <div className="bg-[#111] border border-[#222] rounded-2xl p-4 flex items-center justify-between gap-3">
            <p className="text-white/50 text-xs">Sign in to edit this gig</p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  try { sessionStorage.setItem("post_auth_redirect", currentPath); } catch {}
                  window.location.href = "/login?redirect=" + encodeURIComponent(currentPath);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-1.5 rounded-lg hover:bg-[#222]"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>
              <button
                onClick={() => {
                  try { sessionStorage.setItem("post_auth_redirect", currentPath); } catch {}
                  window.location.href = "/register?redirect=" + encodeURIComponent(currentPath);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-black bg-[#8CFF3D] px-3 py-1.5 rounded-lg hover:bg-[#7ae62e]"
              >
                <UserPlus className="w-3.5 h-3.5" /> Create Account
              </button>
            </div>
          </div>
        )}

        <div className="bg-[#161616] rounded-2xl border border-[#222] p-4 space-y-3">
          {canEdit ? (
            <>
              <div>
                <Label className="text-white/50 text-xs">Event Name</Label>
                <Input value={gig.event_name || ""} onChange={(e) => update("event_name", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white" placeholder="e.g. Friday Night Showcase" />
              </div>
              <div>
                <Label className="text-white/50 text-xs">Event Type</Label>
                <Select value={gig.event_type || ""} onValueChange={(v) => update("event_type", v)}>
                  <SelectTrigger className="mt-1 h-10 bg-[#111] border-[#222] text-white w-48">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white/50 text-xs">Date *</Label>
                <Input type="date" value={gig.date || ""} onChange={(e) => update("date", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white [color-scheme:dark] w-44" />
              </div>
            </>
          ) : (
            <>
              {gig.date && (
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <Calendar className="w-4 h-4 text-white/30 shrink-0" />
                  <span>{new Date(gig.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
              )}
              {gig.event_type && <p className="text-white/40 text-xs">{gig.event_type}</p>}
            </>
          )}
        </div>

        {isSectionIncluded("venue") && (
        <GigSection title={`Venue${(permissions?.my_roles?.includes("venue") || isMyOwnerSection("venue")) ? " (You)" : ""}`} icon={MapPin} color={SECTION_COLORS.venue} locked={isLocked("venue")} editable={canEditSection("venue")} isOwner={permissions?.is_owner} onInvite={() => openInvite("venue", "Venue")} onSave={saveVenueSection} saving={sectionSaving.venue} saved={sectionSaved.venue}>
          <Field label="Venue" value={gig.venue} onChange={(v) => update("venue", v)} editable={canEditSection("venue")} placeholder="Venue name" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={gig.city} onChange={(v) => update("city", v)} editable={canEditSection("venue")} placeholder="City" />
            <Field label="State" value={gig.state} onChange={(v) => update("state", v)} editable={canEditSection("venue")} placeholder="State" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="WiFi Network" value={gig.wifi_network} onChange={(v) => update("wifi_network", v)} editable={canEditSection("venue")} placeholder="Network name" />
            <Field label="WiFi Password" value={gig.wifi_password} onChange={(v) => update("wifi_password", v)} editable={canEditSection("venue")} placeholder="Password" />
          </div>
          <Field label="Console" value={gig.console} onChange={(v) => update("console", v)} editable={canEditSection("venue")} placeholder="e.g. Yamaha CL5" />
          <div>
            <Label className="text-white/50 text-xs">Power Notes</Label>
            {canEditSection("venue") ? (
              <Textarea value={gig.power_notes || ""} onChange={(e) => update("power_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Power availability, circuits, etc." />
            ) : (
              <p className="mt-1 text-white/70 text-sm">{gig.power_notes || <span className="text-white/25">Not filled in yet</span>}</p>
            )}
          </div>
        </GigSection>
        )}

        {isSectionIncluded("promoter") && (
        <GigSection title={`Promoter${(permissions?.my_roles?.includes("promoter") || isMyOwnerSection("promoter")) ? " (You)" : ""}`} icon={Ticket} color={SECTION_COLORS.promoter} locked={isLocked("promoter")} editable={canEditSection("promoter")} isOwner={permissions?.is_owner} onInvite={() => openInvite("promoter", "Promoter")} onSave={savePromoterSection} saving={sectionSaving.promoter} saved={sectionSaved.promoter}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Door Time" value={promoterInfo.door_time} onChange={(v) => updateSection("promoter_info", "door_time", v)} editable={canEditSection("promoter")} placeholder="e.g. 7:00 PM" />
            <Field label="Capacity" value={promoterInfo.capacity} onChange={(v) => updateSection("promoter_info", "capacity", v)} editable={canEditSection("promoter")} placeholder="e.g. 250" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ticket Price" value={promoterInfo.ticket_price} onChange={(v) => updateSection("promoter_info", "ticket_price", v)} editable={canEditSection("promoter")} placeholder="$20" />
            <Field label="Ticket Link" value={promoterInfo.ticket_link} onChange={(v) => updateSection("promoter_info", "ticket_link", v)} editable={canEditSection("promoter")} placeholder="URL" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Settlement Notes</Label>
            {canEditSection("promoter") ? (
              <Textarea value={promoterInfo.settlement_notes || ""} onChange={(e) => updateSection("promoter_info", "settlement_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Payment terms" />
            ) : (
              <p className="mt-1 text-white/70 text-sm">{promoterInfo.settlement_notes || <span className="text-white/25">Not filled in yet</span>}</p>
            )}
          </div>
        </GigSection>
        )}

        {isSectionIncluded("booking_agent") && (
        <GigSection title={`Booking Agent${(permissions?.my_roles?.includes("booking_agent") || isMyOwnerSection("booking_agent")) ? " (You)" : ""}`} icon={FileSignature} color={SECTION_COLORS.booking_agent} locked={isLocked("booking_agent")} editable={canEditSection("booking_agent")} isOwner={permissions?.is_owner} onInvite={() => openInvite("booking_agent", "Booking Agent")} onSave={saveBookingSection} saving={sectionSaving.booking_agent} saved={sectionSaved.booking_agent}>
          <Field label="Deal Terms" value={bookingInfo.deal_terms} onChange={(v) => updateSection("booking_agent_info", "deal_terms", v)} editable={canEditSection("booking_agent")} placeholder="Guarantee, percentage, etc." />
          <Field label="Contract Status" value={bookingInfo.contract_status} onChange={(v) => updateSection("booking_agent_info", "contract_status", v)} editable={canEditSection("booking_agent")} placeholder="Signed / Pending" />
          <Field label="Agency Contact" value={bookingInfo.agency_contact} onChange={(v) => updateSection("booking_agent_info", "agency_contact", v)} editable={canEditSection("booking_agent")} placeholder="Name, phone, or email" />
        </GigSection>
        )}

        {isSectionIncluded("manager") && (
        <GigSection title={`Manager / Band${(permissions?.my_roles?.includes("manager") || isMyOwnerSection("manager")) ? " (You)" : ""}`} icon={User} color={SECTION_COLORS.manager} locked={isLocked("manager")} editable={canEditSection("manager")} isOwner={permissions?.is_owner} onInvite={() => openInvite("manager", "Manager / Band")} onSave={saveManagerSection} saving={sectionSaving.manager} saved={sectionSaved.manager}>
          <Field label="Contact Name" value={managerInfo.contact_name} onChange={(v) => updateSection("manager_info", "contact_name", v)} editable={canEditSection("manager")} placeholder="Name" />
          <Field label="Title" value={managerInfo.contact_title} onChange={(v) => updateSection("manager_info", "contact_title", v)} editable={canEditSection("manager")} placeholder="e.g. Manager, Band Member" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={managerInfo.contact_phone} onChange={(v) => updateSection("manager_info", "contact_phone", v)} editable={canEditSection("manager")} placeholder="Phone" />
            <Field label="Email" value={managerInfo.contact_email} onChange={(v) => updateSection("manager_info", "contact_email", v)} editable={canEditSection("manager")} placeholder="Email" />
          </div>
          <div>
            <Label className="text-white/50 text-xs">Advancing Notes</Label>
            {canEditSection("manager") ? (
              <Textarea value={managerInfo.advancing_notes || ""} onChange={(e) => updateSection("manager_info", "advancing_notes", e.target.value)} className="mt-1 bg-[#111] border-[#222] text-white text-sm min-h-[60px]" placeholder="Load-in, soundcheck confirmed, etc." />
            ) : (
              <p className="mt-1 text-white/70 text-sm">{managerInfo.advancing_notes || <span className="text-white/25">Not filled in yet</span>}</p>
            )}
          </div>
          <Field label="Guest List" value={managerInfo.guest_list} onChange={(v) => updateSection("manager_info", "guest_list", v)} editable={canEditSection("manager")} placeholder="Names for the door" />

          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center justify-between mb-3 pt-2">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-white/40" />
                <p className="text-white font-semibold text-sm">Lineup</p>
              </div>
              {canEdit && (
                <button onClick={addBand} className="flex items-center gap-1 text-[#8CFF3D] text-xs font-semibold hover:bg-[#8CFF3D]/10 px-2 py-1 rounded-lg">
                  <Plus className="w-3.5 h-3.5" /> Add Act
                </button>
              )}
            </div>

            {(!gig.bands || gig.bands.length === 0) && !canEdit && (
              <p className="text-white/30 text-sm">No lineup info yet.</p>
            )}

            <div className="space-y-2">
            {(gig.bands || []).map((b, i) => {
              const colors = ROLE_COLORS[b.role] || ROLE_COLORS["N/A"];
              if (!canEdit) {
                if (!b.band_name) return null;
                const hasDetails = (b.band_members && b.band_members.length > 0) || b.stage_plot_url || (b.stage_plot_files && b.stage_plot_files.length > 0) || b.artist_fx_notes || b.general_notes || b.submitter_name || b.submitter_phone || b.submitter_email;
                const expanded = expandedBands.has(i);
                return (
                  <div key={i} className="bg-[#1a1a1a] rounded-xl overflow-hidden">
                    <div
                      onClick={() => hasDetails && toggleExpanded(i)}
                      className={`flex items-center justify-between px-3 py-2.5 ${hasDetails ? "cursor-pointer" : ""}`}
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        {hasDetails && <ChevronDown className={`w-3.5 h-3.5 text-white/30 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />}
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{b.band_name}</p>
                          {b.genre_tags && b.genre_tags.length > 0 && (
                            <p className="text-white/30 text-xs truncate">{b.genre_tags.join(", ")}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {b.requested_order && <span className="text-white/30 text-[10px]">#{b.requested_order}</span>}
                        {b.set_length_minutes && <span className="text-white/40 text-xs">{b.set_length_minutes} min</span>}
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${colors.text} ${colors.bg}`}>
                          {b.role}
                        </span>
                      </div>
                    </div>
                    {expanded && <BandDetails band={b} editable={false} onUpdate={() => {}} />}
                  </div>
                );
              }
              return (
                <div key={i} className="bg-[#1a1a1a] rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={b.band_name || ""} onChange={(e) => updateBand(i, "band_name", e.target.value)} placeholder="Artist / Group Name" className="flex-1 h-8 bg-[#111] border-[#222] text-white text-sm" />
                    {b.requested_order && <span className="text-white/30 text-[10px] shrink-0" title="Requested lineup position">#{b.requested_order}</span>}
                    <button onClick={() => removeBand(i)} className="p-1.5 text-white/30 hover:text-red-400 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex gap-1 flex-wrap">
                      {ROLE_OPTIONS.map((r) => {
                        const c = ROLE_COLORS[r];
                        const active = (b.role || "N/A") === r;
                        return (
                          <button
                            key={r}
                            onClick={() => updateBand(i, "role", r)}
                            className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border transition-all ${active ? `${c.text} ${c.bg} ${c.border}` : "text-white/30 border-transparent hover:text-white/50"}`}
                          >
                            {r}
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      type="number"
                      value={b.set_length_minutes || ""}
                      onChange={(e) => updateBand(i, "set_length_minutes", e.target.value)}
                      placeholder="Set (min)"
                      className="h-7 w-24 bg-[#111] border-[#222] text-white text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  {((b.band_members && b.band_members.length > 0) || b.stage_plot_url || (b.stage_plot_files && b.stage_plot_files.length > 0) || b.artist_fx_notes || b.general_notes) && (
                    <>
                      <button
                        onClick={() => toggleExpanded(i)}
                        className="flex items-center gap-1 text-[#8CFF3D] text-xs font-medium hover:underline"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedBands.has(i) ? "rotate-180" : ""}`} />
                        {expandedBands.has(i) ? "Hide" : "Show"} tech details
                      </button>
                      {expandedBands.has(i) && <BandDetails band={b} editable={true} onUpdate={(field, val) => updateBand(i, field, val)} />}
                    </>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </GigSection>
        )}

        {isSectionIncluded("engineer") && (
        <GigSection title={`Audio / Lighting${(permissions?.my_roles?.includes("engineer") || permissions?.my_roles?.includes("lighting") || isMyOwnerEngineerSection()) ? " (You)" : ""}`} icon={Headphones} color={SECTION_COLORS.engineer} locked={isEngineerLocked()} editable={canEditEngineerSection()} isOwner={permissions?.is_owner} onInvite={() => openInvite("engineer_lighting", "Audio / Lighting")} onSave={saveEngineerSection} saving={sectionSaving.engineer || sectionSaving.lighting} saved={sectionSaved.engineer || sectionSaved.lighting}>
          {["audio", "lighting"].map((role, i) => {
            const info = (gig.engineer_info || {})[role] || {};
            const cardInfo = info.card_user_id ? engineerCards[info.card_user_id] : null;
            const isMe = user && info.card_user_id === user.id;
            return (
              <div key={role} className={i > 0 ? "pt-3 mt-3 border-t border-white/10" : ""}>
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-2">{role === "audio" ? "Audio Engineer" : "Lighting Tech"}</p>
                <Field label="Contact Name" value={info.contact_name} onChange={(v) => updateEngineerRole(role, "contact_name", v)} editable={canEditEngineerSection()} placeholder="Name" />
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Field label="Phone" value={info.contact_phone} onChange={(v) => updateEngineerRole(role, "contact_phone", v)} editable={canEditEngineerSection()} placeholder="Phone" />
                  <Field label="Email" value={info.contact_email} onChange={(v) => updateEngineerRole(role, "contact_email", v)} editable={canEditEngineerSection()} placeholder="Email" />
                </div>
                {canEditEngineerSection() && (
                  <button
                    type="button"
                    onClick={() => toggleConnectCard(role)}
                    className={`mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${isMe ? "border-[#8CFF3D]/50 bg-[#8CFF3D]/10 text-[#8CFF3D]" : "border-[#2a2a2a] text-white/50"}`}
                  >
                    <User className="w-3.5 h-3.5" />
                    {isMe ? "Digital card connected ✓" : "Connect digital card?"}
                  </button>
                )}
                {cardInfo?.card_share_token && (
                  <a
                    href={`/pilot/${cardInfo.card_share_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-1.5 text-[#8CFF3D] text-xs hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> View {cardInfo.display_name || "their"} ShowPilot card
                  </a>
                )}
              </div>
            );
          })}
        </GigSection>
        )}

        <p className="text-white/20 text-xs text-center pt-2">Powered by Klean Studios</p>
      </div>

      {inviteFor && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4" onClick={() => setInviteFor(null)}>
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-white font-bold text-base">Invite to {inviteFor.label}</h3>
              <button onClick={() => setInviteFor(null)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            {inviteFor.section === "engineer_lighting" && !inviteRoleChoice ? (
              <>
                <p className="text-white/40 text-xs mb-4">Which role is this invite for?</p>
                <div className="grid grid-cols-2 gap-2">
                  {ENGINEER_ROLE_OPTIONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => { setInviteRoleChoice(r.value); generateInvite(r.value); }}
                      className="px-3 py-2.5 rounded-xl border border-[#2a2a2a] text-white/70 text-sm hover:border-[#8CFF3D]/40 hover:text-white transition-colors"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-white/40 text-xs mb-4">Share this link so they can fill in and update their section.</p>
                {!inviteUrl ? (
                  <Button
                    onClick={() => generateInvite(inviteRoleChoice || inviteFor.section)}
                    disabled={generatingInvite}
                    className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e]"
                  >
                    {generatingInvite ? "Generating..." : "Generate Invite Link"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-xs text-white/40 truncate bg-[#111] rounded-lg px-2 py-2">
                      {inviteUrl}
                    </div>
                    <button
                      onClick={copyInviteUrl}
                      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-[#8CFF3D]/10 text-[#8CFF3D] hover:bg-[#8CFF3D]/20"
                    >
                      {inviteCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    {typeof navigator !== "undefined" && navigator.share && (
                      <button
                        onClick={shareInviteUrl}
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {canEdit && (isTechProductionAccount ? <BottomTabs /> : <BandBottomTabs />)}
    </div>
  );
}
