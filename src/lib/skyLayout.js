import { hashString, seededRandom } from "@/lib/constellation";

// The sky's star layout, shared by the fan's sky (EventSky) and the Stellar
// Birth film so the stars that implode are the ones the fan saw, where they
// saw them (job 266).
//
// Sunflower spiral: the earliest RSVPs sit near the middle and each new one
// lands a little further out, so the sky visibly grows as people join. Seeded
// jitter keeps it from looking mechanical. Works in pixels (w x h) so the
// spiral fills the screen's shape; returns positions plus "constellation"
// lines: the short edges of a minimum spanning tree, so nearby stars link up
// into small groups instead of one tangled web.
export function skyLayout(stars, w, h) {
  if (!w || !h || stars.length === 0) return { positions: [], lines: [] };
  const sorted = [...stars].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const n = sorted.length;
  const rx = w * 0.47, ry = h * 0.44;
  const positions = sorted.map((s, i) => {
    const seed = hashString(s.id);
    const frac = Math.min(1, Math.sqrt((i + 0.6) / Math.max(n, 6)) + (seededRandom(seed) - 0.5) * 0.12);
    const theta = i * 2.39996 + (seededRandom(seed + 1) - 0.5) * 0.9;
    const x = w / 2 + frac * rx * Math.cos(theta);
    const y = h / 2 + frac * ry * Math.sin(theta);
    return { star: s, x, y, xPct: (x / w) * 100, yPct: (y / h) * 100 };
  });

  const lines = [];
  if (n > 1 && n <= 400) {
    const inTree = new Array(n).fill(false);
    const best = new Array(n).fill(Infinity);
    const from = new Array(n).fill(-1);
    best[0] = 0;
    const edges = [];
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
      inTree[u] = true;
      if (from[u] >= 0) edges.push({ a: from[u], b: u, d: best[u] });
      for (let v = 0; v < n; v++) {
        if (inTree[v]) continue;
        const d = Math.hypot(positions[u].x - positions[v].x, positions[u].y - positions[v].y);
        if (d < best[v]) { best[v] = d; from[v] = u; }
      }
    }
    const sortedD = edges.map((e) => e.d).sort((a, b) => a - b);
    const median = sortedD[Math.floor(sortedD.length / 2)] || 0;
    edges.filter((e) => e.d <= median * 1.25).forEach((e) => lines.push([positions[e.a], positions[e.b]]));
  }
  return { positions, lines };
}

// A star's core size in the sky: bigger parties shine a little brighter.
export function starCore(guests) {
  return 6 + Math.min(Number(guests) || 1, 10) * 1.1;
}

// The sky shrinks every star when it's crowded.
export function crowdScale(n) {
  return n > 90 ? 0.6 : n > 45 ? 0.78 : 1;
}
