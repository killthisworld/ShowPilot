import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";

const SECTION_LABELS = { promoter: "Promoter", booking_agent: "Booking Agent", manager: "Manager / Band", engineer: "Audio / Lighting" };

// A full profile page for the other 4 roles (Venue's is the real one, at
// VenueProfile.jsx) hasn't been designed yet - this exists so the Gig
// Web hub's "Open full profile" link never dead-ends while that design
// work is pending, rather than leaving those 4 roles unclickable.
export default function RoleProfilePlaceholder() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const role = params.get("role");

  const style = ACCOUNT_TYPE_STYLES[role] || ACCOUNT_TYPE_STYLES.engineer;
  const Icon = style.icon;
  const label = SECTION_LABELS[role] || style.label;

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">
      <div className="sticky top-0 z-40 bg-[#0d0d0d]/95 backdrop-blur-lg border-b border-[#1a1a1a]">
        <div className="px-4 py-4 max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate(`/gig/web?token=${token}`)} className="p-1 text-white/60 hover:text-white shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white font-bold text-lg leading-tight truncate">{label} Profile</h1>
        </div>
      </div>

      <div className="px-4 pt-16 max-w-lg mx-auto flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: style.color + "18", color: style.color }}>
          <Icon className="w-7 h-7" />
        </div>
        <div>
          <p className="text-white font-semibold text-base">{label} full profile is coming soon</p>
          <p className="text-white/40 text-sm mt-1.5 max-w-xs">
            This role doesn't have its own profile view yet - for now, use the Gig page to see and edit the {label} section.
          </p>
        </div>

        {token && (
          <a
            href={`/gig/shared?token=${token}#section-${role}`}
            className="flex items-center gap-1.5 bg-[#161616] border border-[#222222] rounded-[14px] px-4 py-3 text-white text-sm font-medium hover:bg-[#1a1a1a]"
          >
            View / edit on the Gig page
            <ChevronRight className="w-4 h-4 text-white/30" />
          </a>
        )}
      </div>
    </div>
  );
}
