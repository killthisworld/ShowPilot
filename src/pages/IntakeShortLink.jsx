import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import TourManagerIntake from "@/pages/TourManagerIntake";

// Short Performer Intake link: showpilot.space/intake/7KQ2XM. Looks the code
// up and opens the same intake form the long /tm-intake?token=... link does.
export default function IntakeShortLink() {
  const { code } = useParams();
  const [link, setLink] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_intake_link", { p_code: code || "" });
      if (live) setLink(!error && data?.token ? data : null);
    })();
    return () => { live = false; };
  }, [code]);

  if (link === undefined) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8CFF3D]/30 border-t-[#8CFF3D] rounded-full animate-spin" />
      </div>
    );
  }
  if (!link) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-white/60 text-lg mb-2">Invalid link</p>
          <p className="text-white/30 text-sm">This intake link is not valid. Check it with your engineer.</p>
        </div>
      </div>
    );
  }
  return <TourManagerIntake link={{ token: link.token, engineer: link.engineer, name: link.name }} />;
}
