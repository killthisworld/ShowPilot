import React from "react";
import { Phone, Mail } from "lucide-react";

// Who submitted an act on the intake form (job 166): name, phone and email
// each on their own line at a readable size; phone / email tap to call / write.
export default function SubmittedBy({ name, phone, email, cardToken, cardName, boxed = true }) {
  if (!name && !phone && !email && !cardToken) return null;
  return (
    <div className={boxed ? "bg-[#111] border border-[#222] rounded-xl p-3.5" : ""}>
      <p className="text-white/45 text-[11px] uppercase tracking-wide font-semibold mb-1.5">Submitted By</p>
      <p className="text-white text-[16px] font-semibold leading-snug">{name || "Unnamed"}</p>
      {phone && (
        <a href={`tel:${phone}`} className="mt-1.5 flex items-center gap-2 text-white/75 text-[14px] hover:text-white">
          <Phone className="w-4 h-4 shrink-0 text-white/40" /> <span className="break-all">{phone}</span>
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="mt-1 flex items-center gap-2 text-white/75 text-[14px] hover:text-white">
          <Mail className="w-4 h-4 shrink-0 text-white/40" /> <span className="break-all">{email}</span>
        </a>
      )}
      {cardToken && (
        <a href={`/pilot/${cardToken}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[#8CFF3D] text-[13px] hover:underline">
          View {cardName || "their"} ShowPilot card
        </a>
      )}
    </div>
  );
}
