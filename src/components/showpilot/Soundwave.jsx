import React from "react";

// Deterministic pseudo-random generator seeded by a string (the user's ID),
// so the same user always gets the exact same waveform — permanently theirs,
// not randomized on every render.
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return function () {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

function generateWaveform(seed, bars) {
  const rand = seededRandom(seed || "default");
  return Array.from({ length: bars }, () => 0.15 + rand() * 0.85);
}

export default function Soundwave({ seed, color = "#FFFFFF", bars = 64, height = 40 }) {
  const heights = generateWaveform(seed, bars);
  const barWidth = 100 / bars;

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
      {heights.map((h, i) => {
        const barH = h * height;
        return (
          <rect
            key={i}
            x={i * barWidth + barWidth * 0.3}
            y={(height - barH) / 2}
            width={barWidth * 0.4}
            height={barH}
            rx={barWidth * 0.2}
            fill={color}
          />
        );
      })}
    </svg>
  );
}
