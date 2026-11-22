import React, { useEffect, useState } from "react";
import { Mail, Phone, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { DJ_COLOR } from "@/lib/djTools";
import { listRequests, setRequestStatus } from "@/lib/djKit";

const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const HOLD = "#FB923C";

// Date requests from the press kit (job 459), at the top of the DJ's
// Bookings. Hold puts the night on hold on the press kit calendar; Decline
// clears it. Reply by email or phone straight from the card.
export default function DjDateRequests() {
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let gone = false;
    const load = () => listRequests().then((r) => { if (!gone) setList(r); });
    load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { gone = true; document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const act = async (r, status) => {
    setBusy(r.id);
    try {
      await setRequestStatus(r.id, status);
      setList((l) => (status === "declined" ? l.filter((x) => x.id !== r.id) : l.map((x) => (x.id === r.id ? { ...x, status } : x))));
      toast({ title: status === "hold" ? "On hold: the night shows as held on your press kit" : status === "declined" ? "Declined" : "Released" });
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't change it. Try again.", variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  if (!list.length) return null;
  const fresh = list.filter((r) => r.status === "new").length;
  return (
    <section className="flex flex-col gap-2 mb-2">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[11px] tracking-[0.18em] text-white/65 font-medium" style={mono}>DATE REQUESTS</h2>
        {fresh > 0 && <span className="text-[12px] font-semibold" style={{ color: DJ_COLOR }}>{fresh} new</span>}
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        {list.map((r) => {
          const dt = new Date(`${r.date}T00:00:00`);
          const where = [r.venue, r.city].filter(Boolean).join(", ");
          const hold = r.status === "hold";
          const subject = encodeURIComponent(`${r.event_name || "Your request"}: ${dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
          return (
            <article key={r.id} className="rounded-xl bg-[#101116] border overflow-hidden flex" style={{ borderColor: hold ? `${HOLD}66` : r.status === "new" ? `${DJ_COLOR}55` : "#262626" }}>
              <div className="w-[58px] shrink-0 flex flex-col items-center justify-center border-r border-dashed border-white/15 text-[10px] tracking-[0.1em] leading-tight" style={{ ...mono, color: hold ? HOLD : DJ_COLOR }}>
                {MON[dt.getMonth()]}<span className="text-[22px] text-white tracking-normal" style={cond}>{dt.getDate()}</span>
                {hold && <span className="mt-0.5 text-[9px]">HOLD</span>}
              </div>
              <div className="min-w-0 flex-1 p-3 flex flex-col gap-1.5">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold truncate">{r.event_name || "A night"}{where ? <span className="text-white/60 font-normal"> · {where}</span> : null}</div>
                  <div className="text-[13px] text-white/60 truncate">from {r.name}{r.set_time ? ` · ${r.set_time}` : ""}</div>
                </div>
                {r.message && <p className="m-0 text-[13.5px] text-white/75 line-clamp-2">{r.message}</p>}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {hold ? (
                    <button type="button" disabled={busy === r.id} onClick={() => act(r, "declined")} className="min-h-[36px] px-3 rounded-full border border-white/20 text-[13px] font-semibold hover:bg-white/5">Release</button>
                  ) : (
                    <>
                      <button type="button" disabled={busy === r.id} onClick={() => act(r, "hold")} className="min-h-[36px] px-3.5 rounded-full text-[13px] font-bold flex items-center gap-1.5" style={{ background: DJ_COLOR, color: "#000" }}>
                        {busy === r.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Hold the date
                      </button>
                      <button type="button" disabled={busy === r.id} onClick={() => act(r, "declined")} className="min-h-[36px] px-3 rounded-full border border-white/20 text-[13px] font-semibold hover:bg-white/5">Decline</button>
                    </>
                  )}
                  <span className="flex-1" />
                  {r.email && <a href={`mailto:${r.email}?subject=${subject}`} aria-label={`Email ${r.name}`} className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/80 hover:text-white"><Mail className="w-4 h-4" /></a>}
                  {r.phone && <a href={`tel:${r.phone}`} aria-label={`Call ${r.name}`} className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/80 hover:text-white"><Phone className="w-4 h-4" /></a>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
