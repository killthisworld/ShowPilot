import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, RefreshCw, Disc3 } from "lucide-react";
import { DJ_COLOR } from "@/lib/djTools";

// The press kit's record (job 460, Jay 2026-11-22): the DJ puts up to 5
// tracks on each side; the label is the play button, the record spins while
// it plays, and the track's name shows under it. A side plays through and
// stops, like vinyl: flip it for Side B.
//   kit: { name, city, photo_url, press_photos, tracks: { a: [{ title, url }], b: [...] } }
//   maxHeight: CSS length the sleeve may take (the record fits beside it)

const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };
export const SIDE_MAX = 5;

export const sidesOf = (tracks) => ({
  a: (tracks?.a || []).filter((t) => t?.url).slice(0, SIDE_MAX),
  b: (tracks?.b || []).filter((t) => t?.url).slice(0, SIDE_MAX),
});

const clock = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

export default function DjRecordPlayer({ kit, maxHeight = "60vh", showName = true }) {
  const sides = sidesOf(kit.tracks);
  const hasTracks = sides.a.length + sides.b.length > 0;
  const [side, setSide] = useState(sides.a.length ? "a" : "b");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ at: 0, len: 0 });
  const [endOfSide, setEndOfSide] = useState(false);
  const [out, setOut] = useState(false);
  const audio = useRef(null);
  const list = sides[side];
  const track = list[idx] || null;
  const other = side === "a" ? "b" : "a";
  // Both sides of the sleeve are the profile pic (Jay, job 460).
  const cover = kit.photo_url || kit.press_photos?.find((p) => p?.url)?.url;

  useEffect(() => { const t = setTimeout(() => setOut(true), 250); return () => clearTimeout(t); }, []);
  useEffect(() => () => audio.current?.pause(), []);

  const start = (s, i) => {
    const t = sides[s][i];
    if (!t || !audio.current) return;
    setSide(s); setIdx(i); setEndOfSide(false);
    audio.current.src = t.url;
    audio.current.play().catch(() => setPlaying(false));
  };
  const toggle = () => {
    if (!hasTracks || !audio.current) return;
    if (playing) { audio.current.pause(); return; }
    if (endOfSide) { start(side, 0); return; }
    if (audio.current.src && track && audio.current.src === new URL(track.url, window.location.href).href) audio.current.play().catch(() => {});
    else start(side, idx);
  };
  const next = () => { if (idx + 1 < list.length) start(side, idx + 1); };
  const prev = () => {
    if (audio.current && audio.current.currentTime > 3) { audio.current.currentTime = 0; return; }
    if (idx > 0) start(side, idx - 1);
  };
  const flip = () => {
    if (!sides[other].length) return;
    audio.current?.pause();
    if (audio.current) audio.current.removeAttribute("src");
    setSide(other); setIdx(0); setEndOfSide(false); setTime({ at: 0, len: 0 });
  };
  const seek = (e) => {
    const a = audio.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration;
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full min-h-0">
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime({ at: e.currentTarget.currentTime, len: e.currentTarget.duration || 0 })}
        onLoadedMetadata={(e) => setTime({ at: 0, len: e.currentTarget.duration || 0 })}
        onEnded={() => { if (idx + 1 < list.length) start(side, idx + 1); else { setPlaying(false); setEndOfSide(true); } }}
      />
      {/* The sleeve takes 64% of the width, the record slides out to its right. */}
      <div className="relative" style={{ width: `min(100%, calc(${maxHeight} / 0.64))`, aspectRatio: "1 / 0.64" }}>
        <div
          className="absolute rounded-full motion-safe:transition-[left] motion-safe:duration-[1200ms] ease-out"
          style={{ width: "54%", aspectRatio: "1 / 1", top: "5%", left: out ? "45%" : "8%" }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full motion-safe:animate-[spin_3.2s_linear_infinite]"
            style={{
              animationPlayState: playing ? "running" : "paused",
              background: "repeating-radial-gradient(circle, #0a0a0a 0 1.5px, #242424 1.5px 2.5px)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.8), inset 0 0 0 2px rgba(255,255,255,0.10)",
            }}
          >
            <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 20deg, transparent 0 18%, rgba(255,255,255,0.14) 24%, transparent 31% 68%, rgba(255,255,255,0.10) 74%, transparent 81%)" }} />
          </div>
          {/* The label: the play button. It doesn't spin, so it's easy to hit. */}
          <button
            type="button"
            onClick={toggle}
            disabled={!hasTracks}
            aria-label={!hasTracks ? `${kit.name || "DJ"}'s record` : playing ? "Pause" : `Play side ${side.toUpperCase()}`}
            className="absolute rounded-full flex flex-col items-center justify-center gap-0.5 shadow-[0_0_0_3px_#050505] enabled:hover:scale-105 transition-transform"
            style={{ inset: "31%", background: DJ_COLOR, color: "#000" }}
          >
            {hasTracks ? (playing ? <Pause className="w-[38%] h-[38%] fill-current" /> : <Play className="w-[38%] h-[38%] fill-current ml-[6%]" />) : <Disc3 className="w-[40%] h-[40%] opacity-60" />}
            <span className="text-[8px] sm:text-[9px] tracking-[0.14em] leading-none" style={mono}>SIDE {side.toUpperCase()}</span>
          </button>
        </div>
        <div className="absolute left-0 top-0 h-full rounded-[4px] overflow-hidden bg-[#1c1d24] shadow-[0_16px_50px_rgba(0,0,0,0.75)]" style={{ aspectRatio: "1 / 1" }}>
          {cover ? <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><Disc3 className="w-16 h-16 text-white/15" /></div>}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.88) 100%)" }} />
          <div className="absolute top-2 left-2.5 right-2.5 flex justify-between text-[9px] tracking-[0.18em]" style={mono}>
            <span style={{ color: DJ_COLOR }}>SHOWPILOT</span><span className="text-white/75">PRESS KIT</span>
          </div>
          {showName && (
            <div className="absolute left-2.5 right-2.5 bottom-2.5 flex flex-col gap-1">
              <h1 className="m-0 text-[clamp(24px,5.2vh,52px)] leading-[0.9] uppercase break-words font-bold" style={cond}>{kit.name}</h1>
              {kit.city && <div className="text-[10px] tracking-[0.16em] text-white/75" style={mono}>{kit.city.toUpperCase()}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Now playing, under the record. */}
      {hasTracks && (
        <div className="w-full max-w-[520px] flex items-center gap-2">
          <button type="button" onClick={prev} disabled={idx === 0 && !(time.at > 3)} aria-label="Previous track" className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 disabled:opacity-30"><SkipBack className="w-[18px] h-[18px]" /></button>
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center" style={{ background: DJ_COLOR, color: "#000" }}>
            {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
          <button type="button" onClick={next} disabled={idx + 1 >= list.length} aria-label="Next track" className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 disabled:opacity-30"><SkipForward className="w-[18px] h-[18px]" /></button>
          <div className="min-w-0 flex-1 flex flex-col gap-1 pl-1">
            <div className="flex items-baseline gap-2 min-w-0" aria-live="polite">
              <span className="shrink-0 text-[11px]" style={{ ...mono, color: DJ_COLOR }}>{side.toUpperCase()}{idx + 1}</span>
              <span className="text-[14.5px] font-semibold truncate">{endOfSide ? `End of side ${side.toUpperCase()}` : track?.title || "Untitled"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={seek} aria-label="Seek" className="relative flex-1 h-4 flex items-center">
                <span className="absolute inset-x-0 h-[3px] rounded-full bg-white/15" />
                <span className="absolute left-0 h-[3px] rounded-full" style={{ width: `${time.len ? (time.at / time.len) * 100 : 0}%`, background: DJ_COLOR }} />
              </button>
              <span className="shrink-0 text-[10.5px] text-white/50 tabular-nums" style={mono}>{clock(time.at)}{time.len ? ` / ${clock(time.len)}` : ""}</span>
            </div>
          </div>
          {sides[other].length > 0 && (
            <button type="button" onClick={flip} className={`shrink-0 min-h-[36px] px-3 rounded-full border text-[12.5px] font-semibold flex items-center gap-1.5 ${endOfSide ? "" : "border-white/20 text-white/80 hover:text-white"}`} style={endOfSide ? { borderColor: DJ_COLOR, color: DJ_COLOR } : undefined}>
              <RefreshCw className="w-3.5 h-3.5" />Side {other.toUpperCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
