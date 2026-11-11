import React from "react";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/offline";

// "No signal" strip across the top (job 73, On the road stage 9). Shows
// only without signal, or while saved changes are still waiting to send.
export default function OfflineBanner() {
  const { online, pending } = useOnline();
  if (online && !pending) return null;
  const text = !online
    ? `No signal · showing what's saved${pending ? ` · ${pending} ${pending === 1 ? "change" : "changes"} will send later` : ""}`
    : `Sending ${pending} saved ${pending === 1 ? "change" : "changes"}…`;
  return (
    <div role="status" className="fixed top-0 inset-x-0 z-[90] bg-[#1f1f1f] border-b border-[#333] text-white/85 text-[13px] px-4 pb-2 pt-[max(8px,env(safe-area-inset-top))] flex items-center gap-2" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <WifiOff className="w-4 h-4 text-[#FFB547] shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </div>
  );
}
