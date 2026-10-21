import React from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";

// The event's chat as one header icon (tech phones, job 119): opens the Rooms
// page, which also links to private messages. Same box as TasksButton.
export default function RoomsButton({ token, className = "" }) {
  const navigate = useNavigate();
  if (!token) return null;
  return (
    <button
      type="button"
      onClick={() => navigate(`/gig/rooms?token=${token}`)}
      aria-label="Rooms (chat)"
      title="Rooms"
      className={`relative shrink-0 w-10 h-10 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] flex items-center justify-center text-white/75 hover:text-white ${className}`}
    >
      <MessageCircle className="w-[18px] h-[18px]" />
    </button>
  );
}
