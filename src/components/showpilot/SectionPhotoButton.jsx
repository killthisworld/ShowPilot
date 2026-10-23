import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Crop, ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import ImageCropModal from "@/components/showpilot/ImageCropModal";

// The camera button on a profile's own web (job 147): add, re-frame, change
// or remove that profile's picture on this event. `wide` crops 16:9 (the
// venue and manager pictures double as the photo on their Contact / Venue
// pages); otherwise it's a round crop for the circle. `onSave(url | "")`
// stores it; the button shows a spinner until that resolves.
const MAX_MB = 15;

async function upload(blob) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");
  const path = `${user.id}/section-photos/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("profile-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl;
}

export default function SectionPhotoButton({ value, onSave, color = "#FFFFFF", label = "profile", wide = false, size = 34 }) {
  const [menu, setMenu] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === "Escape") setMenu(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [menu]);
  useEffect(() => { if (!err) return undefined; const t = setTimeout(() => setErr(""), 3500); return () => clearTimeout(t); }, [err]);

  const pick = () => { setMenu(false); setErr(""); inputRef.current?.click(); };
  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("Pick an image file."); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setErr(`Over ${MAX_MB} MB. Try a smaller one.`); return; }
    setCropFile(f);
  };
  const adjust = async () => {
    setMenu(false);
    if (!value) return;
    setBusy(true);
    try {
      const res = await fetch(value);
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      setCropFile(new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
    } catch {
      setErr("Couldn't open it to adjust. Use Change.");
    }
    setBusy(false);
  };
  const save = async (url) => {
    setBusy(true);
    try { await onSave(url); } catch (e) { console.error(e); setErr("Couldn't save the picture. Try again."); }
    setBusy(false);
  };
  const cropped = async (blob) => {
    setCropFile(null);
    setBusy(true);
    try { await save(await upload(blob)); } catch (e) { console.error(e); setErr("Couldn't upload that picture."); }
    setBusy(false);
  };

  const item = "w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-white/85 hover:bg-white/[0.06]";
  return (
    <div ref={boxRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <button
        type="button"
        onClick={() => (value ? setMenu((v) => !v) : pick())}
        disabled={busy}
        aria-label={value ? `Change the ${label} picture` : `Add a ${label} picture`}
        title={value ? "Change picture" : "Add a picture"}
        className="rounded-full flex items-center justify-center disabled:opacity-70"
        style={{ width: size, height: size, background: "#0d0d0d", border: `1.5px solid ${color}`, color, boxShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
      >
        {busy ? <span className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: `${color}44`, borderTopColor: color }} /> : value ? <Camera className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
      </button>
      {menu && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-30 w-[150px] rounded-lg bg-[#1a1a1a] border border-[#2e2e2e] overflow-hidden" style={{ boxShadow: "0 10px 28px rgba(0,0,0,0.6)" }}>
          <button type="button" onClick={adjust} className={item}><Crop className="w-4 h-4" /> Adjust</button>
          <button type="button" onClick={pick} className={item}><Camera className="w-4 h-4" /> Change</button>
          <button type="button" onClick={() => { setMenu(false); save(""); }} className={`${item} text-red-300`}><Trash2 className="w-4 h-4" /> Remove</button>
        </div>
      )}
      {err && <p className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-30 w-[200px] text-center text-[12px] text-red-300 bg-[#1a1a1a] border border-red-500/30 rounded-md px-2 py-1">{err}</p>}
      {cropFile && createPortal(
        <ImageCropModal
          file={cropFile}
          shape={wide ? "rect" : "circle"}
          aspectW={wide ? 16 : 1}
          aspectH={wide ? 9 : 1}
          fit="cover"
          outWidth={wide ? 1280 : 720}
          title={`Frame the ${label} picture: drag to move, slide to zoom`}
          onCancel={() => setCropFile(null)}
          onCropped={cropped}
        />,
        document.body
      )}
    </div>
  );
}
