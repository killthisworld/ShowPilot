import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";

// A DJ set link's short form (job 375, Jay 2026-11-19): /s/<8-letter code>
// opens the act's set page (/dj/set/<token>). The code only finds that one
// slot's token (dj_slot_by_code), the same permission the long link gives.
export default function DjShortLink() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let gone = false;
    supabase.rpc("dj_slot_by_code", { p_code: String(code || "") }).then(({ data, error }) => {
      if (gone) return;
      if (error || !data) { if (error) console.error(error); setBad(true); return; }
      navigate(`/dj/set/${data}`, { replace: true });
    });
    return () => { gone = true; };
  }, [code, navigate]);
  return (
    <div className="min-h-[100dvh] bg-[#0d0d0d] text-white flex items-center justify-center px-6 text-center" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {bad ? (
        <p className="m-0 text-[16px] text-white/70">This link isn't right. Check it with the DJ who sent it.</p>
      ) : (
        <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: "#FFE04A40", borderTopColor: "#FFE04A" }} />
      )}
    </div>
  );
}
