import React from "react";

const STATUS_CONFIG = {
  not_started: { label: "New", bg: "bg-white/10", text: "text-white/60", dot: "bg-white/40" },
  in_progress: { label: "Frequent", bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-400" },
  complete: { label: "Worked", bg: "bg-[#8CFF3D]/15", text: "text-[#8CFF3D]", dot: "bg-[#8CFF3D]" },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_started;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
