// Instrument-shaped icons for stage plots (job 249): a filled silhouette per
// position, in that position's color, with dark detail. Used as SVG in the
// builder and turned into PNGs for the PDF. viewBox 0 0 64 64.
const D = 'fill="#000" fill-opacity="0.55"';

const SHAPES = {
  guitar: (c) => `<g transform="rotate(-35 32 32)">
    <rect x="29.5" y="6" width="5" height="27" rx="1" fill="${c}"/>
    <rect x="27.5" y="2" width="9" height="7" rx="2" fill="${c}"/>
    <circle cx="32" cy="38" r="8.5" fill="${c}"/>
    <circle cx="32" cy="49" r="10.5" fill="${c}"/>
    <circle cx="32" cy="42" r="3.2" ${D}/>
    <rect x="27" y="50" width="10" height="2.4" ${D}/></g>`,
  bass: (c) => `<g transform="rotate(-35 32 32)">
    <rect x="30" y="3" width="4" height="33" rx="1" fill="${c}"/>
    <rect x="28.5" y="0.5" width="7" height="5" rx="1.5" fill="${c}"/>
    <ellipse cx="32" cy="48" rx="10" ry="12" fill="${c}"/>
    <ellipse cx="25" cy="38" rx="3.5" ry="6" fill="${c}"/>
    <ellipse cx="39.5" cy="39" rx="3" ry="5" fill="${c}"/>
    <rect x="26" y="44" width="12" height="2.4" ${D}/>
    <rect x="26" y="51" width="12" height="2.4" ${D}/></g>`,
  drums: (c) => `
    <circle cx="32" cy="42" r="15" fill="${c}"/>
    <circle cx="32" cy="42" r="10" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="2"/>
    <ellipse cx="19" cy="22" rx="8" ry="5.5" fill="${c}"/>
    <ellipse cx="45" cy="22" rx="8" ry="5.5" fill="${c}"/>
    <ellipse cx="9" cy="11" rx="8" ry="2.2" fill="${c}"/>
    <ellipse cx="55" cy="11" rx="8" ry="2.2" fill="${c}"/>
    <rect x="8" y="12" width="2" height="16" fill="${c}"/>
    <rect x="54" y="12" width="2" height="16" fill="${c}"/>`,
  keys: (c) => `
    <rect x="3" y="18" width="58" height="28" rx="3" fill="${c}"/>
    ${[11, 19, 27, 35, 43, 51].map((x) => `<rect x="${x}" y="30" width="1.2" height="16" ${D}/>`).join("")}
    ${[8.5, 16.5, 32.5, 40.5, 48.5].map((x) => `<rect x="${x}" y="18" width="5" height="14" rx="0.8" fill="#000" fill-opacity="0.75"/>`).join("")}`,
  vocals: (c) => `
    <rect x="23" y="3" width="18" height="24" rx="9" fill="${c}"/>
    <rect x="23" y="11" width="18" height="2" ${D}/>
    <rect x="23" y="17" width="18" height="2" ${D}/>
    <path d="M27 27 L37 27 L35.5 44 L28.5 44 Z" fill="${c}"/>
    <rect x="30.5" y="44" width="3" height="13" fill="${c}"/>
    <rect x="20" y="56" width="24" height="5" rx="2.5" fill="${c}"/>`,
  horns: (c) => `
    <path d="M42 22 L61 10 L61 42 L42 30 Z" fill="${c}"/>
    <rect x="5" y="22.5" width="40" height="7" rx="3.5" fill="${c}"/>
    <rect x="1" y="23.5" width="7" height="5" rx="1.5" fill="${c}"/>
    <rect x="17" y="12" width="4.5" height="11" rx="1" fill="${c}"/>
    <rect x="24" y="12" width="4.5" height="11" rx="1" fill="${c}"/>
    <rect x="31" y="12" width="4.5" height="11" rx="1" fill="${c}"/>
    <rect x="13" y="30" width="28" height="11" rx="5.5" fill="none" stroke="${c}" stroke-width="4"/>`,
  strings: (c) => `
    <ellipse cx="30" cy="35" rx="10.5" ry="8.5" fill="${c}"/>
    <ellipse cx="30" cy="51" rx="12.5" ry="10" fill="${c}"/>
    <rect x="21" y="40" width="18" height="6" fill="${c}"/>
    <rect x="28" y="6" width="4" height="27" rx="1" fill="${c}"/>
    <circle cx="30" cy="5" r="3.5" fill="${c}"/>
    <rect x="25" y="41" width="1.8" height="9" rx="0.9" ${D}/>
    <rect x="33.2" y="41" width="1.8" height="9" rx="0.9" ${D}/>
    <rect x="47" y="4" width="2.2" height="58" rx="1.1" transform="rotate(22 48 33)" fill="${c}"/>`,
  percussion: (c) => `
    <path d="M19 14 Q14 36 21 60 L43 60 Q50 36 45 14 Z" fill="${c}"/>
    <ellipse cx="32" cy="14" rx="13" ry="4.5" fill="${c}"/>
    <ellipse cx="32" cy="14" rx="10" ry="2.8" fill="#fff" fill-opacity="0.45"/>
    <rect x="17.5" y="26" width="29" height="2.2" ${D}/>
    <rect x="18.5" y="48" width="27" height="2.2" ${D}/>`,
  dj: (c) => `
    <rect x="3" y="9" width="58" height="46" rx="5" fill="${c}"/>
    <circle cx="27" cy="32" r="17" fill="#000" fill-opacity="0.6"/>
    <circle cx="27" cy="32" r="5" fill="${c}"/>
    <circle cx="52" cy="16" r="3.5" fill="#000" fill-opacity="0.6"/>
    <path d="M52 16 L50 38 L41 44" fill="none" stroke="#000" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>`,
  other: (c) => `
    <circle cx="22" cy="49" r="10" fill="${c}"/>
    <rect x="28" y="8" width="4.5" height="42" fill="${c}"/>
    <path d="M32.5 8 Q46 12 50 26 Q42 19 32.5 20 Z" fill="${c}"/>`,
};

export const stageIconSvg = (pos, color, size = 64) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${(SHAPES[pos] || SHAPES.other)(color)}</svg>`;

// For the PDF: the icon as a PNG data URL.
export const stageIconPng = (pos, color, size = 160) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = size;
      cv.height = size;
      cv.getContext("2d").drawImage(img, 0, 0, size, size);
      resolve(cv.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(stageIconSvg(pos, color, size));
  });
