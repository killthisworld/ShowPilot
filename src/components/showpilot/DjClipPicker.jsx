import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Play, Square, X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { DJ_COLOR } from "@/lib/djTools";
import { CLIP_SECONDS, clock, decodeAudioFile, defaultStart, encodeClip, peaks } from "@/lib/audioClip";
import { titleFromFile } from "@/lib/djKit";

const mono = { fontFamily: "'JetBrains Mono', monospace" };
const cond = { fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 };

// Pick the 15 seconds of a track that go on the record (job 462). Drag the
// window along the waveform (or nudge it a second at a time), preview it,
// then "Use this clip": the phone cuts it to a small MP3 and hands it back.
export default function DjClipPicker({ file, side, onDone, onCancel }) {
  const [buffer, setBuffer] = useState(null);
  const [bars, setBars] = useState([]);
  const [error, setError] = useState("");
  const [start, setStart] = useState(0);
  const [title, setTitle] = useState(titleFromFile(file.name));
  const [playing, setPlaying] = useState(false);
  const [head, setHead] = useState(0); // 0..1 through the clip while previewing
  const [busy, setBusy] = useState(false);
  const wave = useRef(null);
  const audio = useRef({ ctx: null, src: null, t0: 0, raf: 0 });
  const dur = buffer?.duration || 0;
  const len = Math.min(CLIP_SECONDS, dur || CLIP_SECONDS);
  const maxStart = Math.max(0, dur - len);

  useEffect(() => {
    let gone = false;
    decodeAudioFile(file)
      .then((b) => { if (gone) return; setBuffer(b); setBars(peaks(b, 140)); setStart(defaultStart(b.duration)); })
      .catch((e) => { if (!gone) setError(e.message); });
    return () => { gone = true; stop(); audio.current.ctx?.close?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function stop() {
    const a = audio.current;
    try { a.src?.stop(); } catch { /* already stopped */ }
    a.src = null;
    cancelAnimationFrame(a.raf);
    setPlaying(false);
    setHead(0);
  }
  const play = (from = start) => {
    if (!buffer) return;
    stop();
    const a = audio.current;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!a.ctx) a.ctx = new AC();
    a.ctx.resume?.();
    const src = a.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(a.ctx.destination);
    src.onended = () => { if (a.src === src) { a.src = null; setPlaying(false); setHead(0); cancelAnimationFrame(a.raf); } };
    src.start(0, from, len);
    a.src = src; a.t0 = a.ctx.currentTime;
    setPlaying(true);
    const tick = () => { setHead(Math.min(1, (a.ctx.currentTime - a.t0) / len)); a.raf = requestAnimationFrame(tick); };
    tick();
  };

  const setAt = (s) => {
    const v = Math.max(0, Math.min(maxStart, s));
    setStart(v);
    if (playing) play(v);
  };
  const fromPointer = (e) => {
    const r = wave.current.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * dur;
    return t - len / 2;
  };
  const drag = useRef(false);

  const use = async () => {
    if (!buffer || busy) return;
    stop();
    setBusy(true);
    try {
      const blob = await encodeClip(buffer, start, len);
      onDone({ blob, title: title.trim() || titleFromFile(file.name), start: Math.round(start * 10) / 10 });
    } catch (e) {
      console.error(e);
      setError("Couldn't make the clip on this phone. Try a WAV or MP3 of the track.");
      setBusy(false);
    }
  };

  const nudge = "w-11 h-11 shrink-0 rounded-full border border-white/15 flex items-center justify-center text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-30";
  // On document.body: inside the page it sat under the tab bar on phones.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/75 pb-[env(safe-area-inset-bottom)]" style={{ fontFamily: "Inter, system-ui, sans-serif" }} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Pick 15 seconds" onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-[560px] rounded-t-2xl sm:rounded-2xl bg-[#111216] border border-[#2a2a2a] p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.18em]" style={{ ...mono, color: DJ_COLOR }}>SIDE {side.toUpperCase()} · PICK {CLIP_SECONDS} SECONDS</div>
            <div className="text-[13px] text-white/55 truncate">{file.name}</div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel" className="w-11 h-11 -mr-2 -mt-1 shrink-0 rounded-xl flex items-center justify-center text-white/70 hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        {error ? (
          <p className="m-0 py-6 text-center text-[15px] text-[#F87171]" role="alert">{error}</p>
        ) : !buffer ? (
          <div className="py-10 flex flex-col items-center gap-2 text-[14px] text-white/60"><Loader2 className="w-6 h-6 animate-spin" style={{ color: DJ_COLOR }} />Opening the track…</div>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="sr-only">Track name</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Track name" className="w-full min-h-[44px] px-3 rounded-xl bg-[#0d0e14] border border-white/15 text-[15px] text-white outline-none focus:border-[#FDE047]" />
            </label>

            {/* The waveform: drag (or tap) to move the 15-second window. */}
            <div
              ref={wave}
              role="slider"
              tabIndex={0}
              aria-label="Clip start"
              aria-valuemin={0}
              aria-valuemax={Math.round(maxStart)}
              aria-valuenow={Math.round(start)}
              aria-valuetext={`${clock(start)} to ${clock(start + len)}`}
              onKeyDown={(e) => { if (e.key === "ArrowLeft") setAt(start - 1); if (e.key === "ArrowRight") setAt(start + 1); }}
              onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); setAt(fromPointer(e)); }}
              onPointerMove={(e) => { if (drag.current) setAt(fromPointer(e)); }}
              onPointerUp={() => { drag.current = false; }}
              onPointerCancel={() => { drag.current = false; }}
              className="relative h-28 rounded-xl bg-black/40 border border-white/10 overflow-hidden touch-none select-none cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-[#FDE047]"
            >
              <div className="absolute inset-0 flex items-center gap-[2px] px-1">
                {bars.map((v, i) => {
                  const t = ((i + 0.5) / bars.length) * dur;
                  const inClip = t >= start && t <= start + len;
                  return <span key={i} className="flex-1 rounded-full" style={{ height: `${Math.max(4, v * 92)}%`, background: inClip ? DJ_COLOR : "rgba(255,255,255,0.28)" }} />;
                })}
              </div>
              <div className="absolute inset-y-0 rounded-lg border-2 pointer-events-none" style={{ left: `${(start / dur) * 100}%`, width: `${(len / dur) * 100}%`, borderColor: DJ_COLOR, background: `${DJ_COLOR}1a` }}>
                {playing && <span className="absolute inset-y-0 w-[2px] bg-white" style={{ left: `${head * 100}%` }} />}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" className={nudge} onClick={() => setAt(start - 1)} disabled={start <= 0} aria-label="One second earlier"><ChevronLeft className="w-4 h-4" /></button>
              <div className="flex-1 text-center">
                <div className="text-[24px] leading-none" style={cond}>{clock(start)} – {clock(start + len)}</div>
                <div className="mt-1 text-[11px] text-white/50" style={mono}>OF {clock(dur)}</div>
              </div>
              <button type="button" className={nudge} onClick={() => setAt(start + 1)} disabled={start >= maxStart} aria-label="One second later"><ChevronRight className="w-4 h-4" /></button>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => (playing ? stop() : play())} className="min-h-[48px] px-5 rounded-full border border-white/25 flex items-center gap-2 text-[15px] font-semibold">
                {playing ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}{playing ? "Stop" : "Preview"}
              </button>
              <button type="button" onClick={use} disabled={busy} className="flex-1 min-h-[48px] rounded-full flex items-center justify-center gap-2 text-[15px] font-bold disabled:opacity-60" style={{ background: DJ_COLOR, color: "#000" }}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{busy ? "Making the clip…" : "Use this clip"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
