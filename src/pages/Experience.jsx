import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, FileDown, RefreshCw, Check, X, Download } from "lucide-react";
import BottomTabs from "@/components/showpilot/BottomTabs";
import { useToast } from "@/components/ui/use-toast";
import ReactMarkdown from "react-markdown";

// ─── Resume Template Visual Cards ────────────────────────────────────────────

function TemplateCard({ template, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border-2 transition-all overflow-hidden ${
        selected ? "border-[#8CFF3D] scale-[1.01]" : "border-[#222] hover:border-[#333]"
      }`}
    >
      {/* Mini visual preview */}
      <div className={`relative ${template.previewBg} p-4`} style={{ minHeight: 110 }}>
        {template.preview}
        {selected && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#8CFF3D] flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-black" />
          </div>
        )}
      </div>
      {/* Label */}
      <div className={`px-4 py-3 ${template.labelBg}`}>
        <p className={`text-sm font-semibold ${template.labelText}`}>{template.label}</p>
        <p className={`text-xs mt-0.5 ${template.labelSub}`}>{template.description}</p>
      </div>
    </button>
  );
}

// Template 1 — Clean / Minimalist / Formal
const MinimalPreview = () => (
  <div className="space-y-2">
    <div className="h-2.5 w-28 rounded-sm bg-gray-800" />
    <div className="h-1 w-40 rounded-sm bg-gray-300" />
    <div className="mt-2 flex gap-2">
      <div className="h-px flex-1 bg-gray-300 self-center" />
      <div className="h-1 w-12 rounded-sm bg-gray-400" />
      <div className="h-px flex-1 bg-gray-300 self-center" />
    </div>
    <div className="space-y-1">
      <div className="h-1 w-full rounded-sm bg-gray-200" />
      <div className="h-1 w-5/6 rounded-sm bg-gray-200" />
      <div className="h-1 w-4/6 rounded-sm bg-gray-200" />
    </div>
    <div className="flex gap-2 pt-1">
      {["Audio Eng","Live Sound","Touring"].map(t => (
        <div key={t} className="h-4 px-2 rounded-sm border border-gray-400 flex items-center">
          <div className="h-1 w-8 rounded-sm bg-gray-400" />
        </div>
      ))}
    </div>
  </div>
);

// Template 2 — Intermediate / Professional / Dual-tone
const ProPreview = () => (
  <div className="flex gap-3 h-full">
    <div className="w-1/3 bg-slate-800 rounded-lg p-2 space-y-1.5">
      <div className="w-8 h-8 rounded-full bg-slate-600 mx-auto" />
      <div className="h-1 w-full rounded bg-slate-500" />
      <div className="h-1 w-3/4 rounded bg-slate-500 mx-auto" />
      <div className="mt-2 space-y-1">
        <div className="h-1 w-full rounded bg-blue-400/50" />
        <div className="h-1 w-full rounded bg-blue-400/50" />
        <div className="h-1 w-3/4 rounded bg-blue-400/50" />
      </div>
    </div>
    <div className="flex-1 space-y-1.5 pt-1">
      <div className="h-2 w-24 rounded bg-slate-300" />
      <div className="h-1 w-32 rounded bg-slate-400" />
      <div className="h-px w-full bg-blue-400/40 my-1" />
      <div className="space-y-0.5">
        <div className="h-1 w-full rounded bg-slate-200" />
        <div className="h-1 w-5/6 rounded bg-slate-200" />
        <div className="h-1 w-4/6 rounded bg-slate-200" />
      </div>
      <div className="flex gap-1 pt-1 flex-wrap">
        {[1,2,3].map(n => <div key={n} className="h-3 w-8 rounded bg-blue-400/30 border border-blue-400/30" />)}
      </div>
    </div>
  </div>
);

// Template 3 — ShowPilot Dark / Neon accent
const DarkPreview = () => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <div className="w-1 h-8 rounded-full bg-[#8CFF3D]" />
      <div>
        <div className="h-2.5 w-24 rounded bg-white/80" />
        <div className="h-1 w-16 rounded bg-white/30 mt-1" />
      </div>
    </div>
    <div className="flex gap-1 flex-wrap">
      {["FOH","Monitor","Touring"].map(t => (
        <div key={t} className="h-4 px-2 rounded-full flex items-center" style={{ backgroundColor: "#8CFF3D22", border: "1px solid #8CFF3D55" }}>
          <div className="h-1 w-6 rounded" style={{ backgroundColor: "#8CFF3D" }} />
        </div>
      ))}
    </div>
    <div className="bg-[#0d0d0d]/60 rounded-lg p-2 space-y-0.5">
      <div className="h-1 w-full rounded bg-white/20" />
      <div className="h-1 w-5/6 rounded bg-white/20" />
      <div className="h-1 w-3/4 rounded bg-white/20" />
    </div>
    <div className="grid grid-cols-3 gap-1">
      {[1,2,3].map(n => (
        <div key={n} className="rounded p-1" style={{ backgroundColor: "#8CFF3D11", border: "1px solid #8CFF3D22" }}>
          <div className="h-1 w-full rounded mb-0.5" style={{ backgroundColor: "#8CFF3D44" }} />
          <div className="h-1 w-3/4 rounded" style={{ backgroundColor: "#8CFF3D22" }} />
        </div>
      ))}
    </div>
  </div>
);

const TEMPLATES = [
  {
    id: "minimal",
    label: "Classic Minimal",
    description: "Clean, formal typography. Simple and elegant.",
    previewBg: "bg-white",
    labelBg: "bg-[#f5f5f5]",
    labelText: "text-gray-800",
    labelSub: "text-gray-500",
    preview: <MinimalPreview />,
    aiStyle: "Clean, minimalist, formal. Use serif-style headings, whitespace, and simple bullet points. No decoration language.",
  },
  {
    id: "professional",
    label: "Studio Pro",
    description: "Two-column layout. Professional with light/dark contrast.",
    previewBg: "bg-slate-100",
    labelBg: "bg-slate-50",
    labelText: "text-slate-800",
    labelSub: "text-slate-500",
    preview: <ProPreview />,
    aiStyle: "Professional two-column layout feel. Use a sidebar-like structure in markdown with clear sections, bold headers, and a technical, confident voice. Mix light and structured formatting.",
  },
  {
    id: "showpilot",
    label: "ShowPilot Dark",
    description: "Dark themed. Neon accents. Built for the stage.",
    previewBg: "bg-[#0d0d0d]",
    labelBg: "bg-[#111]",
    labelText: "text-[#8CFF3D]",
    labelSub: "text-white/40",
    preview: <DarkPreview />,
    aiStyle: "Bold, dark-themed, high-energy. Use uppercase section headers, concise punchy sentences, gear/tech-forward language, and a tone that feels like it belongs on a tour bus. Think stage-ready, not boardroom.",
  },
];

// ─── Resume renderers per template ───────────────────────────────────────────

function MinimalRenderer({ content }) {
  return (
    <div className="bg-white rounded-2xl p-6 font-serif text-gray-800">
      <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:text-gray-900 prose-h1:text-xl prose-h2:text-base prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-1 prose-p:text-gray-600 prose-li:text-gray-600 prose-strong:text-gray-800">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

function ProRenderer({ content }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-slate-200">
      <div className="bg-slate-800 px-6 py-4">
        <h2 className="text-white font-bold text-lg">Audio Engineer</h2>
        <p className="text-blue-300 text-sm">Live Sound Professional</p>
      </div>
      <div className="p-6">
        <div className="prose prose-sm max-w-none prose-headings:text-slate-800 prose-headings:font-bold prose-h2:text-sm prose-h2:uppercase prose-h2:tracking-widest prose-h2:text-blue-700 prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-slate-800">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function ShowPilotRenderer({ content }) {
  return (
    <div className="bg-[#0d0d0d] rounded-2xl border border-[#1e1e1e] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1a1a1a] flex items-center gap-3">
        <div className="w-1 h-8 rounded-full bg-[#8CFF3D]" />
        <div>
          <h2 className="text-white font-bold tracking-tight">AUDIO ENGINEER</h2>
          <p className="text-[#8CFF3D]/60 text-xs uppercase tracking-widest">ShowPilot Profile</p>
        </div>
      </div>
      <div className="p-5 prose prose-sm max-w-none prose-headings:text-[#8CFF3D] prose-headings:uppercase prose-headings:tracking-widest prose-headings:text-xs prose-headings:font-bold prose-h1:text-sm prose-p:text-white/70 prose-li:text-white/70 prose-strong:text-white prose-hr:border-[#222]">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

const RENDERERS = {
  minimal: MinimalRenderer,
  professional: ProRenderer,
  showpilot: ShowPilotRenderer,
};

// ─── PDF Preview Modal ────────────────────────────────────────────────────────

function PdfPreviewModal({ content, template, onClose, onDownload }) {
  const Renderer = RENDERERS[template.id] || MinimalRenderer;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#111] rounded-2xl border border-[#2a2a2a] overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#222]">
          <div>
            <p className="text-white font-semibold text-sm">PDF Preview</p>
            <p className="text-white/40 text-xs">{template.label}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onDownload} size="sm" className="bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-8 rounded-lg">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF
            </Button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-4">
          <Renderer content={content} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Experience() {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState("minimal");
  const [generatedContent, setGeneratedContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savedProfile, setSavedProfile] = useState(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (isMounted) setLoading(false);
        return;
      }

      const [showsRes, profileRes] = await Promise.all([
        supabase.from("shows").select("*").eq("owner_id", user.id).eq("status", "complete"),
        supabase.from("experience_profiles").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(1),
      ]);

      if (!isMounted) return;

      if (showsRes.error) console.error(showsRes.error);
      else setShows(showsRes.data || []);

      if (profileRes.error) {
        console.error(profileRes.error);
      } else if (profileRes.data && profileRes.data.length > 0) {
        const profile = profileRes.data[0];
        setSavedProfile(profile);
        setGeneratedContent(profile.content || "");
        setSelectedTemplate(profile.template_type || "minimal");
      }
      setLoading(false);
    }

    load();
    return () => { isMounted = false; };
  }, []);

  const generateExperience = async () => {
    if (shows.length === 0) {
      toast({ title: "Complete some shows first", description: "Mark shows as 'Complete' to generate your experience profile.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    const template = TEMPLATES.find((t) => t.id === selectedTemplate);
    const showData = shows.map((s) => ({
      band: s.band_name, venue: s.venue, date: s.date, location: s.location,
      genre: s.genre_tag, console: s.console, members: (s.band_members || []).length,
    }));

    const prompt = `You are writing a professional experience profile for a live audio engineer. Your output must be factual, direct, and formally written — no metaphors, no storytelling, no dramatic language. Write like a well-structured industry resume, not a biography.

Style directive: "${template.aiStyle}"

Here are their completed shows:
${JSON.stringify(showData, null, 2)}

Generate a professional career profile in markdown format. Be precise and data-driven. Include:
- A one or two sentence professional summary stating role, years active, and total shows
- Technical skills: list consoles used by name
- Show history: organized by year or genre, listing band/artist, venue, and location factually
- Notable clients or recurring acts (if applicable)
- Total show count

Rules:
- Do not use adjectives like "renowned", "acclaimed", "masterful", "dynamic", or any theatrical language
- Do not write narrative sentences about "journeys" or "passion"
- State facts only: who, what, where, when
- Use clean bullet points and clear section headers
- Keep sentences short and declarative`;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Calls a Supabase Edge Function ("generate-experience") that holds the
      // LLM API key server-side and proxies the request. See Phase 6b in the
      // checklist — this function still needs to be created and deployed.
      const { data, error } = await supabase.functions.invoke("generate-experience", {
        body: { prompt },
      });

      if (error) throw error;
      const result = data.content;

      setGeneratedContent(result);
      setEditContent(result);

      const profileData = {
        title: template.label,
        template_type: selectedTemplate,
        content: result,
        generated_at: new Date().toISOString(),
      };

      if (savedProfile?.id) {
        const { data: updated, error: updateError } = await supabase
          .from("experience_profiles")
          .update(profileData)
          .eq("id", savedProfile.id)
          .select()
          .single();
        if (updateError) throw updateError;
        setSavedProfile(updated);
      } else {
        const { data: created, error: insertError } = await supabase
          .from("experience_profiles")
          .insert({ ...profileData, owner_id: user.id })
          .select()
          .single();
        if (insertError) throw insertError;
        setSavedProfile(created);
      }
      toast({ title: "Experience profile generated!" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error generating profile", variant: "destructive" });
    }
    setGenerating(false);
  };

  const saveEdit = async () => {
    setGeneratedContent(editContent);
    setIsEditing(false);
    if (savedProfile?.id) {
      const { error } = await supabase
        .from("experience_profiles")
        .update({ content: editContent })
        .eq("id", savedProfile.id);
      if (error) console.error(error);
    }
    toast({ title: "Changes saved" });
  };

  const downloadPDF = async () => {
    const jsPDF = (await import("jspdf")).default;
    const template = TEMPLATES.find((t) => t.id === selectedTemplate);
    const doc = new jsPDF();
    const clean = generatedContent.replace(/[#*_`]/g, "").replace(/^\s+/gm, "");

    if (selectedTemplate === "showpilot") {
      // Dark theme — black bg, green accents
      doc.setFillColor(13, 13, 13);
      doc.rect(0, 0, 210, 297, "F");
      // Green accent bar
      doc.setFillColor(140, 255, 61);
      doc.rect(0, 0, 4, 297, "F");
      // Header
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(140, 255, 61);
      doc.text("AUDIO ENGINEER", 12, 18);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(140, 255, 61, 0.6);
      doc.text("SHOWPILOT PROFILE", 12, 24);
      // Divider
      doc.setDrawColor(30, 30, 30);
      doc.line(12, 27, 198, 27);
      // Body
      doc.setFontSize(9);
      doc.setTextColor(200, 200, 200);
      const lines = doc.splitTextToSize(clean, 184);
      let y = 35;
      lines.forEach((line) => {
        if (y > 280) { doc.addPage(); doc.setFillColor(13,13,13); doc.rect(0,0,210,297,"F"); y = 15; }
        // Detect section headers (ALL CAPS or short lines)
        if (line.trim() === line.trim().toUpperCase() && line.trim().length > 0 && line.trim().length < 40) {
          doc.setTextColor(140, 255, 61);
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(200, 200, 200);
          doc.setFont("helvetica", "normal");
        }
        doc.text(line, 12, y);
        y += 5.5;
      });
    } else if (selectedTemplate === "professional") {
      // Two-tone: dark slate header, white body, blue accents
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, 210, 35, "F");
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("AUDIO ENGINEER", 12, 18);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(147, 197, 253);
      doc.text("Live Sound Professional", 12, 27);
      // Body
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      const lines = doc.splitTextToSize(clean, 184);
      let y = 44;
      lines.forEach((line) => {
        if (y > 280) { doc.addPage(); y = 15; }
        const isHeader = line.trim() === line.trim().toUpperCase() && line.trim().length > 0 && line.trim().length < 40;
        if (isHeader) {
          doc.setTextColor(29, 78, 216);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
        } else {
          doc.setTextColor(71, 85, 105);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
        }
        doc.text(line, 12, y);
        y += isHeader ? 6.5 : 5.5;
      });
    } else {
      // Minimal — clean white, serif-feel, black text
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("AUDIO ENGINEER", 20, 20);
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 23, 190, 23);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      const lines = doc.splitTextToSize(clean, 170);
      let y = 32;
      lines.forEach((line) => {
        if (y > 280) { doc.addPage(); y = 20; }
        const isHeader = line.trim() === line.trim().toUpperCase() && line.trim().length > 0 && line.trim().length < 40;
        if (isHeader) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 30, 30);
          doc.setFontSize(10);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(90, 90, 90);
          doc.setFontSize(9);
        }
        doc.text(line, 20, y);
        y += isHeader ? 7 : 5.5;
      });
    }

    doc.save(`ShowPilot_${template.label.replace(/\s+/g, "_")}.pdf`);
    setShowPdfPreview(false);
    toast({ title: "PDF downloaded!" });
  };

  const Renderer = RENDERERS[selectedTemplate] || MinimalRenderer;
  const currentTemplate = TEMPLATES.find((t) => t.id === selectedTemplate);

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24">
      {showPdfPreview && (
        <PdfPreviewModal
          content={generatedContent}
          template={currentTemplate}
          onClose={() => setShowPdfPreview(false)}
          onDownload={downloadPDF}
        />
      )}
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-3 max-w-lg mx-auto">
          <h1 className="text-lg font-bold text-white">Experience</h1>
          <p className="text-xs text-white/40 mt-0.5">{shows.length} completed show{shows.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Template Selection */}
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider font-medium mb-3">Choose a Template</p>
              <div className="grid grid-cols-1 gap-3">
                {TEMPLATES.map((t) => (
                  <TemplateCard key={t.id} template={t} selected={selectedTemplate === t.id} onClick={() => setSelectedTemplate(t.id)} />
                ))}
              </div>
            </div>

            <Button onClick={generateExperience} disabled={generating} className="w-full bg-[#8CFF3D] text-black font-semibold hover:bg-[#7ae62e] h-11 rounded-xl">
              {generating ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> {generatedContent ? "Regenerate" : "Generate"} Experience Profile</>
              )}
            </Button>

            {/* Generated Content */}
            {generatedContent && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                   <p className="text-xs text-white/50 uppercase tracking-wider font-medium">Your Profile</p>
                   <div className="flex gap-2">
                     <Button variant="ghost" size="sm" onClick={() => { setIsEditing(!isEditing); setEditContent(generatedContent); }} className="text-white/50 h-7 text-xs">
                       {isEditing ? "Cancel" : "Edit"}
                     </Button>
                     <Button variant="ghost" size="sm" onClick={() => setShowPdfPreview(true)} className="text-[#8CFF3D] h-7 text-xs">
                       <FileDown className="w-3.5 h-3.5 mr-1" /> View
                     </Button>
                   </div>
                 </div>

                 {isEditing ? (
                   <div className="space-y-2">
                     <Textarea
                       value={editContent}
                       onChange={(e) => setEditContent(e.target.value)}
                       className="bg-[#111] border-[#222] text-white min-h-[300px] text-sm font-mono"
                     />
                     <Button onClick={saveEdit} className="bg-[#8CFF3D] text-black hover:bg-[#7ae62e]">
                       Save Changes
                     </Button>
                   </div>
                 ) : (
                   <Renderer content={generatedContent} />
                 )}
              </div>
            )}
          </>
        )}
      </div>

      <BottomTabs />
    </div>
  );
}
