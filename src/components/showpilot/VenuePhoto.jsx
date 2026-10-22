import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Crop, ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import ImageCropModal from "@/components/showpilot/ImageCropModal";
import { SCENE_MONO } from "@/lib/sceneStyle";

// A venue's photo: upload, frame it (drag / zoom), change or remove it.
// Used by the tech's Venue Info box and venue templates (VenueInfoFields)
// and the venue company's Venue section (RoleWorkspace). The picture is a
// 16:9 JPEG in the profile-photos bucket; `value` is its public URL and
// `onChange(url | "")` saves it wherever the caller keeps it.
const MAX_MB = 15;

async function uploadVenuePhoto(blob) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");
  const path = `${user.id}/venue-photos/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("profile-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl;
}

export default function VenuePhoto({ value, onChange, editable = true, accent = "#60A5FA", className = "" }) {
  const [cropFile, setCropFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef(null);

  const pick = () => { setErr(""); inputRef.current?.click(); };
  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("Pick an image file (JPG, PNG, HEIC)."); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setErr(`That image is over ${MAX_MB} MB. Try a smaller one.`); return; }
    setCropFile(f);
  };
  // Re-frame the photo that's already there.
  const adjust = async () => {
    if (!value) return;
    setErr("");
    setBusy(true);
    try {
      const res = await fetch(value);
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      setCropFile(new File([blob], "venue.jpg", { type: blob.type || "image/jpeg" }));
    } catch {
      setErr("Couldn't open the photo to adjust it. Use Change instead.");
    }
    setBusy(false);
  };
  const saveCropped = async (blob) => {
    setCropFile(null);
    setBusy(true);
    setErr("");
    try {
      onChange?.(await uploadVenuePhoto(blob));
    } catch (e) {
      console.error(e);
      setErr("Couldn't upload that photo. Try again.");
    }
    setBusy(false);
  };

  if (!value && !editable) return null;

  const btn = "flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-semibold bg-black/60 backdrop-blur border border-white/15 text-white hover:bg-black/75 disabled:opacity-50";

  return (
    <div className={`w-full max-w-[640px] ${className}`}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      {value ? (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-[#222] bg-[#111]">
          <img src={value} alt="Venue" className="absolute inset-0 w-full h-full object-cover" />
          {busy && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>}
          {editable && !busy && (
            <div className="absolute left-2 right-2 bottom-2 flex flex-wrap gap-1.5 justify-end">
              <button type="button" onClick={adjust} className={btn}><Crop className="w-4 h-4" /> Adjust</button>
              <button type="button" onClick={pick} className={btn}><Camera className="w-4 h-4" /> Change</button>
              <button type="button" onClick={() => onChange?.("")} aria-label="Remove venue photo" className={`${btn} text-red-300`}><Trash2 className="w-4 h-4" /> Remove</button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="w-full aspect-[16/6] rounded-xl border border-dashed flex flex-col items-center justify-center gap-1.5 text-white/55 hover:text-white transition-colors disabled:opacity-60"
          style={{ borderColor: accent + "66", background: accent + "0d" }}
        >
          {busy ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <ImagePlus className="w-6 h-6" style={{ color: accent }} />
              <span className="text-[14px] font-semibold">Add a venue photo</span>
              <span className="text-[11px] tracking-[0.1em] text-white/35" style={{ fontFamily: SCENE_MONO }}>SAVED WITH YOUR VENUE TEMPLATE</span>
            </>
          )}
        </button>
      )}
      {err && <p className="mt-1.5 text-[13px] text-red-400">{err}</p>}
      {cropFile && createPortal(
        <ImageCropModal
          file={cropFile}
          aspectW={16}
          aspectH={9}
          fit="cover"
          outWidth={1280}
          title="Frame the venue: drag to move, slide to zoom"
          onCancel={() => setCropFile(null)}
          onCropped={saveCropped}
        />,
        document.body
      )}
    </div>
  );
}
