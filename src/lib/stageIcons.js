// Instrument-shaped icons for stage plots (job 249): a filled silhouette per
// position, in that position's color, with dark detail. Used as SVG in the
// builder and turned into PNGs for the PDF. viewBox 0 0 64 64.
const D = 'fill="#000" fill-opacity="0.55"';

// Redrawn (job 276) so each reads as its instrument at a glance: kit pieces
// from the side, guitars by body shape, keys / horns / strings as clear
// silhouettes. Drawn for ShowPilot.
const K = (op = 0.55) => `fill="#000" fill-opacity="${op}"`;
const SHAPES = {
  // Electric guitar (Strat-style), neck up-right.
  guitar: (c) => `<g transform="rotate(40 32 32)">
    <rect x="29.6" y="1" width="4.8" height="31" rx="1" fill="${c}"/>
    <path d="M28.5 0 h7 l1 6 h-9 z" fill="${c}"/>
    <path d="M32 27 C27 27 26 22 22 23 C17 24 18 31 21 35 C16 40 16 49 20 55 C24 61 40 61 44 55 C48 49 48 40 43 35 C46 31 47 24 42 23 C38 22 37 27 32 27 Z" fill="${c}"/>
    <path d="M24.5 37 Q32 33 40 37 L40 48 Q32 52 24.5 48 Z" ${K(0.25)}/>
    <rect x="26" y="38.5" width="12" height="2" rx="1" ${D}/><rect x="26" y="43" width="12" height="2" rx="1" ${D}/>
    <rect x="27" y="51" width="10" height="2.6" rx="1" ${D}/></g>`,
  // Bass: longer neck, P-bass body, 4 tuners.
  bass: (c) => `<g transform="rotate(40 32 32)">
    <rect x="30" y="0" width="4" height="36" rx="1" fill="${c}"/>
    <rect x="26" y="1" width="3" height="3" rx="1" fill="${c}"/><rect x="26" y="6" width="3" height="3" rx="1" fill="${c}"/>
    <rect x="35" y="1" width="3" height="3" rx="1" fill="${c}"/><rect x="35" y="6" width="3" height="3" rx="1" fill="${c}"/>
    <path d="M32 32 C27 32 27 27 23 28 C18 29 19 36 22 39 C17 44 18 52 22 57 C26 62 38 62 42 57 C46 52 47 44 42 39 C45 36 46 29 41 28 C37 27 37 32 32 32 Z" fill="${c}"/>
    <rect x="26.5" y="42" width="5" height="3" rx="1" ${D}/><rect x="32.5" y="45" width="5" height="3" rx="1" ${D}/>
    <rect x="27" y="53" width="10" height="2.6" rx="1" ${D}/></g>`,
  // Drum kit from the front.
  drums: (c) => `
    <circle cx="32" cy="45" r="14" fill="${c}"/>
    <circle cx="32" cy="45" r="9.5" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="2"/>
    <ellipse cx="21.5" cy="25" rx="7.5" ry="6" fill="${c}"/><ellipse cx="42.5" cy="25" rx="7.5" ry="6" fill="${c}"/>
    <ellipse cx="21.5" cy="25" rx="5" ry="3.8" ${K(0.3)}/><ellipse cx="42.5" cy="25" rx="5" ry="3.8" ${K(0.3)}/>
    <path d="M1 14 Q8 10 15 14 Z" fill="${c}"/><path d="M49 12 Q56 8 63 12 Z" fill="${c}"/>
    <rect x="7" y="13" width="2" height="47" fill="${c}"/><rect x="55" y="11" width="2" height="49" fill="${c}"/>
    <path d="M10 49 h9 v8 q-4.5 3 -9 0 z" fill="${c}"/>`,
  // Keyboard from above.
  keys: (c) => `
    <rect x="2" y="17" width="60" height="30" rx="3" fill="${c}"/>
    <rect x="2" y="17" width="60" height="7" rx="3" ${K(0.3)}/>
    ${[9.5, 17, 24.5, 32, 39.5, 47, 54.5].map((x) => `<rect x="${x}" y="24" width="1.3" height="23" ${D}/>`).join("")}
    ${[7, 14.5, 29.5, 37, 44.5].map((x) => `<rect x="${x}" y="24" width="5" height="13" rx="0.8" fill="#000" fill-opacity="0.75"/>`).join("")}`,
  // Handheld vocal mic.
  vocals: (c) => `
    <circle cx="32" cy="14" r="11" fill="${c}"/>
    <path d="M23 14 h18 M32 3.5 v21 M25 7 l14 14 M39 7 l-14 14" stroke="#000" stroke-opacity="0.35" stroke-width="1.6"/>
    <rect x="23" y="23" width="18" height="4" rx="1.5" fill="${c}"/>
    <path d="M24.5 27 h15 l-3.5 30 q-4 3.5 -8 0 z" fill="${c}"/>
    <rect x="27" y="33" width="10" height="1.8" ${D}/>`,
  // Horns: French horn bell and coil.
  horns: (c) => `
    <circle cx="28" cy="32" r="17" fill="none" stroke="${c}" stroke-width="5"/>
    <circle cx="28" cy="32" r="8" fill="none" stroke="${c}" stroke-width="3.5"/>
    <path d="M38 40 Q50 44 52 56 L62 58 Q60 40 44 34 Z" fill="${c}"/>
    <rect x="24" y="12" width="4" height="9" rx="1.5" fill="${c}"/><rect x="31" y="12" width="4" height="9" rx="1.5" fill="${c}"/>
    <path d="M8 22 L2 14" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`,
  // Cello upright with its bow.
  strings: (c) => `
    <path d="M30 18 C22 18 21 25 24 29 C18 32 18 41 23 43 C17 47 18 60 30 60 C42 60 43 47 37 43 C42 41 42 32 36 29 C39 25 38 18 30 18 Z" fill="${c}"/>
    <rect x="28.3" y="2" width="3.4" height="18" fill="${c}"/><circle cx="30" cy="2.5" r="2.6" fill="${c}"/>
    <rect x="29" y="59" width="2" height="5" fill="${c}"/>
    <path d="M24.5 34 q-2 4 0 8 M35.5 34 q2 4 0 8" stroke="#000" stroke-opacity="0.55" stroke-width="1.6" fill="none"/>
    <rect x="26" y="47" width="8" height="2" rx="1" ${D}/>
    <rect x="47" y="5" width="2.2" height="56" rx="1.1" transform="rotate(24 48 33)" fill="${c}"/>`,
  // Percussion: tambourine.
  percussion: (c) => `
    <circle cx="32" cy="32" r="24" fill="none" stroke="${c}" stroke-width="8"/>
    <circle cx="32" cy="32" r="18" ${K(0.0)}/>
    ${[0, 72, 144, 216, 288].map((a) => { const r = (a * Math.PI) / 180; return `<ellipse cx="${32 + 24 * Math.cos(r)}" cy="${32 + 24 * Math.sin(r)}" rx="4.5" ry="2.2" transform="rotate(${a + 90} ${32 + 24 * Math.cos(r)} ${32 + 24 * Math.sin(r)})" fill="#000" fill-opacity="0.6"/>`; }).join("")}`,
  // DJ: turntable from above.
  dj: (c) => `
    <rect x="3" y="9" width="58" height="46" rx="5" fill="${c}"/>
    <circle cx="27" cy="32" r="17" fill="#000" fill-opacity="0.6"/>
    <circle cx="27" cy="32" r="11" fill="none" stroke="${c}" stroke-opacity="0.35" stroke-width="1"/>
    <circle cx="27" cy="32" r="4.5" fill="${c}"/>
    <circle cx="52" cy="16" r="3.5" fill="#000" fill-opacity="0.6"/>
    <path d="M52 16 L50 38 L41 44" fill="none" stroke="#000" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>
    <rect x="47" y="46" width="9" height="4" rx="1" fill="#000" fill-opacity="0.5"/>`,
  // Other: a music note.
  other: (c) => `
    <ellipse cx="20" cy="50" rx="10" ry="8" transform="rotate(-20 20 50)" fill="${c}"/>
    <rect x="26" y="8" width="4.5" height="43" fill="${c}"/>
    <path d="M30.5 8 Q46 12 49 28 Q42 21 30.5 21 Z" fill="${c}"/>`,
  // Kick drum from the side, on its spurs, with the pedal.
  kick: (c) => `
    <ellipse cx="14" cy="32" rx="7" ry="22" fill="${c}"/>
    <rect x="14" y="10" width="34" height="44" fill="${c}"/>
    <ellipse cx="48" cy="32" rx="7" ry="22" fill="${c}"/>
    <ellipse cx="48" cy="32" rx="4.5" ry="18" ${K(0.35)}/>
    ${[19, 27, 35, 43].map((x) => `<rect x="${x}" y="10" width="2" height="44" ${D}/>`).join("")}
    <path d="M18 52 L10 62 M44 52 L52 62" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <path d="M56 46 L62 60 H54 Z" fill="${c}"/>`,
  // Snare on its stand, from the side.
  snare: (c) => `
    <ellipse cx="32" cy="18" rx="24" ry="6" fill="${c}"/>
    <rect x="8" y="18" width="48" height="16" fill="${c}"/>
    <ellipse cx="32" cy="34" rx="24" ry="6" fill="${c}"/>
    <ellipse cx="32" cy="18" rx="20" ry="4" fill="#fff" fill-opacity="0.35"/>
    ${[13, 22, 32, 42, 51].map((x) => `<rect x="${x - 1}" y="${x === 32 ? 22 : 21}" width="2.4" height="11" rx="1" ${D}/>`).join("")}
    <rect x="30.5" y="38" width="3" height="16" fill="${c}"/>
    <path d="M18 63 L32 52 L46 63" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Hi-hat: two cymbals on the stand, pedal at the bottom.
  hihat: (c) => `
    <path d="M4 15 Q32 7 60 15 Q32 19 4 15 Z" fill="${c}"/>
    <path d="M4 21 Q32 29 60 21 Q32 17 4 21 Z" fill="${c}"/>
    <rect x="30.5" y="6" width="3" height="50" fill="${c}"/>
    <path d="M16 60 L32 46 L48 60" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M26 62 h12 l-2 -4 h-8 z" fill="${c}"/>`,
  // Rack tom, tilted, on its mount.
  tom: (c) => `<g transform="rotate(-12 32 30)">
    <ellipse cx="32" cy="14" rx="20" ry="6" fill="${c}"/>
    <rect x="12" y="14" width="40" height="26" fill="${c}"/>
    <ellipse cx="32" cy="40" rx="20" ry="6" fill="${c}"/>
    <ellipse cx="32" cy="14" rx="16" ry="3.8" fill="#fff" fill-opacity="0.35"/>
    ${[17, 25, 39, 47].map((x) => `<rect x="${x - 1}" y="18" width="2.4" height="18" rx="1" ${D}/>`).join("")}</g>
    <rect x="30.5" y="44" width="3" height="16" fill="${c}"/>`,
  // Ride cymbal, tilted on its stand.
  cymbal: (c) => `
    <path d="M3 22 Q32 8 61 18 Q34 26 3 22 Z" fill="${c}"/>
    <ellipse cx="32" cy="17" rx="5" ry="2.5" ${K(0.5)}/>
    <rect x="30.5" y="18" width="3" height="38" fill="${c}"/>
    <path d="M16 62 L32 50 L48 62" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Congas: two tall barrel drums.
  conga: (c) => `
    <path d="M9 12 Q4 34 12 60 L28 60 Q34 34 29 12 Z" fill="${c}"/>
    <path d="M36 16 Q31 38 38 60 L54 60 Q60 38 55 16 Z" fill="${c}"/>
    <ellipse cx="19" cy="12" rx="10" ry="3.2" fill="#fff" fill-opacity="0.45"/>
    <ellipse cx="45.5" cy="16" rx="9.5" ry="3.2" fill="#fff" fill-opacity="0.45"/>
    <rect x="7.5" y="24" width="23" height="2" ${D}/><rect x="34" y="28" width="22" height="2" ${D}/>`,
  // Acoustic guitar: round body, soundhole.
  acoustic: (c) => `<g transform="rotate(40 32 32)">
    <rect x="29.6" y="1" width="4.8" height="27" rx="1" fill="${c}"/>
    <path d="M28.5 0 h7 l1 6 h-9 z" fill="${c}"/>
    <path d="M32 24 C23 24 22 32 25 36 C17 40 17 61 32 61 C47 61 47 40 39 36 C42 32 41 24 32 24 Z" fill="${c}"/>
    <circle cx="32" cy="39" r="4.6" fill="#000" fill-opacity="0.65"/>
    <rect x="27" y="51" width="10" height="2.6" rx="1" ${D}/></g>`,
  // Electric guitar (single cutaway, Les Paul-style).
  electric: (c) => `<g transform="rotate(40 32 32)">
    <rect x="29.6" y="1" width="4.8" height="29" rx="1" fill="${c}"/>
    <path d="M28.5 0 h7 l1 6 h-9 z" fill="${c}"/>
    <path d="M32 27 C27 27 23 25 22 29 C21 33 23 35 21 39 C17 46 19 59 32 60 C45 59 47 46 43 39 C41 35 43 31 42 27 C40 24 37 27 32 27 Z" fill="${c}"/>
    <rect x="26.5" y="36" width="11" height="4" rx="1.4" ${D}/><rect x="26.5" y="44" width="11" height="4" rx="1.4" ${D}/>
    <circle cx="39" cy="53" r="1.8" ${D}/><circle cx="35" cy="56" r="1.8" ${D}/></g>`,
  // Grand piano from the side, lid up.
  piano: (c) => `
    <path d="M6 30 H44 Q60 30 60 38 V42 H6 Z" fill="${c}"/>
    <path d="M10 29 L52 10 L54 13 L14 30 Z" fill="${c}"/>
    <rect x="6" y="42" width="54" height="5" fill="${c}"/>
    <rect x="9" y="47" width="4" height="14" fill="${c}"/><rect x="52" y="47" width="4" height="14" fill="${c}"/>
    <rect x="6" y="38" width="13" height="4" fill="#fff" fill-opacity="0.55"/>`,
  // Organ: two keyboards, drawbars, legs.
  organ: (c) => `
    <rect x="5" y="6" width="54" height="16" rx="2" fill="${c}"/>
    ${[11, 16, 21, 26, 31, 36, 41, 46, 51].map((x, i) => `<rect x="${x}" y="9" width="2.6" height="${4 + (i % 4) * 2.5}" rx="1.2" ${D}/>`).join("")}
    <rect x="3" y="24" width="58" height="7" rx="1" fill="${c}"/><rect x="3" y="33" width="58" height="7" rx="1" fill="${c}"/>
    ${[10, 18, 26, 34, 42, 50].map((x) => `<rect x="${x}" y="24" width="1" height="16" ${D}/>`).join("")}
    <rect x="5" y="42" width="54" height="6" fill="${c}"/>
    <rect x="7" y="48" width="4" height="13" fill="${c}"/><rect x="53" y="48" width="4" height="13" fill="${c}"/>`,
  // Synth: keyboard with knobs and a screen.
  synth: (c) => `
    <rect x="2" y="12" width="60" height="40" rx="3" fill="${c}"/>
    ${[8, 15, 22, 29].map((x) => `<circle cx="${x}" cy="20" r="2.8" ${D}/>`).join("")}
    <rect x="36" y="16" width="21" height="9" rx="1.2" ${K(0.7)}/>
    ${[10, 17.5, 25, 32.5, 40, 47.5, 55].map((x) => `<rect x="${x}" y="30" width="1.1" height="22" ${D}/>`).join("")}
    ${[7.5, 15, 30, 37.5, 45].map((x) => `<rect x="${x}" y="30" width="4.6" height="12" rx="0.8" fill="#000" fill-opacity="0.75"/>`).join("")}`,
  // Alto sax: neck and mouthpiece, body, curved bow, bell opening up.
  sax: (c) => `
    <path d="M31 9 L39 9 L39 46 Q39 61 25 61 Q12 61 12 49 L11 40 L25 40 L23 48 Q23 53 27 53 Q31 53 31 46 Z" fill="${c}"/>
    <ellipse cx="18" cy="39" rx="9.5" ry="3.2" fill="${c}"/>
    <ellipse cx="18" cy="39" rx="6.5" ry="1.8" fill="#000" fill-opacity="0.55"/>
    <path d="M35 10 Q34 3 24 4" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>
    <rect x="17" y="2" width="8" height="4" rx="2" fill="${c}"/>
    ${[16, 22, 28, 34].map((y) => `<circle cx="35" cy="${y}" r="2" fill="#000" fill-opacity="0.55"/>`).join("")}
`,
  // Trumpet from the side: bell right, valves up.
  trumpet: (c) => `
    <path d="M42 24 L62 13 L62 41 L42 30 Z" fill="${c}"/>
    <rect x="6" y="24" width="38" height="6" rx="3" fill="${c}"/>
    <rect x="1" y="24.5" width="7" height="5" rx="2" fill="${c}"/>
    <rect x="17" y="14" width="4.4" height="12" rx="1" fill="${c}"/><rect x="24" y="14" width="4.4" height="12" rx="1" fill="${c}"/><rect x="31" y="14" width="4.4" height="12" rx="1" fill="${c}"/>
    <rect x="16" y="11" width="6.4" height="3.5" rx="1.7" fill="${c}"/><rect x="23" y="11" width="6.4" height="3.5" rx="1.7" fill="${c}"/><rect x="30" y="11" width="6.4" height="3.5" rx="1.7" fill="${c}"/>
    <path d="M14 30 v6 q0 6 6 6 h16 q6 0 6 -6 v-6" fill="none" stroke="${c}" stroke-width="3.5"/>`,
  // Trombone: bell left-up, long slide.
  trombone: (c) => `
    <path d="M44 18 L62 8 L62 34 L44 26 Z" fill="${c}"/>
    <rect x="12" y="19" width="34" height="5" rx="2.5" fill="${c}"/>
    <rect x="4" y="35" width="40" height="5" rx="2.5" fill="${c}"/>
    <path d="M14 21.5 Q4 21.5 4 30 Q4 37.5 8 37.5" fill="none" stroke="${c}" stroke-width="5"/>
    <rect x="22" y="22" width="3" height="16" ${D}/><rect x="36" y="22" width="3" height="16" fill="${c}"/>`,
  // Violin with its bow.
  violin: (c) => `<g transform="rotate(35 32 32)">
    <path d="M32 24 C25 24 24 29 27 33 C21 35 21 44 26 46 C22 50 24 60 32 60 C40 60 42 50 38 46 C43 44 43 35 37 33 C40 29 39 24 32 24 Z" fill="${c}"/>
    <rect x="30.5" y="5" width="3" height="21" fill="${c}"/>
    <path d="M30 1 q2 -1 4 0 l0 5 h-4 z" fill="${c}"/>
    <path d="M27 37 q-1.5 3.5 0 7 M37 37 q1.5 3.5 0 7" stroke="#000" stroke-opacity="0.55" stroke-width="1.5" fill="none"/>
    <rect x="28" y="50" width="8" height="2" rx="1" ${D}/></g>
    <rect x="8" y="30" width="54" height="2" rx="1" transform="rotate(-50 35 31)" fill="${c}"/>`,
  // Mic on a boom stand.
  mic: (c) => `
    <rect x="30" y="20" width="3" height="36" fill="${c}"/>
    <path d="M18 62 L31.5 52 L45 62" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M31.5 22 L10 12" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <rect x="2" y="5" width="14" height="7" rx="3.5" transform="rotate(25 9 8.5)" fill="${c}"/>
    <circle cx="31.5" cy="21" r="2.6" fill="${c}"/>`,
  // Headphones with a boom mic.
  headset: (c) => `
    <path d="M12 36 V30 Q12 9 32 9 Q52 9 52 30 V36" fill="none" stroke="${c}" stroke-width="5"/>
    <rect x="6" y="30" width="12" height="19" rx="5" fill="${c}"/>
    <rect x="46" y="30" width="12" height="19" rx="5" fill="${c}"/>
    <path d="M12 47 Q14 58 28 57" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <rect x="27" y="53" width="9" height="7" rx="3.5" fill="${c}"/>`,
  // Laptop, open.
  laptop: (c) => `
    <rect x="10" y="10" width="44" height="31" rx="3" fill="${c}"/>
    <rect x="14" y="14" width="36" height="23" rx="1" fill="#000" fill-opacity="0.6"/>
    <path d="M3 44 H61 L57 52 H7 Z" fill="${c}"/>
    <rect x="26" y="46" width="12" height="2.5" rx="1" ${D}/>`,
  // DI box: an XLR out and a 1/4" in.
  di: (c) => `
    <rect x="8" y="14" width="48" height="36" rx="4" fill="${c}"/>
    <circle cx="22" cy="34" r="8" ${K(0.6)}/>
    <circle cx="19" cy="32" r="1.5" fill="${c}"/><circle cx="25" cy="32" r="1.5" fill="${c}"/><circle cx="22" cy="37.5" r="1.5" fill="${c}"/>
    <circle cx="43" cy="34" r="6" ${K(0.6)}/><circle cx="43" cy="34" r="2" fill="${c}"/>
    <rect x="16" y="19" width="10" height="4" rx="2" ${D}/><rect x="38" y="19" width="10" height="4" rx="2" ${D}/>`,
  // Guitar amp: handle, control strip, grille.
  amp: (c) => `
    <rect x="22" y="3" width="20" height="5" rx="2.5" fill="${c}"/>
    <rect x="5" y="8" width="54" height="52" rx="4" fill="${c}"/>
    ${[13, 21, 29, 37, 45].map((x) => `<circle cx="${x}" cy="15" r="2.4" ${D}/>`).join("")}
    <rect x="9" y="22" width="46" height="34" rx="2" fill="#000" fill-opacity="0.6"/>
    <circle cx="32" cy="39" r="12" fill="${c}" fill-opacity="0.3"/>`,
  // PA speaker: horn and woofer.
  speaker: (c) => `
    <path d="M12 4 H52 L50 60 H14 Z" fill="${c}"/>
    <path d="M22 10 H42 L38 22 H26 Z" fill="#000" fill-opacity="0.6"/>
    <circle cx="32" cy="41" r="13" fill="#000" fill-opacity="0.6"/>
    <circle cx="32" cy="41" r="5" fill="${c}"/>`,
  // Floor wedge from the side, facing up at the player.
  wedge: (c) => `
    <path d="M4 52 L12 22 L60 38 L60 52 Z" fill="${c}"/>
    <path d="M15 27 L56 41 L56 48 L10 48 Z" fill="#000" fill-opacity="0.55"/>
    <circle cx="30" cy="40" r="5" fill="${c}" fill-opacity="0.45"/>
    <rect x="8" y="52" width="6" height="4" fill="${c}"/><rect x="52" y="52" width="6" height="4" fill="${c}"/>`,
  // Harmonica: covers and the row of holes.
  harmonica: (c) => `
    <rect x="3" y="22" width="58" height="20" rx="3" fill="${c}"/>
    <rect x="3" y="22" width="58" height="5" rx="2" ${K(0.3)}/><rect x="3" y="37" width="58" height="5" rx="2" ${K(0.3)}/>
    ${[7, 12.5, 18, 23.5, 29, 34.5, 40, 45.5, 51, 56.5].map((x) => `<rect x="${x - 1.6}" y="29" width="3.2" height="6" rx="1" fill="#000" fill-opacity="0.7"/>`).join("")}`,
  // Accordion: ends, bellows, keys.
  accordion: (c) => `
    <rect x="3" y="10" width="13" height="44" rx="2" fill="${c}"/>
    <path d="M16 12 L22 14 L22 50 L16 52 Z M24 12 L30 14 L30 50 L24 52 Z M32 12 L38 14 L38 50 L32 52 Z" fill="${c}"/>
    <rect x="40" y="10" width="21" height="44" rx="2" fill="${c}"/>
    ${[15, 22, 29, 36, 43].map((y) => `<rect x="50" y="${y}" width="9" height="5" rx="1" fill="#fff" fill-opacity="0.5"/>`).join("")}
    ${[17, 24, 31, 38, 45].map((y) => `<circle cx="9.5" cy="${y}" r="1.8" ${D}/>`).join("")}`,
};

// Jay's picks (job 277): these replace the redrawn ones above. Horns on the
// stage is a trumpet again; kick ... wedge stay only for instruments already
// made with them.
Object.assign(SHAPES, {
  // Drums: the kit as before (job 249).
  drums: (c) => `
    <circle cx="32" cy="42" r="15" fill="${c}"/>
    <circle cx="32" cy="42" r="10" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="2"/>
    <ellipse cx="19" cy="22" rx="8" ry="5.5" fill="${c}"/>
    <ellipse cx="45" cy="22" rx="8" ry="5.5" fill="${c}"/>
    <ellipse cx="9" cy="11" rx="8" ry="2.2" fill="${c}"/>
    <ellipse cx="55" cy="11" rx="8" ry="2.2" fill="${c}"/>
    <rect x="8" y="12" width="2" height="16" fill="${c}"/>
    <rect x="54" y="12" width="2" height="16" fill="${c}"/>`,
  // Vocal mic: a handheld dynamic - round mesh ball, band, long tapered handle.
  vocals: (c) => `
    <circle cx="32" cy="14" r="11.5" fill="${c}"/>
    <g stroke="#000" stroke-opacity="0.38" stroke-width="1.3">
      <path d="M22 9 h20 M21 14 h22 M22 19 h20"/>
      <path d="M27 3.5 v21 M32 2.5 v23 M37 3.5 v21"/>
    </g>
    <rect x="22.5" y="24" width="19" height="5" rx="2" fill="${c}"/>
    <rect x="22.5" y="26" width="19" height="1.4" ${D}/>
    <path d="M24 29 h16 l-3 31 q-5 3 -10 0 z" fill="${c}"/>
    <rect x="28" y="56" width="8" height="2" rx="1" ${D}/>`,
  // Studio mic: a large-diaphragm condenser in its shock mount, on a stand.
  mic: (c) => `
    <rect x="23" y="3" width="18" height="36" rx="9" fill="${c}"/>
    ${[8, 12, 16, 20].map((y) => `<rect x="25" y="${y}" width="14" height="1.6" ${D}/>`).join("")}
    <rect x="23" y="25" width="18" height="2" ${K(0.35)}/>
    <path d="M17 18 Q17 34 32 34 Q47 34 47 18" fill="none" stroke="${c}" stroke-width="3"/>
    <rect x="30.5" y="34" width="3" height="21" fill="${c}"/>
    <ellipse cx="32" cy="58" rx="13" ry="3.5" fill="${c}"/>`,
  // Perc: bongos - two small drums joined by a bracket.
  percussion: (c) => `
    <path d="M5 22 L27 22 L24 48 L8 48 Z" fill="${c}"/>
    <path d="M35 18 L61 18 L57 50 L39 50 Z" fill="${c}"/>
    <ellipse cx="16" cy="22" rx="11" ry="3.5" fill="#fff" fill-opacity="0.45"/>
    <ellipse cx="48" cy="18" rx="13" ry="4" fill="#fff" fill-opacity="0.45"/>
    <rect x="25" y="30" width="12" height="5" rx="1.5" fill="${c}"/>
    <rect x="6" y="28" width="20" height="2.2" ${D}/><rect x="36" y="25" width="24" height="2.2" ${D}/>`,
  // Guitar: a slimmer Strat-style body.
  guitar: (c) => `<g transform="rotate(40 32 32)">
    <rect x="30" y="1" width="4" height="31" rx="1" fill="${c}"/>
    <path d="M29 0 h6 l1 6 h-8 z" fill="${c}"/>
    <path d="M32 28 C28 28 28 24 25 25 C21 26 22 32 24 35 C21 40 21 49 24 55 C27 61 37 61 40 55 C43 49 43 40 40 35 C42 32 43 26 39 25 C36 24 36 28 32 28 Z" fill="${c}"/>
    <rect x="27.5" y="39" width="9" height="2" rx="1" ${D}/><rect x="27.5" y="44" width="9" height="2" rx="1" ${D}/>
    <rect x="28" y="52" width="8" height="2.4" rx="1" ${D}/></g>`,
  // Acoustic: wider dreadnought body - narrow upper bout, wide lower bout.
  acoustic: (c) => `<g transform="rotate(40 32 32)">
    <rect x="30" y="1" width="4" height="25" rx="1" fill="${c}"/>
    <path d="M28.5 0 h7 l1 6 h-9 z" fill="${c}"/>
    <path d="M32 22 C21 22 20 31 24 35 C14 39 13 62 32 62 C51 62 50 39 40 35 C44 31 43 22 32 22 Z" fill="${c}"/>
    <circle cx="32" cy="38" r="5" fill="#000" fill-opacity="0.65"/>
    <rect x="26" y="51" width="12" height="2.8" rx="1" ${D}/></g>`,
  // Electric: a pointed, sharp-horned body.
  electric: (c) => `<g transform="rotate(40 32 32)">
    <rect x="30" y="1" width="4" height="30" rx="1" fill="${c}"/>
    <path d="M29 0 L36 0 L35 7 L29 6 Z" fill="${c}"/>
    <path d="M32 29 L25 18 L23 31 L18 40 L22 52 L19 62 L32 56 L45 62 L42 52 L46 40 L41 31 L39 18 Z" fill="${c}"/>
    <rect x="27.5" y="38" width="9" height="3.2" rx="1" ${D}/><rect x="27.5" y="45" width="9" height="3.2" rx="1" ${D}/></g>`,
  // Bass: smaller body, long neck, a bass headstock with 4 tuners on one side.
  bass: (c) => `<g transform="rotate(40 32 32)">
    <rect x="30.2" y="8" width="3.6" height="34" rx="1" fill="${c}"/>
    <path d="M30 9 L30 -2 Q30 -5 33 -5 L36 -5 L36 1 Q34 3 34 9 Z" fill="${c}"/>
    ${[-3, 0.5, 4].map((y) => `<circle cx="38" cy="${y}" r="1.5" fill="${c}"/>`).join("")}<circle cx="38" cy="7.5" r="1.5" fill="${c}"/>
    <path d="M32 40 C28.5 40 28.5 36.5 26 37.5 C23 38.5 24 43 25.5 45 C23 48 23.5 54 26 57 C28.5 60 35.5 60 38 57 C40.5 54 41 48 38.5 45 C40 43 41 38.5 38 37.5 C35.5 36.5 35.5 40 32 40 Z" fill="${c}"/>
    <rect x="28" y="47" width="4" height="2.4" rx="1" ${D}/><rect x="32" y="49.5" width="4" height="2.4" rx="1" ${D}/>
    <rect x="28.5" y="54" width="7" height="2" rx="1" ${D}/></g>`,
  // Keys: a long, low keyboard.
  keys: (c) => `
    <rect x="1" y="23" width="62" height="19" rx="2.5" fill="${c}"/>
    <rect x="1" y="23" width="62" height="4.5" rx="2" ${K(0.3)}/>
    ${[6, 10.5, 15, 19.5, 24, 28.5, 33, 37.5, 42, 46.5, 51, 55.5, 60].map((x) => `<rect x="${x}" y="27.5" width="0.9" height="14.5" ${D}/>`).join("")}
    ${[4.6, 9.1, 18.1, 22.6, 27.1, 36.1, 40.6, 49.6, 54.1, 58.6].map((x) => `<rect x="${x}" y="27.5" width="2.8" height="8.5" rx="0.5" fill="#000" fill-opacity="0.78"/>`).join("")}`,
  // Sax: mouthpiece and crook, straight body, U-bend, flared bell up.
  sax: (c) => `
    <path d="M25 14 L33 14 L33 46 Q33 52 38.5 52 Q44 52 44 46 L44 34 L41 27 L57 23 L53 33 L53 46 Q53 61 38.5 61 Q25 61 25 46 Z" fill="${c}"/>
    <ellipse cx="49" cy="25" rx="8.5" ry="3" transform="rotate(-14 49 25)" fill="${c}"/>
    <ellipse cx="49" cy="25" rx="6" ry="1.7" transform="rotate(-14 49 25)" fill="#000" fill-opacity="0.6"/>
    <path d="M29 15 Q29 6 20 6" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
    <path d="M21 3.5 L11 6.5 L12 9.5 L21 8.5 Z" fill="${c}"/>
    ${[20, 26, 32, 38].map((y) => `<circle cx="29" cy="${y}" r="2.1" fill="#000" fill-opacity="0.55"/>`).join("")}
    ${[40, 46].map((y) => `<circle cx="48.5" cy="${y}" r="2.1" fill="#000" fill-opacity="0.55"/>`).join("")}`,
  // Upright bass: tall body, sloped shoulders, long neck, scroll, endpin.
  upright: (c) => `
    <path d="M32 22 C27 22 25 25 24 28 C21 29 19 32 20 36 C21 38 22 39 22 40 C18 42 16 47 17 52 C18 59 25 62 32 62 C39 62 46 59 47 52 C48 47 46 42 42 40 C42 39 43 38 44 36 C45 32 43 29 40 28 C39 25 37 22 32 22 Z" fill="${c}"/>
    <rect x="30.4" y="3" width="3.2" height="21" fill="${c}"/>
    <path d="M30 0.5 Q33 -0.5 34.5 1.5 Q35.5 4 33.5 5 L30 5 Z" fill="${c}"/>
    <path d="M26 41 q-2 4 0 9 M38 41 q2 4 0 9" stroke="#000" stroke-opacity="0.6" stroke-width="1.6" fill="none"/>
    <rect x="29.5" y="44" width="5" height="2" rx="1" ${D}/>
    <rect x="31" y="61" width="2" height="3" fill="${c}"/>`,
  // Strings: a violin - narrow upper bout, waist, wider lower bout, scroll - and its bow.
  strings: (c) => `
    <rect x="9" y="31" width="52" height="2" rx="1" transform="rotate(-58 35 32)" fill="${c}"/>
    <g transform="rotate(-25 30 34)">
    <path d="M30 18 C24 18 21 20 21 25 C21 29 24 30 25 32 C25 34 24 35 24 36 C20 37 19 41 19 45 C19 51 24 55 30 55 C36 55 41 51 41 45 C41 41 40 37 36 36 C36 35 35 34 35 32 C36 30 39 29 39 25 C39 20 36 18 30 18 Z" fill="${c}"/>
    <rect x="28.6" y="5" width="2.8" height="15" fill="${c}"/>
    <circle cx="30" cy="4" r="2.6" fill="${c}"/>
    <path d="M26 38 q-1.5 3.5 0 7 M34 38 q1.5 3.5 0 7" stroke="#000" stroke-opacity="0.6" stroke-width="1.5" fill="none"/>
    <path d="M28.5 47 L31.5 47 L31 54 L29 54 Z" ${D}/></g>`,
});
SHAPES.horns = SHAPES.trumpet;

// Every icon you can give your own instrument (job 274), with names.
export const ICON_CHOICES = [
  ["vocals", "Vocal mic"], ["mic", "Studio mic"],
  ["drums", "Drums"], ["percussion", "Perc"],
  ["guitar", "Guitar"], ["acoustic", "Acoustic"], ["electric", "Electric"], ["bass", "Bass"], ["upright", "Upright bass"],
  ["keys", "Keys"], ["piano", "Piano"], ["organ", "Organ"], ["synth", "Synth"],
  ["sax", "Sax"], ["trumpet", "Trumpet"], ["strings", "Strings"], ["harmonica", "Harmonica"],
  ["dj", "DJ"], ["laptop", "Laptop"], ["other", "Other"],
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
