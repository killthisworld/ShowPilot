import React from "react";
import { supabase } from "@/api/supabaseClient";
import { Paperclip, X, FileText } from "lucide-react";

// A small multi-file upload + list widget. Used in two places with the
// same shape of data ({ url, name, type }[]): a personal library on My
// Templates that's meant to be reused across shows, and a per-gig area
// on an actual section where something specific to that one show goes.
export default function DocumentsUploader({ documents, onChange, uploadPathPrefix, editable = true, label = "Documents" }) {
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    const uploaded = [];
    for (const file of files) {
      try {
        const filePath = `${uploadPathPrefix}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("input-files").upload(filePath, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("input-files").getPublicUrl(filePath);
        uploaded.push({ url: urlData.publicUrl, name: file.name, type: file.type });
      } catch (err) {
        console.error(err);
      }
    }
    if (uploaded.length) onChange([...(documents || []), ...uploaded]);
    e.target.value = "";
  };

  const removeDoc = (i) => onChange((documents || []).filter((_, idx) => idx !== i));

  return (
    <div>
      {label && <label className="text-white/50 text-xs mb-2 block">{label}</label>}
      {editable && (
        <label className="flex items-center justify-center gap-2 border border-dashed border-[#333] rounded-xl py-3 text-white/50 text-sm cursor-pointer hover:border-[#8CFF3D]/40 hover:text-white/70 transition-colors">
          <Paperclip className="w-4 h-4" />
          Upload documents or photos
          <input type="file" accept="image/*,.pdf,.doc,.docx" multiple onChange={handleUpload} className="hidden" />
        </label>
      )}
      {(documents || []).length > 0 ? (
        <div className="space-y-1.5 mt-2">
          {documents.map((f, i) => (
            
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between bg-[#0d0d0d] border border-[#222] rounded-lg px-3 py-2 hover:border-[#8CFF3D]/40 transition-colors"
            >
              <span className="flex items-center gap-2 text-white/70 text-xs truncate min-w-0">
                <FileText className="w-3.5 h-3.5 shrink-0 text-white/30" />
                <span className="truncate">{f.name}</span>
              </span>
              {editable && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeDoc(i); }}
                  className="text-white/30 hover:text-red-400 shrink-0 ml-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </a>
          ))}
        </div>
      ) : (
        !editable && <p className="text-white/25 text-xs">No documents uploaded yet.</p>
      )}
    </div>
  );
}
