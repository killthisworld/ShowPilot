// Shared by Logbook, PublicLogbook, BandCockpit and the Gig Web Venue
// profile constellation. This used to be duplicated near-verbatim across
// those three pages; behavior here is unchanged from each of those
// copies. Only the color/seed-key choices that differed between the
// duplicates are now passed in by the caller instead of hardcoded here -
// see hashColor/getSeedKey/color usage at each call site.

export const STAMP_COLORS = ["#8CFF3D", "#60A5FA", "#F59E0B", "#F472B6", "#A78BFA", "#34D399", "#F87171", "#38BDF8"];

export function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return STAMP_COLORS[Math.abs(hash) % STAMP_COLORS.length];
}

export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < (str || "").length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// items: anything with a `date` (for sort order) and either an `id` or a
// caller-supplied seed key. `getSeedKey` lets a caller seed the jitter
// off a different stable field - BandCockpit seeds off `share_token`
// since a linked show has no `id` stable across accounts; everyone else
// can rely on the default (`item.id`).
export function getConstellationLayout(items, { getSeedKey } = {}) {
  const seedKeyFor = getSeedKey || ((item) => item.id);
  const n = items.length;
  if (n === 0) return { positions: [], rows: 0, cols: 0 };
  const cols = Math.max(3, Math.ceil(Math.sqrt(n * 1.5)));
  const rows = Math.ceil(n / cols) + 1;

  // Order every cell by distance from center, so filling them in sequence
  // naturally builds outward from the middle of the page.
  const centerCol = (cols - 1) / 2;
  const centerRow = (rows - 1) / 2;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ col: c, row: r, dist: Math.hypot(c - centerCol, r - centerRow) });
    }
  }
  cells.sort((a, b) => a.dist - b.dist);

  // Earliest item gets the most central cell, so the constellation reads
  // as growing outward as time goes on.
  const sorted = [...items].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const positions = sorted.map((show, idx) => {
    const cell = cells[idx] || cells[cells.length - 1];
    const seed = hashString(seedKeyFor(show) || `${show.band_name}-${show.date}-${idx}`);
    const jitterX = (seededRandom(seed) - 0.5) * 0.6;
    const jitterY = (seededRandom(seed + 1) - 0.5) * 0.6;
    const rotation = (seededRandom(seed + 2) - 0.5) * 14;

    const xPct = ((cell.col + 0.5 + jitterX) / cols) * 100;
    const yPct = ((cell.row + 0.5 + jitterY) / rows) * 100;

    return { show, xPct, yPct, rotation };
  });

  return { positions, rows, cols };
}

// A glowing dot - the visual "star" used by every constellation view in
// the app. `color` is computed by the caller (hashColor off a venue/band
// name, a fixed pink for linked shows, or a user-picked category color)
// rather than by this component, since what a star's color *means*
// differs per screen. `rotation` was accepted but never actually used by
// the three previous copies of this component, so it isn't here either.
export function ShowStamp({ onClick, color, isNewest, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="group relative flex items-center justify-center transition-transform duration-300 hover:scale-150"
      style={{ width: 56, height: 56 }}
    >
      {isNewest && (
        <style>{`
          @keyframes starPulseGlow {
            0%, 100% { transform: scale(1); opacity: 0.7; }
            50% { transform: scale(1.6); opacity: 1; }
          }
          @keyframes starPulseCore {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.35); }
          }
        `}</style>
      )}
      <div
        className="absolute rounded-full transition-opacity duration-300 group-hover:opacity-100"
        style={{
          width: isNewest ? 50 : 40,
          height: isNewest ? 50 : 40,
          background: `radial-gradient(circle, ${color}88 0%, transparent 70%)`,
          filter: "blur(5px)",
          opacity: 0.85,
          animation: isNewest ? "starPulseGlow 3s ease-in-out infinite" : undefined,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: isNewest ? 11 : 9,
          height: isNewest ? 11 : 9,
          background: `radial-gradient(circle at 35% 30%, #ffffff, ${color})`,
          boxShadow: isNewest
            ? `0 0 14px 5px ${color}ee, 0 0 30px 12px ${color}88`
            : `0 0 8px 2px ${color}cc, 0 0 18px 7px ${color}55`,
          animation: isNewest ? "starPulseCore 3s ease-in-out infinite" : undefined,
        }}
      />
    </button>
  );
}
