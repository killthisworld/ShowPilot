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
  // More icons to pick from for your own instruments (job 274), the kinds a
  // mixer's channel icons cover. Drawn for ShowPilot.
  kick: (c) => `
    <circle cx="32" cy="34" r="22" fill="${c}"/>
    <circle cx="32" cy="34" r="15" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="2.5"/>
    <circle cx="32" cy="34" r="4" ${D}/>
    <rect x="12" y="54" width="4" height="8" fill="${c}"/><rect x="48" y="54" width="4" height="8" fill="${c}"/>`,
  snare: (c) => `
    <ellipse cx="32" cy="22" rx="24" ry="7" fill="${c}"/>
    <path d="M8 22 V40 Q32 52 56 40 V22 Q32 34 8 22 Z" fill="${c}"/>
    ${[14, 22, 30, 38, 46].map((x) => `<rect x="${x}" y="${x === 30 ? 30 : 28}" width="2" height="14" ${D}/>`).join("")}
    <rect x="40" y="2" width="2.5" height="20" rx="1" transform="rotate(35 41 12)" fill="${c}"/>`,
  hihat: (c) => `
    <ellipse cx="32" cy="18" rx="26" ry="4.5" fill="${c}"/>
    <ellipse cx="32" cy="25" rx="26" ry="4.5" fill="${c}"/>
    <rect x="30.5" y="8" width="3" height="50" fill="${c}"/>
    <path d="M18 60 L32 46 L46 60" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`,
  tom: (c) => `
    <ellipse cx="32" cy="18" rx="20" ry="7" fill="${c}"/>
    <path d="M12 18 V46 Q32 58 52 46 V18 Q32 30 12 18 Z" fill="${c}"/>
    <ellipse cx="32" cy="18" rx="15" ry="4.5" fill="#fff" fill-opacity="0.35"/>
    <rect x="12" y="32" width="40" height="2" ${D}/>`,
  cymbal: (c) => `
    <ellipse cx="32" cy="22" rx="28" ry="7" fill="${c}"/>
    <ellipse cx="32" cy="20" rx="5" ry="2.5" fill="#000" fill-opacity="0.45"/>
    <rect x="30.5" y="22" width="3" height="34" fill="${c}"/>
    <path d="M18 61 L32 52 L46 61" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`,
  conga: (c) => `
    <path d="M14 10 Q8 36 18 60 L30 60 Q34 36 28 10 Z" fill="${c}"/>
    <path d="M36 14 Q30 38 39 60 L51 60 Q58 38 52 14 Z" fill="${c}"/>
    <ellipse cx="21" cy="10" rx="7.5" ry="2.8" fill="#fff" fill-opacity="0.45"/>
    <ellipse cx="44" cy="14" rx="8" ry="2.8" fill="#fff" fill-opacity="0.45"/>`,
  acoustic: (c) => `<g transform="rotate(-35 32 32)">
    <rect x="29.5" y="2" width="5" height="26" rx="1" fill="${c}"/>
    <path d="M32 26 C22 26 22 34 25 38 C18 42 19 60 32 60 C45 60 46 42 39 38 C42 34 42 26 32 26 Z" fill="${c}"/>
    <circle cx="32" cy="42" r="4.5" fill="#000" fill-opacity="0.65"/>
    <rect x="27" y="51" width="10" height="2.4" ${D}/></g>`,
  electric: (c) => `<g transform="rotate(-35 32 32)">
    <rect x="29.5" y="2" width="5" height="30" rx="1" fill="${c}"/>
    <path d="M24 30 L40 30 L44 24 L47 30 Q50 46 40 58 L24 58 Q14 46 18 34 L20 26 Z" fill="${c}"/>
    <rect x="26" y="38" width="12" height="2.4" ${D}/><rect x="26" y="44" width="12" height="2.4" ${D}/>
    <circle cx="40" cy="51" r="1.8" ${D}/></g>`,
  piano: (c) => `
    <path d="M6 10 H34 Q58 10 58 34 Q58 56 46 56 H6 Z" fill="${c}"/>
    <rect x="6" y="48" width="40" height="8" fill="#fff" fill-opacity="0.5"/>
    ${[10, 15, 20, 25, 30, 35, 40].map((x) => `<rect x="${x}" y="48" width="1" height="8" ${D}/>`).join("")}`,
  organ: (c) => `
    <rect x="6" y="6" width="52" height="30" rx="3" fill="${c}"/>
    ${[12, 18, 24, 30, 36, 42, 48].map((x, i) => `<rect x="${x}" y="11" width="3" height="${10 + (i % 3) * 5}" rx="1.5" ${D}/>`).join("")}
    <rect x="4" y="38" width="56" height="10" rx="2" fill="${c}"/>
    <rect x="4" y="50" width="56" height="10" rx="2" fill="${c}"/>`,
  synth: (c) => `
    <rect x="3" y="14" width="58" height="36" rx="3" fill="${c}"/>
    ${[9, 17, 25, 33].map((x) => `<circle cx="${x}" cy="22" r="2.6" ${D}/>`).join("")}
    <rect x="42" y="18" width="14" height="8" rx="1" ${D}/>
    ${[8.5, 16.5, 32.5, 40.5, 48.5].map((x) => `<rect x="${x}" y="32" width="5" height="10" rx="0.8" fill="#000" fill-opacity="0.75"/>`).join("")}`,
  sax: (c) => `
    <path d="M30 4 L36 4 L36 40 Q36 58 24 58 Q12 58 12 48 L12 42 L20 42 L20 47 Q20 50 24 50 Q28 50 28 40 Z" fill="${c}"/>
    <path d="M4 40 L22 34 L22 48 Z" fill="${c}"/>
    ${[12, 19, 26].map((y) => `<circle cx="32" cy="${y}" r="2" ${D}/>`).join("")}
    <rect x="34" y="2" width="12" height="4" rx="2" transform="rotate(25 34 4)" fill="${c}"/>`,
  trumpet: (c) => `
    <path d="M44 22 L62 12 L62 40 L44 30 Z" fill="${c}"/>
    <rect x="4" y="23" width="42" height="6" rx="3" fill="${c}"/>
    <rect x="16" y="13" width="4" height="11" rx="1" fill="${c}"/><rect x="23" y="13" width="4" height="11" rx="1" fill="${c}"/><rect x="30" y="13" width="4" height="11" rx="1" fill="${c}"/>
    <rect x="12" y="29" width="30" height="10" rx="5" fill="none" stroke="${c}" stroke-width="3.5"/>`,
  trombone: (c) => `
    <path d="M46 20 L62 10 L62 36 L46 28 Z" fill="${c}"/>
    <rect x="6" y="21" width="42" height="5" rx="2.5" fill="${c}"/>
    <rect x="6" y="34" width="34" height="5" rx="2.5" fill="${c}"/>
    <path d="M8 23.5 Q2 23.5 2 30 Q2 36.5 8 36.5" fill="none" stroke="${c}" stroke-width="5"/>
    <rect x="22" y="22" width="3" height="16" ${D}/>`,
  violin: (c) => `<g transform="rotate(-30 32 32)">
    <path d="M32 22 C24 22 23 28 26 32 C20 34 20 44 25 46 C21 50 23 60 32 60 C41 60 43 50 39 46 C44 44 44 34 38 32 C41 28 40 22 32 22 Z" fill="${c}"/>
    <rect x="30.5" y="3" width="3" height="21" fill="${c}"/>
    <circle cx="32" cy="3" r="2.6" fill="${c}"/>
    <rect x="27" y="34" width="1.6" height="9" rx="0.8" ${D}/><rect x="35.4" y="34" width="1.6" height="9" rx="0.8" ${D}/></g>`,
  mic: (c) => `
    <circle cx="32" cy="16" r="12" fill="${c}"/>
    <path d="M24 16 H40 M32 6 V26" stroke="#000" stroke-opacity="0.5" stroke-width="2"/>
    <rect x="28.5" y="27" width="7" height="20" rx="2.5" fill="${c}"/>
    <rect x="31" y="47" width="2" height="10" fill="${c}"/>
    <rect x="22" y="56" width="20" height="4" rx="2" fill="${c}"/>`,
  headset: (c) => `
    <path d="M12 34 V30 Q12 10 32 10 Q52 10 52 30 V34" fill="none" stroke="${c}" stroke-width="5"/>
    <rect x="6" y="30" width="12" height="18" rx="5" fill="${c}"/>
    <rect x="46" y="30" width="12" height="18" rx="5" fill="${c}"/>
    <path d="M12 46 Q14 58 30 56" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="31" cy="56" r="4" fill="${c}"/>`,
  laptop: (c) => `
    <rect x="10" y="12" width="44" height="30" rx="3" fill="${c}"/>
    <rect x="14" y="16" width="36" height="22" rx="1" fill="#000" fill-opacity="0.6"/>
    <path d="M4 46 H60 L56 52 H8 Z" fill="${c}"/>`,
  di: (c) => `
    <rect x="10" y="16" width="44" height="34" rx="4" fill="${c}"/>
    <circle cx="22" cy="33" r="6" ${D}/><circle cx="42" cy="33" r="6" ${D}/>
    <rect x="28" y="22" width="8" height="5" rx="1" fill="#000" fill-opacity="0.4"/>`,
  amp: (c) => `
    <rect x="6" y="8" width="52" height="50" rx="4" fill="${c}"/>
    <rect x="10" y="12" width="44" height="7" rx="1" fill="#000" fill-opacity="0.4"/>
    <rect x="10" y="22" width="44" height="32" rx="2" fill="#000" fill-opacity="0.6"/>
    <circle cx="32" cy="38" r="11" fill="${c}" fill-opacity="0.35"/>`,
  speaker: (c) => `
    <path d="M10 6 H54 V58 H10 Z" fill="${c}"/>
    <circle cx="32" cy="18" r="6" fill="#000" fill-opacity="0.55"/>
    <circle cx="32" cy="40" r="13" fill="#000" fill-opacity="0.55"/>
    <circle cx="32" cy="40" r="4" fill="${c}"/>`,
  wedge: (c) => `
    <path d="M4 50 L14 18 L60 34 L60 50 Z" fill="${c}"/>
    <path d="M17 22 L56 35.5 L56 46 L10 46 Z" fill="#000" fill-opacity="0.55"/>`,
  harmonica: (c) => `
    <rect x="4" y="22" width="56" height="20" rx="4" fill="${c}"/>
    ${[9, 15, 21, 27, 33, 39, 45, 51].map((x) => `<rect x="${x}" y="28" width="4" height="8" rx="1" fill="#000" fill-opacity="0.6"/>`).join("")}`,
  accordion: (c) => `
    <rect x="4" y="12" width="12" height="40" rx="2" fill="${c}"/>
    <rect x="48" y="12" width="12" height="40" rx="2" fill="${c}"/>
    <path d="M16 14 L22 52 L28 14 L34 52 L40 14 L46 52 L48 52 L48 12 L16 12 Z" fill="${c}" fill-opacity="0.7"/>`,
};

// Every icon you can give your own instrument (job 274), with names.
export const ICON_CHOICES = [
  ["vocals", "Vocal mic"], ["mic", "Mic"], ["headset", "Headset"],
  ["drums", "Drum kit"], ["kick", "Kick"], ["snare", "Snare"], ["tom", "Tom"], ["hihat", "Hi-hat"], ["cymbal", "Cymbal"],
  ["percussion", "Percussion"], ["conga", "Congas"],
  ["guitar", "Guitar"], ["acoustic", "Acoustic"], ["electric", "Electric"], ["bass", "Bass"],
  ["keys", "Keys"], ["piano", "Piano"], ["organ", "Organ"], ["synth", "Synth"],
  ["horns", "Horns"], ["sax", "Sax"], ["trumpet", "Trumpet"], ["trombone", "Trombone"],
  ["strings", "Cello"], ["violin", "Violin"], ["harmonica", "Harmonica"], ["accordion", "Accordion"],
  ["dj", "DJ"], ["laptop", "Laptop"], ["di", "DI box"], ["amp", "Amp"], ["speaker", "Speaker"], ["wedge", "Wedge"], ["other", "Other"],
].map(([id, label]) => ({ id, label }));

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
