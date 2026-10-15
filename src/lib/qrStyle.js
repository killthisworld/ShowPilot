import QRCode from "qrcode";

// QR codes with the host's own colors and shape. The code itself comes from
// the `qrcode` package; this draws it as SVG so the dots and corners can be
// styled, then rasterises that same SVG for PNG downloads.

export const QR_DEFAULT = { fg: "#000000", bg: "#ffffff", shape: "square" };
export const QR_SHAPES = [
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["dots", "Dots"],
];
const HEX = /^#[0-9a-f]{6}$/i;

// Whatever is saved (or missing) becomes a safe style.
export function normalizeQr(q) {
  const o = q && typeof q === "object" ? q : {};
  return {
    fg: HEX.test(o.fg) ? o.fg.toLowerCase() : QR_DEFAULT.fg,
    bg: HEX.test(o.bg) ? o.bg.toLowerCase() : QR_DEFAULT.bg,
    shape: QR_SHAPES.some(([k]) => k === o.shape) ? o.shape : QR_DEFAULT.shape,
  };
}

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrastRatio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// null when the colors scan well, otherwise a short warning.
export function scanWarning(style) {
  const s = normalizeQr(style);
  if (contrastRatio(s.fg, s.bg) < 4) return "These colors are too close together. Phones may not be able to scan it. Make the code darker or the background lighter.";
  if (lum(s.fg) > lum(s.bg)) return "A light code on a dark background works on most newer phones, but some older scanners can't read it. Test it before you print.";
  return null;
}

const r2 = (n) => Math.round(n * 100) / 100;
// Rounded rectangle path (r = 0 gives a plain rectangle).
function rr(x, y, w, h, r) {
  if (!r) return `M${x} ${y}h${w}v${h}h${-w}z`;
  return `M${r2(x + r)} ${y}h${r2(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${r2(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}h${r2(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}v${r2(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

// The full code as an SVG string. Corner "eyes" are drawn on their own so
// they can match the dot shape. Stylised shapes use the highest error
// correction, so a bit of damage or glare doesn't stop a scan.
export function qrSvg(url, style, px = 0) {
  const s = normalizeQr(style);
  const qr = QRCode.create(url, { errorCorrectionLevel: s.shape === "square" ? "M" : "H" });
  const n = qr.modules.size;
  const quiet = 4;
  const total = n + quiet * 2;
  const inEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  let mods = "";
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!qr.modules.get(r, c) || inEye(r, c)) continue;
      const x = c + quiet;
      const y = r + quiet;
      if (s.shape === "dots") {
        mods += `M${r2(x + 0.5 - 0.5)} ${r2(y + 0.5)}a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0z`;
      } else if (s.shape === "rounded") {
        mods += rr(x + 0.04, y + 0.04, 0.92, 0.92, 0.3);
      } else {
        // A hair of overlap keeps neighbouring squares from showing seams.
        mods += `M${x} ${y}h1.02v1.02h-1.02z`;
      }
    }
  }

  const outerR = s.shape === "square" ? 0 : 2;
  const holeR = s.shape === "square" ? 0 : 1.2;
  const midR = s.shape === "square" ? 0 : 0.9;
  let eyes = "";
  for (const [er, ec] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = ec + quiet;
    const y = er + quiet;
    eyes += `<path fill-rule="evenodd" d="${rr(x, y, 7, 7, outerR)}${rr(x + 1, y + 1, 5, 5, holeR)}"/>`;
    eyes += `<path d="${rr(x + 2, y + 2, 3, 3, midR)}"/>`;
  }

  const size = px ? ` width="${px}" height="${px}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${size} shape-rendering="${s.shape === "square" ? "crispEdges" : "geometricPrecision"}"><rect width="${total}" height="${total}" fill="${s.bg}"/><g fill="${s.fg}"><path d="${mods}"/>${eyes}</g></svg>`;
}

// PNG data URL of the same picture, for flyers, stories and posts.
export function qrPng(url, style, px = 1200) {
  const svg = qrSvg(url, style, px);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = px;
      canvas.getContext("2d").drawImage(img, 0, 0, px, px);
      URL.revokeObjectURL(href);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(href); reject(new Error("png")); };
    img.src = href;
  });
}
