import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Disc3 } from "lucide-react";
import { DJ_COLOR } from "@/lib/djTools";

// The press kit's record (jobs 460-463, Jay 2026-11-22): up to TRACK_MAX
// 15-second clips in one list (no sides any more); the label is the play
// button, the record spins while it plays, and the track's name shows under
// it. It plays through the list and stops.
//   kit: { name, city, photo_url, press_photos, tracks: [{ title, url }] }
//   (older kits kept { a: [...], b: [...] }: tracksOf reads both)
//   maxHeight: CSS length the sleeve may take (the record fits beside it)

const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };
// 3 tracks, one list (Jay, job 463; was 2 a side).
export const TRACK_MAX = 3;

export const tracksOf = (tracks) =>
  (Array.isArray(tracks) ? tracks : [...(tracks?.a || []), ...(tracks?.b || [])]).filter((t) => t?.url).slice(0, TRACK_MAX);

const clock = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

export default function DjRecordPlayer({ kit, maxHeight = "60vh", showName = true }) {
  const list = tracksOf(kit.tracks);
  const hasTracks = list.length > 0;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ at: 0, len: 0 });
  const [ended, setEnded] = useState(false);
  const [out, setOut] = useState(false);
  const audio = useRef(null);
  const track = list[idx] || null;
  // Both sides of the sleeve are the profile pic (Jay, job 460).
  const cover = kit.photo_url || kit.press_photos?.find((p) => p?.url)?.url;

  useEffect(() => { const t = setTimeout(() => setOut(true), 250); return () => clearTimeout(t); }, []);
  useEffect(() => () => audio.current?.pause(), []);

  const start = (i) => {
    const t = list[i];
    if (!t || !audio.current) return;
    setIdx(i); setEnded(false);
    audio.current.src = t.url;
    audio.current.play().catch(() => setPlaying(false));
  };
  const toggle = () => {
    if (!hasTracks || !audio.current) return;
    if (playing) { audio.current.pause(); return; }
    if (ended) { start(0); return; }
    if (audio.current.src && track && audio.current.src === new URL(track.url, window.location.href).href) audio.current.play().catch(() => {});
    else start(idx);
  };
  const next = () => { if (idx + 1 < list.length) start(idx + 1); };
  const prev = () => {
    if (audio.current && audio.current.currentTime > 3) { audio.current.currentTime = 0; return; }
    if (idx > 0) start(idx - 1);
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
        onEnded={() => { if (idx + 1 < list.length) start(idx + 1); else { setPlaying(false); setEnded(true); } }}
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
            aria-label={!hasTracks ? `${kit.name || "DJ"}'s record` : playing ? "Pause" : "Play"}
            className="absolute rounded-full flex flex-col items-center justify-center gap-0.5 shadow-[0_0_0_3px_#050505] enabled:hover:scale-105 transition-transform"
            style={{ inset: "31%", background: DJ_COLOR, color: "#000" }}
          >
            {hasTracks ? (playing ? <Pause className="w-[38%] h-[38%] fill-current" /> : <Play className="w-[38%] h-[38%] fill-current ml-[6%]" />) : <Disc3 className="w-[40%] h-[40%] opacity-60" />}
          </button>
        </div>
        <div className="absolute left-0 top-0 h-full rounded-[4px] overflow-hidden bg-[#1c1d24] shadow-[0_16px_50px_rgba(0,0,0,0.75)]" style={{ aspectRatio: "1 / 1" }}>
          {cover ? <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><Disc3 className="w-16 h-16 text-white/15" /></div>}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.88) 100%)" }} />
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
              <span className="shrink-0 text-[11px]" style={{ ...mono, color: DJ_COLOR }}>{String(idx + 1).padStart(2, "0")}</span>
              <span className="text-[14.5px] font-semibold truncate">{track?.title || "Untitled"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={seek} aria-label="Seek" className="relative flex-1 h-4 flex items-center">
                <span className="absolute inset-x-0 h-[3px] rounded-full bg-white/15" />
                <span className="absolute left-0 h-[3px] rounded-full" style={{ width: `${time.len ? (time.at / time.len) * 100 : 0}%`, background: DJ_COLOR }} />
              </button>
              <span className="shrink-0 text-[10.5px] text-white/50 tabular-nums" style={mono}>{clock(time.at)}{time.len ? ` / ${clock(time.len)}` : ""}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
