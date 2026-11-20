import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";

// The link in a Google / Apple calendar entry (job 411): /open/<event id>.
// Once signed in, it opens the event's web if the event is theirs or
// linked to them (the event's share key never goes into a calendar).
export default function OpenEvent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc("calendar_event_token", { p_show_id: id }).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data) { setMissing(true); return; }
      navigate(`/gig/web?token=${data}`, { replace: true });
    });
    return () => { alive = false; };
  }, [id, navigate]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-6 text-center" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {missing ? (
        <div className="max-w-sm">
          <p className="text-white text-[18px] font-semibold">This event isn't on your account</p>
          <p className="mt-2 text-white/55 text-[14px]">It may have been deleted, or it's on another Show Pilot account.</p>
          <Link to="/" className="mt-5 inline-flex h-11 px-5 items-center rounded-lg font-bold text-[#0d0d0d]" style={{ background: "#8CFF3D" }}>Go to Show Pilot</Link>
        </div>
      ) : (
        <p className="text-white/50 text-[14px]">Opening your event…</p>
      )}
    </div>
  );
}
