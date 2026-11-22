import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import DjKitView from "@/components/showpilot/DjKitView";
import { fetchPublicKit } from "@/lib/djKit";
import { DJ_COLOR } from "@/lib/djTools";

// A DJ's press kit at its share link (job 457): /kit/:token, no sign-in.
export default function DjPressKit() {
  const { token } = useParams();
  const [kit, setKit] = useState(undefined); // undefined loading, null not found

  useEffect(() => {
    let gone = false;
    fetchPublicKit(token)
      .then((k) => { if (!gone) setKit(k); })
      .catch((e) => { console.error(e); if (!gone) setKit(null); });
    return () => { gone = true; };
  }, [token]);

  useEffect(() => {
    if (kit?.name) document.title = `${kit.name} · Press kit`;
  }, [kit]);

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {kit === undefined ? (
        <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin" style={{ color: DJ_COLOR }} /></div>
      ) : kit === null ? (
        <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-6 text-center">
          <h1 className="m-0 text-[22px] font-bold">This press kit isn't available</h1>
          <p className="m-0 text-[15px] text-white/60">The link may have been mistyped. Ask the DJ to send it again.</p>
        </div>
      ) : (
        <DjKitView kit={kit} />
      )}
    </div>
  );
}
