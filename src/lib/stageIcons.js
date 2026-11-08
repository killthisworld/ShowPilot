// Instrument-shaped icons for stage plots (job 249): a filled silhouette per
// position, in that position's color, with dark detail. Used as SVG in the
// builder and turned into PNGs for the PDF. viewBox 0 0 64 64.
const D = 'fill="#000" fill-opacity="0.55"';

// Redrawn (jobs 276 / 277, Jay's notes): a Shure 58-style vocal mic, a studio
// mic, the drum kit, bongos for Perc, a Strat-style guitar, a fuller acoustic, a
// triangle electric, a long-neck bass, a long keyboard, sax, trumpet, an upright
// bass drawn like a cello, a violin for Strings. Drawn for ShowPilot.
const K = (op = 0.55) => `fill="#000" fill-opacity="${op}"`;
const trumpet = (c) => `
    <path d="M42 24 L62 13 L62 41 L42 30 Z" fill="${c}"/>
    <rect x="6" y="24" width="38" height="6" rx="3" fill="${c}"/>
    <rect x="1" y="24.5" width="7" height="5" rx="2" fill="${c}"/>
    <rect x="17" y="14" width="4.4" height="12" rx="1" fill="${c}"/><rect x="24" y="14" width="4.4" height="12" rx="1" fill="${c}"/><rect x="31" y="14" width="4.4" height="12" rx="1" fill="${c}"/>
    <rect x="16" y="11" width="6.4" height="3.5" rx="1.7" fill="${c}"/><rect x="23" y="11" width="6.4" height="3.5" rx="1.7" fill="${c}"/><rect x="30" y="11" width="6.4" height="3.5" rx="1.7" fill="${c}"/>
    <path d="M14 30 v6 q0 6 6 6 h16 q6 0 6 -6 v-6" fill="none" stroke="${c}" stroke-width="3.5"/>`;
// Percs: four small bongos in a line on a rack bar - two sets, each joined by
// its center block (job 277).
const bongos = (c) => `
    <path d="M3.0 22 H15.0 L13.4 37 H4.6 Z" fill="${c}"/>
    <ellipse cx="9" cy="22" rx="6.0" ry="2.1" fill="${c}"/>
    <ellipse cx="9" cy="22" rx="4.7" ry="1.2" fill="#fff" fill-opacity="0.5"/>
    <rect x="3.6" y="24.8" width="10.8" height="1.2" ${D}/>
    <path d="M16.5 24 H26.5 L24.9 37 H18.1 Z" fill="${c}"/>
    <ellipse cx="21.5" cy="24" rx="5.0" ry="2.1" fill="${c}"/>
    <ellipse cx="21.5" cy="24" rx="3.7" ry="1.2" fill="#fff" fill-opacity="0.5"/>
    <rect x="17.1" y="26.8" width="8.8" height="1.2" ${D}/>
    <path d="M36.5 22 H48.5 L46.9 37 H38.1 Z" fill="${c}"/>
    <ellipse cx="42.5" cy="22" rx="6.0" ry="2.1" fill="${c}"/>
    <ellipse cx="42.5" cy="22" rx="4.7" ry="1.2" fill="#fff" fill-opacity="0.5"/>
    <rect x="37.1" y="24.8" width="10.8" height="1.2" ${D}/>
    <path d="M50.0 24 H60.0 L58.4 37 H51.6 Z" fill="${c}"/>
    <ellipse cx="55" cy="24" rx="5.0" ry="2.1" fill="${c}"/>
    <ellipse cx="55" cy="24" rx="3.7" ry="1.2" fill="#fff" fill-opacity="0.5"/>
    <rect x="50.6" y="26.8" width="8.8" height="1.2" ${D}/>
    <rect x="14.6" y="28" width="2.4" height="4" rx="0.8" fill="${c}"/><rect x="48.1" y="28" width="2.4" height="4" rx="0.8" fill="${c}"/>
    ${[9, 21.5, 42.5, 55].map((x) => `<rect x="${x - 0.9}" y="36" width="1.8" height="4" fill="${c}"/>`).join("")}
    <rect x="3" y="39" width="58" height="3" rx="1.5" fill="${c}"/>`;
const violin = (c) => `<g transform="rotate(-38 32 32)">
    <path d="M32 26 C27.5 26 25.8 28.5 26.5 31.5 C27 33.5 27.6 34.3 27 35.3 C23.5 36 22.6 39.6 24.6 41.6 C21.6 43.8 21.4 51.6 25.4 54.6 C27.8 56.4 36.2 56.4 38.6 54.6 C42.6 51.6 42.4 43.8 39.4 41.6 C41.4 39.6 40.5 36 37 35.3 C36.4 34.3 37 33.5 37.5 31.5 C38.2 28.5 36.5 26 32 26 Z" fill="${c}"/>
    <rect x="30.7" y="11" width="2.6" height="17" fill="${c}"/>
    <path d="M30.2 11 v-5 q1.8 -1.6 3.6 0 v5 z" fill="${c}"/>
    <path d="M33.8 5.5 q2.8 -0.2 2.6 -2.6 q-0.3 -2.2 -2.6 -1.8 q-1.8 0.4 -1.4 2.2" fill="none" stroke="${c}" stroke-width="2"/>
    <rect x="28.8" y="7" width="1.6" height="2.4" rx="0.6" fill="${c}"/><rect x="33.6" y="8.2" width="1.6" height="2.4" rx="0.6" fill="${c}"/>
    <rect x="31.1" y="13" width="1.8" height="27" rx="0.9" ${K(0.5)}/>
    <path d="M28 38.5 q-1.3 3 0 6 M36 38.5 q1.3 3 0 6" stroke="#000" stroke-opacity="0.6" stroke-width="1.3" fill="none"/>
    <rect x="29.2" y="44.5" width="5.6" height="1.4" rx="0.7" ${K(0.5)}/>
    <path d="M30 47.5 h4 l-0.7 6 h-2.6 z" ${K(0.5)}/>
    <ellipse cx="27" cy="53" rx="3.2" ry="1.6" ${K(0.35)}/></g>
    <rect x="31" y="1" width="2" height="62" rx="1" transform="rotate(48 32 32)" fill="${c}"/>
    <rect x="30.2" y="57" width="3.6" height="5" rx="1" transform="rotate(48 32 32)" fill="${c}"/>`;
const SHAPES = {
  // Electric guitar, slimmer Strat-style body, neck up-right.
  // Electric guitar, Strat-style: offset double cutaway (longer upper horn), pickguard, 3 pickups.
  guitar: (c) => `<g transform="translate(32 32) scale(0.9) translate(-32 -32) rotate(45 32 32)">
    <rect x="30" y="0" width="4" height="33" rx="1" fill="${c}"/>
    <path d="M29 -1 h6 l0.8 6 h-7.6 z" fill="${c}"/>
    <path d="M32 31 C29 31 27.5 28 26.5 24 C25.8 21 22.5 20.5 21 23 C19.5 26 21 31 22.5 35 C17.5 40 16.5 50 20 56 C23.5 61.5 40.5 61.5 44 56 C47.5 50 46.5 41 42.5 37 C43.5 34 45.5 30.5 44.5 28 C43.5 25.5 40.5 25.5 39.5 27.5 C38.5 29.5 36 31 32 31 Z" fill="${c}"/>
    ${[38.5, 42.5, 46.5].map((y, i) => `<rect x="${27 + i * 0.6}" y="${y}" width="9" height="1.8" rx="0.9" transform="rotate(${i === 2 ? -10 : 0} 32 ${y})" ${D}/>`).join("")}
    <rect x="27.5" y="52.5" width="9" height="2.4" rx="1" ${D}/></g>`,
  // Acoustic: small upper bout, waist, big lower bout, soundhole.
  acoustic: (c) => `<g transform="translate(32 32) scale(0.9) translate(-32 -32) rotate(45 32 32)">
    <rect x="30" y="0" width="4" height="26" rx="1" fill="${c}"/>
    <path d="M29 -1 h6 l0.8 6 h-7.6 z" fill="${c}"/>
    <path d="M32 22 C24 22 22 26 22.5 30.5 C23 34 25.5 35.5 25 37.5 C18 40 15.5 46 16.5 52 C18 59 25 62.5 32 62.5 C39 62.5 46 59 47.5 52 C48.5 46 46 40 39 37.5 C38.5 35.5 41 34 41.5 30.5 C42 26 40 22 32 22 Z" fill="${c}"/>
    <circle cx="32" cy="35" r="4.4" fill="#000" fill-opacity="0.65"/>
    <rect x="27.5" y="52" width="9" height="2.6" rx="1" ${D}/></g>`,
  // Electric with sharp, pointed horns.
  // Electric: a triangle body, its two far points facing away from the neck.
  electric: (c) => `<g transform="translate(32 32) scale(0.9) translate(-32 -32) rotate(45 32 32)">
    <rect x="30" y="0" width="4" height="34" rx="1" fill="${c}"/>
    <path d="M29.5 -1 l6 1 l-1.5 6 h-5 z" fill="${c}"/>
    <path d="M32 27 L50 61 L32 54 L14 61 Z" fill="${c}"/>
    <rect x="27.5" y="36" width="9" height="3.2" rx="1.2" ${D}/><rect x="27" y="43" width="10" height="3.2" rx="1.2" ${D}/>
    <circle cx="38" cy="52" r="1.6" ${D}/><circle cx="26" cy="52" r="1.6" ${D}/></g>`,
  // Bass: long neck, a full P-bass body, a Fender-style headstock, 4 tuners with their keys along the top.
  bass: (c) => `<g transform="translate(33 34) scale(0.8) translate(-32 -32) rotate(45 32 32)">
    <rect x="30.2" y="-4" width="3.6" height="38" rx="1" fill="${c}"/>
    <path d="M30.2 -3 L30.2 -17 Q30.4 -20.5 33.2 -20.5 Q36.2 -20.5 36 -16.5 Q35.6 -12 34.2 -9.5 Q33.8 -7 33.8 -3 Z" fill="${c}"/>
    ${[-6.5, -10, -13.5, -17].map((y) => `<circle cx="32" cy="${y}" r="1" ${D}/><rect x="27" y="${y - 0.6}" width="3.4" height="1.2" fill="${c}"/><ellipse cx="25.8" cy="${y}" rx="1.5" ry="1.6" fill="${c}"/>`).join("")}
    <path d="M32 31 C28.5 31 27.5 26.5 24.5 27.5 C21 28.5 21.5 33.5 23.5 36.5 C18.5 41 17.5 51 21 57 C24.5 63 39.5 63 43 57 C46.5 51 45.5 41 40.5 36.5 C42.5 33.5 43 28.5 39.5 27.5 C36.5 26.5 35.5 31 32 31 Z" fill="${c}"/>
    <rect x="26.5" y="41" width="5" height="2.8" rx="1" ${D}/><rect x="32.5" y="44" width="5" height="2.8" rx="1" ${D}/>
    <rect x="28" y="54" width="8" height="2.4" rx="1" ${D}/></g>`,
  // Drum kit from the front (as before).
  drums: (c) => `
    <circle cx="32" cy="42" r="15" fill="${c}"/>
    <circle cx="32" cy="42" r="10" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="2"/>
    <ellipse cx="19" cy="22" rx="8" ry="5.5" fill="${c}"/>
    <ellipse cx="45" cy="22" rx="8" ry="5.5" fill="${c}"/>
    <ellipse cx="9" cy="11" rx="8" ry="2.2" fill="${c}"/>
    <ellipse cx="55" cy="11" rx="8" ry="2.2" fill="${c}"/>
    <rect x="8" y="12" width="2" height="16" fill="${c}"/>
    <rect x="54" y="12" width="2" height="16" fill="${c}"/>`,
  // Perc: a pair of bongos.
  percussion: bongos,
  conga: bongos,
  // Keyboard: long and low, like the real thing.
  // Keyboard: long, a little taller.
  keys: (c) => `
    <rect x="1" y="19" width="62" height="26" rx="2.5" fill="${c}"/>
    <rect x="1" y="19" width="62" height="6" rx="2.5" ${K(0.3)}/>
    ${[5.5, 10, 14.5, 19, 23.5, 28, 32.5, 37, 41.5, 46, 50.5, 55, 59.5].map((x) => `<rect x="${x}" y="25" width="0.9" height="20" ${D}/>`).join("")}
    ${[3.8, 8.3, 17.3, 21.8, 26.3, 35.3, 39.8, 48.8, 53.3, 57.8].map((x) => `<rect x="${x}" y="25" width="2.8" height="11.5" rx="0.5" fill="#000" fill-opacity="0.78"/>`).join("")}`,
  // Shure SM58-style vocal mic (job 277): the 58's mesh grille - a dome that
  // comes down to the band - then the band and the tapered handle, about
  // 20% head to 80% body.
  vocals: (c) => `
    <path d="M21.3 18.5 C20.3 16 20.1 12.4 20.7 10 C21.6 6.9 25.8 5.6 32 5.6 C38.2 5.6 42.4 6.9 43.3 10 C43.9 12.4 43.7 16 42.7 18.5 Z" fill="${c}"/>
    ${[15, 17.5, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45].map((x) => `<path d="M${x} 6.5 L${x + 11} 17.5 M${x + 11} 6.5 L${x} 17.5" stroke="#000" stroke-opacity="0.22" stroke-width="0.9"/>`).join("")}
    <path d="M21.3 18.5 C20.3 16 20.1 12.4 20.7 10 C21.6 6.9 25.8 5.6 32 5.6 C38.2 5.6 42.4 6.9 43.3 10 C43.9 12.4 43.7 16 42.7 18.5 Z" fill="none" stroke="${c}" stroke-width="1.8"/>
    <rect x="21.5" y="18" width="21" height="4" rx="1.5" fill="${c}"/>
    <rect x="21.5" y="19.3" width="21" height="1.3" ${K(0.45)}/>
    <path d="M25 22 H39 L35.6 59.5 Q32 62.5 28.4 59.5 Z" fill="${c}"/>
    <rect x="29" y="28" width="6" height="2.6" rx="1" ${K(0.45)}/>`,
  // Studio mic: large-diaphragm condenser in its shock mount, on a stand.
  mic: (c) => `
    <rect x="23" y="3" width="18" height="38" rx="9" fill="${c}"/>
    ${[9, 13, 17, 21].map((y) => `<rect x="24" y="${y}" width="16" height="1.4" ${K(0.4)}/>`).join("")}
    <rect x="23" y="25" width="18" height="2.4" ${K(0.45)}/>
    <circle cx="32" cy="33" r="1.8" ${K(0.5)}/>
    <path d="M17 22 V30 Q17 45 32 45 Q47 45 47 30 V22" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <rect x="30.5" y="45" width="3" height="12" fill="${c}"/>
    <path d="M20 63 L32 55 L44 63" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
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
  // Alto sax (job 277): mouthpiece and neck at the top, the body widening down
  // to the bow, the bell rising on the right with its flared rim, key cups.
  sax: (c) => `
    <path d="M20.5 9 L26.5 8.5 L32.5 44 Q33.5 50.5 37.5 50 Q41 49.5 42 44.5 L44.5 33 L50.5 34.5 L47.5 48 Q44.5 61 34 61 Q24.5 61 23.5 50 Z" fill="${c}"/>
    <path d="M43 34.5 Q41 28 44 23 L60 27.5 Q55 31 52 37.5 Z" fill="${c}"/>
    <ellipse cx="52" cy="25.2" rx="8.6" ry="2.6" transform="rotate(15 52 25.2)" fill="${c}"/>
    <ellipse cx="52" cy="25.2" rx="6.6" ry="1.5" transform="rotate(15 52 25.2)" fill="#000" fill-opacity="0.55"/>
    <path d="M23.5 10 Q22 3.5 15 4.5 L9 6" fill="none" stroke="${c}" stroke-width="3.6" stroke-linecap="round"/>
    <rect x="3" y="4.2" width="8" height="3.8" rx="1.9" transform="rotate(-12 7 6)" fill="${c}"/>
    ${[[24.6, 17, 1.7], [25.9, 23.5, 1.9], [27.3, 30, 2.1], [28.7, 36.5, 2.2], [30.2, 43, 2.3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" ${D}/>`).join("")}
    <circle cx="45.5" cy="41" r="1.8" ${D}/><circle cx="47" cy="35.5" r="1.6" ${D}/>
    <path d="M19.5 14 Q17.5 24 21 33" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
  // Trumpet from the side.
  trumpet,
  horns: trumpet,
  // Upright bass: sloped shoulders, f-holes, long neck and scroll, endpin.
  // Upright bass, drawn like a big cello: round shoulders, C-bouts, f-holes, scroll, endpin.
  upright: (c) => `
    <path d="M32 17 C24 17 22.5 22 24 26.5 C25 29 25.5 30 24.5 31.5 C18.5 33 17.5 39 21 42 C16.5 45 16 56 23 59.5 C27 61.5 37 61.5 41 59.5 C48 56 47.5 45 43 42 C46.5 39 45.5 33 39.5 31.5 C38.5 30 39 29 40 26.5 C41.5 22 40 17 32 17 Z" fill="${c}"/>
    <rect x="30.4" y="2" width="3.2" height="17" fill="${c}"/>
    <circle cx="32" cy="3" r="2.8" fill="${c}"/><rect x="29" y="5" width="6" height="5" rx="1.5" fill="${c}"/>
    <rect x="31" y="6" width="2" height="32" rx="1" ${K(0.45)}/>
    <path d="M25.5 37 q-1.8 4.5 0 9 M38.5 37 q1.8 4.5 0 9" stroke="#000" stroke-opacity="0.6" stroke-width="1.6" fill="none"/>
    <rect x="29.5" y="47" width="5" height="8" rx="1.5" ${K(0.45)}/>
    <rect x="31" y="60" width="2" height="4" fill="${c}"/>`,
  // Strings: a violin with its bow.
  strings: violin,
  violin,
  // Icons that were taken off the list still draw something close (job 277).
  kick: (c) => SHAPES.drums(c), snare: (c) => SHAPES.drums(c), tom: (c) => SHAPES.drums(c), hihat: (c) => SHAPES.drums(c), cymbal: (c) => SHAPES.drums(c),
  headset: (c) => SHAPES.mic(c), trombone: trumpet, cello: (c) => SHAPES.upright(c),
  // PA speaker: horn and woofer (back on the list; job 277).
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
  // DJ: turntable from above.
  dj: (c) => `
    <rect x="3" y="9" width="58" height="46" rx="5" fill="${c}"/>
    <circle cx="27" cy="32" r="17" fill="#000" fill-opacity="0.6"/>
    <circle cx="27" cy="32" r="11" fill="none" stroke="${c}" stroke-opacity="0.35" stroke-width="1"/>
    <circle cx="27" cy="32" r="4.5" fill="${c}"/>
    <circle cx="52" cy="16" r="3.5" fill="#000" fill-opacity="0.6"/>
    <path d="M52 16 L50 38 L41 44" fill="none" stroke="#000" stroke-opacity="0.7" stroke-width="3" stroke-linecap="round"/>
    <rect x="47" y="46" width="9" height="4" rx="1" fill="#000" fill-opacity="0.5"/>`,
  // Laptop, open.
  laptop: (c) => `
    <rect x="10" y="10" width="44" height="31" rx="3" fill="${c}"/>
    <rect x="14" y="14" width="36" height="23" rx="1" fill="#000" fill-opacity="0.6"/>
    <path d="M3 44 H61 L57 52 H7 Z" fill="${c}"/>
    <rect x="26" y="46" width="12" height="2.5" rx="1" ${D}/>`,
  // Other: a music note.
  other: (c) => `
    <ellipse cx="20" cy="50" rx="10" ry="8" transform="rotate(-20 20 50)" fill="${c}"/>
    <rect x="26" y="8" width="4.5" height="43" fill="${c}"/>
    <path d="M30.5 8 Q46 12 49 28 Q42 21 30.5 21 Z" fill="${c}"/>`,
};

// Every icon you can give your own instrument (job 274), with names.
export const ICON_CHOICES = [
  ["vocals", "Vocal mic"], ["mic", "Mic"], ["drums", "Drums"], ["percussion", "Percs"],
  ["guitar", "Guitar"], ["acoustic", "Acoustic"], ["electric", "Electric"], ["bass", "Bass"],
  ["keys", "Keys"], ["piano", "Piano"], ["organ", "Organ"], ["synth", "Synth"],
  ["sax", "Sax"], ["trumpet", "Trumpet"], ["upright", "Upright bass"], ["strings", "Strings"],
  ["harmonica", "Harmonica"], ["dj", "DJ"], ["laptop", "Laptop"], ["speaker", "Speaker"], ["wedge", "Wedge"], ["other", "Other"],
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
