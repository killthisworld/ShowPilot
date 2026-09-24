import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star } from "lucide-react";
import { ACCOUNT_TYPE_STYLES } from "@/lib/accountTypeStyle";

const ROLE_ORDER = ["venue", "promoter", "booking_agent", "manager", "engineer"];

// Slow, deliberate collapse - each role spirals inward (not a flat slide)
// so it reads like matter falling into a forming star rather than icons
// sliding across the screen. Tuned to feel unhurried; this is a payoff
// moment, not a loading spinner.
const SPIRAL_STEPS = 28;
const SPIRAL_DURATION = 3.2;
const SPIRAL_SPINS = 1.35; // extra full turns while falling inward
const SPIRAL_TIMES = Array.from({ length: SPIRAL_STEPS + 1 }, (_, i) => i / SPIRAL_STEPS);
// Nodes dissolve away well before the spiral's math hits dead center, so
// nothing recognizable as a role circle/icon is still on screen once the
// star itself takes over - the star is never "made of" the icons.
const FADE_TIMES = [0, 0.5, 0.75, 0.9, 1];

function buildSpiralFrames(startAngleDeg, startR, cx, cy) {
  const x = [];
  const y = [];
  for (let i = 0; i <= SPIRAL_STEPS; i++) {
    const t = i / SPIRAL_STEPS;
    // Falls slowly at first, then rushes toward center - gravity, not a
    // linear tween.
    const remaining = Math.pow(1 - t, 1.7);
    const rad = startR * remaining;
    const angle = (startAngleDeg + t * 360 * SPIRAL_SPINS) * (Math.PI / 180);
    x.push(cx + rad * Math.cos(angle));
    y.push(cy + rad * Math.sin(angle));
  }
  return { x, y };
}

// The post-show payoff: the same radial web every gig gets on Gig Web,
// animated pulling itself together - not sliding into a stack of role
// icons, but spiraling in and dissolving into a single point of light,
// like a supernova collapsing into a star. Plays once per (show, viewer),
// ever - BandHome gates that via get_unseen_gig_wraps / mark_gig_wrap_seen,
// this component just plays the moment it's handed. Tapping through at
// the end sends the newly-formed star flying off into the home screen's
// constellation, landing exactly where that show's star already lives
// there (BandHome measures and passes `targetPos`) - "the web that was
// the event" literally taking its place in the sky.
//
// No push notification yet (that's a separate, later build - this only
// surfaces the next time someone opens the app after a show has passed).
// `wrap` is one row shaped by get_unseen_gig_wraps: id, share_token,
// event_name, band_name, venue, date, included_sections, claimed_roles,
// invited_roles. `targetPos` is optional: { x, y, color } in viewport
// pixels for where this show's real star sits on the home screen right
// now - when BandHome can't resolve it, the star just fades out in place
// instead of flying anywhere.
export default function GigWrapCelebration({ wrap, onDone, targetPos }) {
  const [phase, setPhase] = useState("spiral"); // spiral -> burst -> reveal -> flight
  const boxRef = useRef(null);
  const [flightStart, setFlightStart] = useState(null);

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
      const angle = -90 + i * (360 / roles.length);
      const style = ACCOUNT_TYPE_STYLES[role] || ACCOUNT_TYPE_STYLES.engineer;
      const { x, y } = buildSpiralFrames(angle, r, cx, cy);
      return { role, style, x, y, claimed: isClaimed(role) };
    });
  }, [roles, wrap]);

  // A particle burst at the moment everything lands, colored from
  // whichever roles actually made up this gig - a bigger gig (more roles
  // involved) reads as a bigger moment, same idea as the board's "N
  // claimed" stat.
  const particles = useMemo(() => {
    const colors = nodes.length > 0 ? nodes.map((n) => n.style.color) : ["#8CFF3D"];
    return Array.from({ length: 22 }, (_, i) => {
      const angle = (i / 22) * 360 + (Math.random() * 20 - 10);
      const dist = 75 + Math.random() * 60;
      return {
        id: i,
        color: colors[i % colors.length],
        dx: Math.cos((angle * Math.PI) / 180) * dist,
        dy: Math.sin((angle * Math.PI) / 180) * dist,
        delay: Math.random() * 0.2,
      };
    });
  }, [nodes]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("burst"), (SPIRAL_DURATION + 0.15) * 1000);
    const t2 = setTimeout(() => setPhase("reveal"), (SPIRAL_DURATION + 1.5) * 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const starColor = targetPos?.color || (nodes[0]?.style.color ?? "#8CFF3D");

  const startFlight = () => {
    if (!targetPos || !boxRef.current) { onDone(); return; }
    const rect = boxRef.current.getBoundingClientRect();
    setFlightStart({ x: rect.left + cx, y: rect.top + cy });
    setPhase("flight");
  };

  const title = wrap.event_name || wrap.band_name || "That gig";
  const dateLabel = wrap.date
    ? new Date(wrap.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : "";

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center px-6"
      initial={{ backgroundColor: "rgba(13,13,13,1)" }}
      animate={{ backgroundColor: phase === "flight" ? "rgba(13,13,13,0)" : "rgba(13,13,13,1)" }}
      transition={{ duration: phase === "flight" ? 0.85 : 0.3 }}
      style={{ pointerEvents: phase === "flight" ? "none" : "auto" }}
    >
      <div ref={boxRef} className="relative shrink-0" style={{ width: 300, height: 300 }}>
        {phase === "spiral" &&
          nodes.map((n) => (
            <motion.div
              key={n.role}
              className="absolute rounded-full"
              style={{ width: 52, height: 52, marginLeft: -26, marginTop: -26, background: n.claimed ? n.style.color : "#2a2a2a" }}
              initial={{ x: n.x[0], y: n.y[0], opacity: n.claimed ? 1 : 0.5, scale: 1 }}
              animate={{
                x: n.x,
                y: n.y,
                opacity: [n.claimed ? 1 : 0.5, n.claimed ? 1 : 0.5, 0.85, 0.4, 0],
                scale: [1, 1, 0.8, 0.45, 0.1],
              }}
              transition={{
                x: { duration: SPIRAL_DURATION, times: SPIRAL_TIMES, ease: "linear" },
                y: { duration: SPIRAL_DURATION, times: SPIRAL_TIMES, ease: "linear" },
                opacity: { duration: SPIRAL_DURATION, times: FADE_TIMES, ease: "linear" },
                scale: { duration: SPIRAL_DURATION, times: FADE_TIMES, ease: "linear" },
              }}
            >
              <div className="w-full h-full rounded-full flex items-center justify-center">
                <div className="rounded-full flex items-center justify-center bg-[#0d0d0d]" style={{ width: 40, height: 40 }}>
                  <n.style.icon className="w-4 h-4" style={{ color: n.style.color }} />
                </div>
              </div>
            </motion.div>
          ))}

        {/* The forming star - a dim seed through the spiral, a bright
            supernova flash the instant everything lands, then a steady
            glowing point. Never renders as circles/icons; this is the
            same element (visually) that flies to the home screen below. */}
        {phase !== "flight" && (
          <>
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                left: cx, top: cy, marginLeft: -45, marginTop: -45, width: 90, height: 90,
                background: `radial-gradient(circle, ${starColor}66 0%, transparent 70%)`,
                filter: "blur(6px)",
              }}
              initial={{ scale: 0.25, opacity: 0.25 }}
              animate={
                phase === "spiral"
                  ? { scale: [0.25, 0.35, 0.6, 0.95], opacity: [0.25, 0.35, 0.55, 0.8] }
                  : phase === "burst"
                  ? { scale: [0.95, 2.8, 1.3], opacity: [0.8, 1, 0.85] }
                  : { scale: [1.3, 1.45, 1.3], opacity: [0.85, 0.7, 0.85] }
              }
              transition={
                phase === "spiral"
                  ? { duration: SPIRAL_DURATION, times: [0, 0.5, 0.85, 1], ease: "easeIn" }
                  : phase === "burst"
                  ? { duration: 1.05, times: [0, 0.4, 1], ease: "easeOut" }
                  : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
              }
            />
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                left: cx, top: cy, marginLeft: -7, marginTop: -7, width: 14, height: 14,
                background: `radial-gradient(circle at 35% 30%, #ffffff, ${starColor})`,
              }}
              initial={{ scale: 0.15, opacity: 0.4 }}
              animate={
                phase === "spiral"
                  ? { scale: [0.15, 0.3, 0.6, 0.95] }
                  : phase === "burst"
                  ? { scale: [0.95, 1.7, 1] }
                  : { scale: [1, 1.12, 1] }
              }
              transition={
                phase === "spiral"
                  ? { duration: SPIRAL_DURATION, times: [0, 0.5, 0.85, 1], ease: "easeIn" }
                  : phase === "burst"
                  ? { duration: 1.05, times: [0, 0.4, 1], ease: "easeOut" }
                  : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
              }
            />
          </>
        )}

        {phase === "burst" &&
          particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-full pointer-events-none"
              style={{ left: cx, top: cy, width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5, background: p.color, boxShadow: `0 0 6px 2px ${p.color}aa` }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0 }}
              transition={{ duration: 1.1, delay: p.delay, ease: "easeOut" }}
            />
          ))}
      </div>

      {/* Flying star - a separate, viewport-fixed element so it can travel
          clear of this 300x300 box out to wherever the real star sits on
          the home screen underneath, as the backdrop above fades away to
          reveal it. Starts exactly where the settled star was sitting, so
          the handoff is invisible. */}
      {phase === "flight" && flightStart && targetPos && (
        <>
          <motion.div
            className="fixed rounded-full pointer-events-none z-[85]"
            style={{ width: 90, height: 90, marginLeft: -45, marginTop: -45, background: `radial-gradient(circle, ${starColor}66 0%, transparent 70%)`, filter: "blur(6px)" }}
            initial={{ left: flightStart.x, top: flightStart.y, scale: 1.45, opacity: 0.85 }}
            animate={{ left: targetPos.x, top: targetPos.y, scale: 0.45, opacity: 0.85 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            className="fixed rounded-full pointer-events-none z-[85]"
            style={{ width: 14, height: 14, marginLeft: -7, marginTop: -7, background: `radial-gradient(circle at 35% 30%, #ffffff, ${starColor})` }}
            initial={{ left: flightStart.x, top: flightStart.y, scale: 1, opacity: 1 }}
            animate={{ left: targetPos.x, top: targetPos.y, scale: 0.4, opacity: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={onDone}
          />
        </>
      )}

      <AnimatePresence>
        {phase === "reveal" && (
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-1">Show's a wrap</p>
            <h2 className="text-white font-bold text-xl mb-1">{title}</h2>
            {dateLabel && <p className="text-white/40 text-sm mb-4">{dateLabel}</p>}
            <p className="text-white/60 text-sm max-w-xs mx-auto mb-6">
              Nice work out there — {roles.length} {roles.length === 1 ? "role" : "roles"} came together to pull this one off.
            </p>
            <button
              type="button"
              onClick={startFlight}
              className="flex items-center gap-1.5 mx-auto bg-[#8CFF3D] text-black text-sm font-bold px-5 py-2.5 rounded-full hover:bg-[#7ae62e] transition-colors"
            >
              <Star className="w-4 h-4 fill-current" /> Nice
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
