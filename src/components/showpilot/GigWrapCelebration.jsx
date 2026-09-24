import React, { useEffect, useMemo, useState } from "react";
import { Award } from "lucide-react";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";

const ROLE_ORDER = ["venue", "promoter", "booking_agent", "manager", "engineer"];

// The post-show payoff: the same radial web every gig gets on Gig Web,
// but animated pulling itself together into a single star instead of
// staying spread out - "the web that was the event" closing the loop,
// a congrats to everyone who made it happen. Plays once per (show,
// viewer), ever - BandHome gates that via get_unseen_gig_wraps /
// mark_gig_wrap_seen, this component just plays the moment it's handed.
//
// No push notification yet (that's a separate, later build - this only
// surfaces the next time someone opens the app after a show has passed).
// `wrap` is one row shaped by get_unseen_gig_wraps: id, share_token,
// event_name, band_name, venue, date, included_sections, claimed_roles,
// invited_roles.
export default function GigWrapCelebration({ wrap, onDone }) {
  const [converged, setConverged] = useState(false);
  const [showBurst, setShowBurst] = useState(false);
  const [showText, setShowText] = useState(false);

  const roles = useMemo(
    () => ROLE_ORDER.filter((role) => !wrap.included_sections || wrap.included_sections.includes(role)),
    [wrap]
  );

  const cx = 150, cy = 150, r = 112;
  const nodes = useMemo(() => {
    const isClaimed = (role) =>
      role === "engineer"
        ? !!(wrap.claimed_roles?.includes("engineer") || wrap.claimed_roles?.includes("lighting"))
        : !!wrap.claimed_roles?.includes(role);
    return roles.map((role, i) => {
      const angle = (-90 + i * (360 / roles.length)) * (Math.PI / 180);
      const style = ACCOUNT_TYPE_STYLES[role] || ACCOUNT_TYPE_STYLES.engineer;
      return {
        role,
        style,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        claimed: isClaimed(role),
      };
    });
  }, [roles, wrap]);

  // A little particle burst at the moment everything lands, colored from
  // whichever roles actually made up this gig - a bigger gig (more roles
  // involved) reads as a bigger moment, same idea as the board's "N
  // claimed" stat.
  const particles = useMemo(() => {
    const colors = nodes.length > 0 ? nodes.map((n) => n.style.color) : ["#8CFF3D"];
    return Array.from({ length: 18 }, (_, i) => {
      const angle = (i / 18) * 360 + (Math.random() * 20 - 10);
      const dist = 70 + Math.random() * 55;
      return {
        id: i,
        color: colors[i % colors.length],
        dx: Math.cos((angle * Math.PI) / 180) * dist,
        dy: Math.sin((angle * Math.PI) / 180) * dist,
        delay: Math.random() * 0.15,
      };
    });
  }, [nodes]);

  useEffect(() => {
    const t1 = setTimeout(() => setConverged(true), 700);
    const t2 = setTimeout(() => setShowBurst(true), 2100);
    const t3 = setTimeout(() => setShowText(true), 2250);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const title = wrap.event_name || wrap.band_name || "That gig";
  const dateLabel = wrap.date
    ? new Date(wrap.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : "";

  return (
    <div className="fixed inset-0 z-[80] bg-[#0d0d0d] flex flex-col items-center justify-center px-6">
      <style>{`
        @keyframes wrapParticle {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0); opacity: 0; }
        }
        @keyframes wrapFlash {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          45% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
        }
      `}</style>

      <div className="relative shrink-0" style={{ width: 300, height: 300 }}>
        <svg width="300" height="300" className="absolute left-0 top-0 pointer-events-none">
          {nodes.map((n) => (
            <line
              key={n.role}
              x1={cx} y1={cy}
              x2={converged ? cx : n.x} y2={converged ? cy : n.y}
              stroke="#2a2a2a" strokeWidth="1.5"
              style={{
                transition: "x2 1.4s cubic-bezier(0.22,1,0.36,1), y2 1.4s cubic-bezier(0.22,1,0.36,1), opacity 0.5s ease 0.9s",
                opacity: converged ? 0 : 1,
              }}
            />
          ))}
        </svg>

        {converged && showBurst && (
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              left: cx, top: cy, width: 90, height: 90,
              background: "radial-gradient(circle, #8CFF3D55 0%, transparent 70%)",
              filter: "blur(6px)",
              animation: "wrapFlash 0.6s ease-out forwards",
            }}
          />
        )}

        {showBurst && particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: cx, top: cy, width: 5, height: 5,
              background: p.color,
              boxShadow: `0 0 6px 2px ${p.color}aa`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              animation: `wrapParticle 0.9s ease-out ${p.delay}s forwards`,
            }}
          />
        ))}

        {nodes.map((n) => (
          <div
            key={n.role}
            className="absolute rounded-full flex items-center justify-center"
            style={{
              width: 52, height: 52,
              left: converged ? cx : n.x, top: converged ? cy : n.y,
              transform: "translate(-50%, -50%)",
              background: n.claimed ? n.style.color : "#2a2a2a",
              opacity: n.claimed ? 1 : 0.55,
              boxShadow: converged ? `0 0 16px 4px ${n.style.color}66` : undefined,
              transition:
                "left 1.4s cubic-bezier(0.22,1,0.36,1), top 1.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s ease 1.2s",
            }}
          >
            <div className="rounded-full flex items-center justify-center bg-[#0d0d0d]" style={{ width: 44, height: 44, color: n.style.color }}>
              <n.style.icon className="w-4 h-4" />
            </div>
          </div>
        ))}
      </div>

      <div className="text-center transition-opacity duration-700" style={{ opacity: showText ? 1 : 0 }}>
        <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-1">Show's a wrap</p>
        <h2 className="text-white font-bold text-xl mb-1">{title}</h2>
        {dateLabel && <p className="text-white/40 text-sm mb-4">{dateLabel}</p>}
        <p className="text-white/60 text-sm max-w-xs mx-auto mb-6">
          Nice work out there — {roles.length} {roles.length === 1 ? "role" : "roles"} came together to pull this one off.
        </p>
        <button
          type="button"
          onClick={onDone}
          disabled={!showText}
          className="flex items-center gap-1.5 mx-auto bg-[#8CFF3D] text-black text-sm font-bold px-5 py-2.5 rounded-full hover:bg-[#7ae62e] transition-colors disabled:opacity-0"
        >
          <Award className="w-4 h-4" /> Nice
        </button>
      </div>
    </div>
  );
}
