import React from "react";
import { usePreferences } from "@/hooks/usePreferences";
import Home from "@/pages/Home";
import BandHome from "@/pages/BandHome";

// Routes to the right home screen based on account type. Engineer and
// Lighting Tech share the full New/Frequent/Worked tracking Home page, since
// both are technical-production roles hired to work specific shows. Every
// other profile type (Band, Venue, Promoter, Booking Agent, Manager) shares
// the simpler "linked shows" home experience for now - specialized
// per-profile features come later. Defaults to the existing Engineer Home
// for every case except an explicit non-technical-production type -
// including while loading, if preferences fail to load, or for any legacy/
// unset account - so existing engineer users see zero behavior change.
const TECHNICAL_PRODUCTION_TYPES = ["engineer", "lighting"];

export default function HomeRouter() {
  const { preferences, loading } = usePreferences();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }

  if (preferences?.account_type && !TECHNICAL_PRODUCTION_TYPES.includes(preferences.account_type)) {
    return <BandHome />;
  }

  return <Home />;
}
