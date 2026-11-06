// After-the-show film (job 239): every star in an event's sky pulls together,
// collapses, and becomes one burning sun; the event's picture rises in under
// it, then its name and date, then everything fades to black. Drawn on a
// 1080x1920 canvas so it can be recorded as a 9:16 phone video.
//
//   const film = createFilm(canvas, { stars, title, date, venue, image, show });
//   film.play(onEnd); film.stop(); film.still(12);
//
// stars:    [{ id, color, me }]   (color "#rrggbb")
// show:     { you, header, name, date } booleans (all on by default)
// date, venue: for the ShowPilot stamp slammed onto the card's corner (job 243)
// sun:      "#rrggbb" to recolor the sun (and its glow and blast); none = natural
// orientation: "portrait" (1080x1920, default) or "landscape" (1920x1080)
// image:    an <img> or <canvas> for the header card, or null for a stand-in
//
// Plain JS, no React, so the same file can run outside the app (previews).

export const FILM_W = 1080;
export const FILM_H = 1920;
export const FILM_SECONDS = 17.2;

const SUN_PX = 900;

const SUN_FS = `precision highp float;
uniform vec2 res; uniform float t; uniform float k; uniform float useTint; uniform float hueShift; uniform float satScale;
// A host-picked sun color (job 241/242): turn the natural sun's hue toward the
// picked one in YIQ space. Brightness and contrast stay exactly as they were,
// so the boiling cells, spots, limb darkening and flames read the same in any
// color; only the hue (and, for pale picks, the saturation) changes.
vec3 tinted(vec3 c){
  float Y=dot(c,vec3(.299,.587,.114));
  float I=dot(c,vec3(.596,-.274,-.322));
  float Q=dot(c,vec3(.211,-.523,.312));
  float cs=cos(hueShift), sn=sin(hueShift);
  float I2=(I*cs-Q*sn)*satScale, Q2=(I*sn+Q*cs)*satScale;
  vec3 o=vec3(Y+.956*I2+.621*Q2, Y-.272*I2-.647*Q2, Y-1.106*I2+1.703*Q2);
  // keep the white-hot core white-hot
  float hot=smoothstep(.85,1.2,Y);
  return max(mix(o,vec3(Y),hot*.35),0.);
}
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*res)/(.5*res.y);
  float R=.42; float r=length(uv);
  vec3 col=vec3(0.); float al=0.;
  if(r<R){
    float z=sqrt(R*R-r*r);
    vec3 n=normalize(vec3(uv,z));
    float a=t*.05; float ca=cos(a), sa=sin(a);
    vec3 p=vec3(ca*n.x+sa*n.z, n.y, -sa*n.x+ca*n.z);
    vec3 q=vec3(fbm(p*2.6+vec3(0.,0.,t*.12)), fbm(p*2.6+vec3(5.2,1.3,t*.12)), fbm(p*2.6+vec3(2.1,7.7,t*.1)));
    float g=fbm(p*5.+q*1.6+vec3(t*.06));
    float cells=snoise(p*34.+vec3(0.,t*.6,0.))*.5+.5;
    float cells2=snoise(p*70.-vec3(t*.9))*.5+.5;
    float h=.66+.42*g+.14*(cells-.5)+.07*(cells2-.5);
    float spot=smoothstep(.62,.8,fbm(p*1.6+vec3(31.,0.,t*.02)));
    h-=spot*.55;
    vec3 c0=vec3(.45,.06,.0), c1=vec3(.95,.32,.04), c2=vec3(1.,.66,.2), c3=vec3(1.,.95,.78);
    vec3 c=mix(c0,c1,smoothstep(.0,.45,h)); c=mix(c,c2,smoothstep(.4,.78,h)); c=mix(c,c3,smoothstep(.8,1.12,h));
    float limb=pow(clamp(n.z,0.,1.),.5);
    c*=mix(.42,1.25,limb);
    c+=vec3(1.,.9,.7)*pow(limb,6.)*.18;
    c+=vec3(1.,.55,.15)*pow(1.-limb,3.)*.35;
    col=c; al=1.;
  }
  float d=max(r-R,0.);
  float ang=atan(uv.y,uv.x);
  vec3 cp=vec3(cos(ang)*2.2, sin(ang)*2.2, d*7.-t*.45);
  float f=fbm(cp+vec3(t*.05,0.,0.));
  float flame=clamp(.55+f,0.,1.6)*exp(-d*11.)*smoothstep(-.005,.006,r-R+.004);
  float loops=0.;
  for(int i=0;i<4;i++){
    float fi=float(i);
    float a0=fi*1.7+.6+t*.012*(fi-1.5);
    vec2 base=vec2(cos(a0),sin(a0))*(R-.004);
    float lr=.045+.018*sin(fi*2.3+t*.15);
    vec2 cc=base*(1.+lr/R*.55);
    float ring=abs(length(uv-cc)-lr);
    float flick=.6+.4*snoise(vec3(uv*14.,t*.6+fi));
    loops+=exp(-ring*150.)*flick*step(R,r)*(1.-smoothstep(.0,.09,d));
  }
  float glow=exp(-d*3.2)*.55+exp(-d*14.)*.9;
  float edge=1.-smoothstep(.62,.98,r);
  vec3 cc2=(vec3(1.,.42,.06)*flame*1.7+vec3(1.,.62,.24)*loops*1.4+vec3(1.,.55,.18)*glow*.55)*edge;
  vec3 outC=col*al+cc2*(1.-al);
  float outA=max(al, clamp(max(max(cc2.r,cc2.g),cc2.b),0.,1.));
  if(useTint>.5) outC=tinted(outC);
  gl_FragColor=vec4(outC*k, outA*k);
}`;

function makeSun(tintHex) {
  const c = document.createElement("canvas"); c.width = SUN_PX; c.height = SUN_PX;
  const gl = c.getContext("webgl", { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const v = sh(gl.VERTEX_SHADER, "attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }");
  const f = sh(gl.FRAGMENT_SHADER, SUN_FS);
  if (!v || !f) return null;
  const pr = gl.createProgram(); gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uT = gl.getUniformLocation(pr, "t"), uK = gl.getUniformLocation(pr, "k");
  gl.uniform2f(gl.getUniformLocation(pr, "res"), SUN_PX, SUN_PX); gl.viewport(0, 0, SUN_PX, SUN_PX);
  const rgb = hexRgb(tintHex);
  // How far to turn the natural sun's hue (its mid-tone orange) to reach the
  // picked color, and how saturated to keep it (white / grey picks go pale).
  const yiq = ([r, g, b]) => [.596 * r - .274 * g - .322 * b, .211 * r - .523 * g + .312 * b];
  const [ri, rq] = yiq([1, .55, .15]);
  const [ti, tq] = rgb ? yiq(rgb.map((v) => v / 255)) : [ri, rq];
  const shift = Math.atan2(tq, ti) - Math.atan2(rq, ri);
  const sat = Math.min(1.25, Math.hypot(ti, tq) / Math.hypot(ri, rq));
  gl.uniform1f(gl.getUniformLocation(pr, "useTint"), rgb ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(pr, "hueShift"), shift);
  gl.uniform1f(gl.getUniformLocation(pr, "satScale"), sat);
  return {
    canvas: c,
    render(t, k) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(uT, t); gl.uniform1f(uK, k); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); },
  };
}

// A soft glowing star, drawn once per color and stamped with drawImage
// (much cheaper than a gradient per star per frame).
function starSprite(color) {
  const s = 128, c = document.createElement("canvas"); c.width = s; c.height = s;
  const g = c.getContext("2d"), m = s / 2;
  const halo = g.createRadialGradient(m, m, 0, m, m, m);
  halo.addColorStop(0, hexA(color, 1)); halo.addColorStop(.12, hexA(color, .85)); halo.addColorStop(.35, hexA(color, .25)); halo.addColorStop(1, hexA(color, 0));
  g.fillStyle = halo; g.fillRect(0, 0, s, s);
  const core = g.createRadialGradient(m, m, 0, m, m, s * .1);
  core.addColorStop(0, "rgba(255,255,255,1)"); core.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = core; g.fillRect(0, 0, s, s);
  return c;
}
function shade(hex, f) {
  const c = hexRgb(hex) || [255, 255, 255];
  return "#" + c.map((v) => Math.round(v * f).toString(16).padStart(2, "0")).join("");
}
function hexRgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexA(hex, a) {
  const h = String(hex || "#ffffff").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6), 16) || 0xffffff;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// A stand-in header when the event has no picture: a warm stage glow over a
// crowd in silhouette.
function standInHeader() {
  const c = document.createElement("canvas"); c.width = 960; c.height = 540;
  const g = c.getContext("2d");
  const lg = g.createLinearGradient(0, 0, 960, 540);
  lg.addColorStop(0, "#2b0a3d"); lg.addColorStop(.55, "#7a1f2b"); lg.addColorStop(1, "#ff8a2b");
  g.fillStyle = lg; g.fillRect(0, 0, 960, 540);
  const rg = g.createRadialGradient(700, 160, 10, 700, 160, 380); rg.addColorStop(0, "rgba(255,220,150,.55)"); rg.addColorStop(1, "rgba(255,220,150,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 960, 540);
  let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "rgba(10,4,14,.85)";
  for (let i = 0; i < 26; i++) { const x = i * 40 - 10 + r() * 14, h = 70 + r() * 50; g.beginPath(); g.arc(x + 18, 540 - h, 16, 0, 6.283); g.fill(); g.fillRect(x, 540 - h + 10, 36, h); }
  return c;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const easeIn = (x) => x * x * x;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// The ShowPilot stamp (job 243): a round rubber-stamp impression with
// SHOWPILOT across the top, the venue along the bottom and the date in the
// middle, in one ink color, with the uneven gaps real ink leaves.
function makeStamp(date, venue, ink, R) {
  const d = date ? new Date(String(date).slice(0, 10) + "T12:00:00") : null;
  if (!d || isNaN(d)) return null;
  const pad = 24, S = R * 2 + pad * 2, c = document.createElement("canvas"); c.width = S; c.height = S;
  const g = c.getContext("2d"), m = S / 2;
  g.strokeStyle = ink; g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = R * .065; g.beginPath(); g.arc(m, m, R - g.lineWidth / 2, 0, 6.283); g.stroke();
  g.lineWidth = R * .022; g.beginPath(); g.arc(m, m, R * .74, 0, 6.283); g.stroke();
  // text around the ring
  const arcText = (text, radius, center, size, bottom) => {
    g.save(); g.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const chars = text.split(""); const widths = chars.map((ch) => g.measureText(ch).width + size * .12);
    const total = widths.reduce((a, b) => a + b, 0); let a = center - (bottom ? -1 : 1) * total / radius / 2;
    for (let i = 0; i < chars.length; i++) {
      const w = widths[i], step = w / radius;
      a += (bottom ? -1 : 1) * step / 2;
      g.save(); g.translate(m + Math.cos(a) * radius, m + Math.sin(a) * radius);
      g.rotate(a + (bottom ? -Math.PI / 2 : Math.PI / 2)); g.fillText(chars[i], 0, 0); g.restore();
      a += (bottom ? -1 : 1) * step / 2;
    }
    g.restore();
  };
  const ringR = R * .87, ringSize = R * .2;
  arcText("SHOWPILOT", ringR, -Math.PI / 2, ringSize, false);
  let v = String(venue || "").toUpperCase().trim();
  if (v.length > 18) v = v.slice(0, 17).trim() + "…";
  if (v) arcText(v, ringR, Math.PI / 2, ringSize * .8, true);
  // stars on the sides
  for (const side of [-1, 1]) {
    g.save(); g.translate(m + side * ringR, m); g.font = `700 ${ringSize * .8}px sans-serif`; g.fillText("★", 0, 0); g.restore();
  }
  // date in the middle
  g.font = `600 ${R * .16}px "IBM Plex Mono", ui-monospace, monospace`;
  g.fillText(d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(), m, m - R * .36);
  g.font = `700 ${R * .42}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  g.fillText(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase(), m, m + R * .02);
  g.font = `600 ${R * .17}px "IBM Plex Mono", ui-monospace, monospace`;
  g.fillText(String(d.getFullYear()), m, m + R * .38);
  // ink gaps: knock out specks and a few soft worn patches
  g.globalCompositeOperation = "destination-out";
  let sd = 9; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) { g.globalAlpha = .3 + rr() * .7; const x = rr() * S, y = rr() * S, z = rr() * 2.4 + .4; g.fillRect(x, y, z, z); }
  for (let i = 0; i < 6; i++) {
    const x = rr() * S, y = rr() * S, z = R * (.15 + rr() * .25);
    const wg = g.createRadialGradient(x, y, 0, x, y, z); wg.addColorStop(0, "rgba(0,0,0,.55)"); wg.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 1; g.fillStyle = wg; g.fillRect(x - z, y - z, z * 2, z * 2);
  }
  g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
  return c;
}

export function createFilm(canvas, opts = {}) {
  // Landscape puts the sun on the left and the event on the right.
  const land = opts.orientation === "landscape";
  const W = land ? FILM_H : FILM_W, H = land ? FILM_W : FILM_H, DUR = FILM_SECONDS;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const sunHex = hexRgb(opts.sun) ? opts.sun : null;
  const sun = makeSun(sunHex);
  const glowRgb = hexRgb(sunHex) || [255, 140, 40];
  const G3 = (hexRgb(sunHex) || [255, 170, 80]).join(",");
  const soft = sunHex ? hexRgb(sunHex).map((v) => Math.round(v + (255 - v) * .6)).join(",") : "255,214,160";
  const show = { you: true, header: true, name: true, date: true, ...(opts.show || {}) };
  const title = String(opts.title || "Tonight");
  const dateLine = String(opts.dateLine || "");
  const stampImg = makeStamp(opts.date, opts.venue, hexRgb(opts.sun) ? opts.sun : "#8CFF3D", land ? 118 : 132);
  const header = opts.image || standInHeader();
  const sprites = new Map();
  const sprite = (c) => { if (!sprites.has(c)) sprites.set(c, starSprite(c)); return sprites.get(c); };

  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const field = Array.from({ length: 520 }, () => ({ x: rand() * W, y: rand() * H, r: rand() * 1.6 + .3, a: rand() * .6 + .15, tw: rand() * 6, sp: rand() * 1.5 + .4 }));
  const SUN_X = land ? W * .29 : W / 2, SUN_Y = land ? H / 2 : 700, SUN_DRAW = land ? 1040 : 1180;
  // The event's column: centered under the sun (portrait) or to its right.
  const EV_X = land ? W * .7 : W / 2;
  // Landscape: the card, name and date sit as one block centered top to bottom.
  const CARD = land ? { w: 780, h: 439, y: Math.round((H - (439 + 200)) / 2) } : { w: 860, h: 484, y: 1150 };
  const TITLE_Y = land ? CARD.y + CARD.h + 120 : 1745, TITLE_Y_BARE = land ? H / 2 : 1400, TEXT_W = land ? 840 : 940;
  const list = (opts.stars && opts.stars.length ? opts.stars : [{ id: "you", color: "#8CFF3D", me: true }]).slice(0, 400);
  const n = list.length;
  const cx = W / 2, cy = land ? H / 2 : 820, rx = W * (land ? .46 : .44), ry = land ? H * .42 : 620;
  const stars = list.map((s, i) => {
    const frac = Math.min(1, Math.sqrt((i + .6) / Math.max(n, 6)) + (rand() - .5) * .12);
    const th = i * 2.39996 + (rand() - .5) * .9;
    return {
      x: cx + frac * rx * Math.cos(th), y: cy + frac * ry * Math.sin(th),
      size: (n > 120 ? 5 : n > 60 ? 7 : 9) + rand() * 7, color: s.color || "#ffffff", me: !!s.me,
      delay: rand() * .9, spin: (rand() > .5 ? 1 : -1) * (1.2 + rand() * 1.6), tw: rand() * 6,
    };
  });
  let shooting = [], dust = [];
  // The implosion's blast: glowing plasma flung out in an uneven shell, and
  // a few long light rays. Fixed per film so every play matches.
  const ejecta = Array.from({ length: 420 }, (_, i) => {
    const ang = (i / 420) * Math.PI * 2 + (rand() - .5) * .05;
    const lump = .5 + .5 * Math.sin(ang * 5 + 1.3) * Math.sin(ang * 3 - .7);
    return { ang, speed: .78 + .3 * rand() + .12 * lump, size: 10 + rand() * 26 + lump * 18, hot: rand(), drift: (rand() - .5) * .25 };
  });
  const rays = Array.from({ length: 14 }, () => ({ ang: rand() * Math.PI * 2, len: .5 + rand() * .7, w: 3 + rand() * 9 }));

  // Where a star is at time t while it spirals in.
  const pullOf = (t) => seg(t, 2.0, 5.2);
  function starPos(a, t) {
    const pull = pullOf(t);
    const p = easeIn(clamp01((pull - a.delay * .25) / (1 - a.delay * .25)));
    const dx = a.x - SUN_X, dy = a.y - SUN_Y;
    const ang = Math.atan2(dy, dx) + p * a.spin;
    const dist = Math.hypot(dx, dy) * (1 - p);
    return { x: SUN_X + Math.cos(ang) * dist, y: SUN_Y + Math.sin(ang) * dist, p };
  }

  function background(t, sx, sy) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const ng = ctx.createRadialGradient(W * .3, H * .28, 20, W * .3, H * .28, 900);
    ng.addColorStop(0, "rgba(60,40,120,.22)"); ng.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
    const ng2 = ctx.createRadialGradient(W * .8, H * .7, 20, W * .8, H * .7, 800);
    ng2.addColorStop(0, "rgba(20,60,110,.18)"); ng2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ng2; ctx.fillRect(0, 0, W, H);
    for (const s of field) {
      const y = (s.y + t * 6 * s.sp) % H;
      ctx.fillStyle = `rgba(255,255,255,${s.a * (.65 + .35 * Math.sin(t * 1.7 + s.tw))})`;
      ctx.beginPath(); ctx.arc(s.x + sx * .3, y + sy * .3, s.r, 0, 6.283); ctx.fill();
    }
    if (rand() < .012 && shooting.length < 3) shooting.push({ x: rand() * W, y: rand() * H * .5, vx: -(9 + rand() * 6), vy: 5 + rand() * 4, life: 1 });
    for (const s of shooting) {
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 12, s.y - s.vy * 12);
      g.addColorStop(0, `rgba(255,255,255,${.9 * s.life})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 12, s.y - s.vy * 12); ctx.stroke();
      s.x += s.vx * 2; s.y += s.vy * 2; s.life -= .016;
    }
    shooting = shooting.filter((s) => s.life > 0);
  }

  function drawStars(t) {
    const pull = pullOf(t);
    const fade = 1 - seg(t, 5.0, 5.35);
    ctx.globalCompositeOperation = "lighter";
    for (const a of stars) {
      const now = starPos(a, t);
      const appear = seg(t, .1 + a.delay * .6, .7 + a.delay * .6) * fade;
      if (appear <= 0) continue;
      const img = sprite(a.me ? "#8CFF3D" : a.color);
      const base = a.size * (a.me && show.you ? 1.5 : 1);
      // Motion: a comet tail of fading, shrinking copies along the path it
      // just travelled, longer the faster it falls.
      if (now.p > .01) {
        const steps = 26;
        for (let i = steps; i >= 1; i--) {
          const q = starPos(a, t - i * .015);
          const k = 1 - i / (steps + 1);
          const sz = base * (1.6 + 2.2 * now.p) * (.35 + .65 * k);
          ctx.globalAlpha = appear * k * k * .55 * Math.min(1, now.p * 4);
          ctx.drawImage(img, q.x - sz * 2, q.y - sz * 2, sz * 4, sz * 4);
        }
        // sparks shed as it speeds up
        if (rand() < now.p * .35) dust.push({ x: now.x, y: now.y, vx: (rand() - .5) * 3, vy: (rand() - .5) * 3, life: 1, color: a.me ? "#8CFF3D" : a.color });
      }
      const tw = .85 + .15 * Math.sin(t * 3 + a.tw);
      const sz = base * (1 - now.p * .35) * tw * (1 + now.p * .8);
      ctx.globalAlpha = appear;
      ctx.drawImage(img, now.x - sz * 2.2, now.y - sz * 2.2, sz * 4.4, sz * 4.4);
    }
    for (const d of dust) {
      ctx.globalAlpha = d.life * .8 * fade;
      const s = 10 * d.life;
      ctx.drawImage(sprite(d.color), d.x - s, d.y - s, s * 2, s * 2);
      d.x += d.vx; d.y += d.vy; d.life -= .03;
    }
    dust = dust.filter((d) => d.life > 0).slice(-500);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";

    // "You" for the first moment.
    const me = stars.find((s) => s.me);
    if (me && show.you && t < 2.3) {
      const p = starPos(me, t), a = seg(t, .4, 1) * (1 - seg(t, 1.8, 2.3));
      ctx.globalAlpha = a; ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, me.size * 3, 0, 6.283); ctx.stroke();
      ctx.font = "600 36px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
      ctx.fillText("You", p.x, p.y + me.size * 3 + 46); ctx.globalAlpha = 1;
    }
    // The light gathering in the middle.
    const core = easeIn(pull);
    if (core > 0 && t < 5.35) {
      const r = 40 + core * 170;
      const g = ctx.createRadialGradient(SUN_X, SUN_Y, 0, SUN_X, SUN_Y, r);
      g.addColorStop(0, `rgba(255,250,235,${.9 * core})`); g.addColorStop(.4, `rgba(255,190,90,${.5 * core})`); g.addColorStop(1, "rgba(255,150,40,0)");
      ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(SUN_X, SUN_Y, r, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawCover(img, x, y, w, h) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const s = Math.max(w / iw, h / ih);
    ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
  }
  function fitText(text, x, y, maxW, size) {
    let s = size;
    do { ctx.font = `700 ${s}px "Barlow Condensed", "Arial Narrow", sans-serif`; s -= 4; } while (ctx.measureText(text).width > maxW && s > 40);
    ctx.fillText(text, x, y);
  }

  // The blast after the collapse: a soft shock front (no hard line), an
  // uneven shell of hot plasma that cools from white to deep orange as it
  // spreads, light rays, and a lens streak across the flash.
  const hot = sprite("#fff2d6"), warm = sprite(sunHex || "#ffb04a"), deep = sprite(sunHex ? shade(sunHex, .55) : "#ff5a1f");
  function blast(t) {
    const b = seg(t, 5.3, 7.4), e = easeOut(b), fadeB = 1 - b;
    ctx.globalCompositeOperation = "lighter";
    // shock front: no hard circle, just a broad haze and soft, uneven
    // puffs of light riding the edge
    const R = 60 + e * 1250;
    const sA = Math.pow(fadeB, 2);
    const sg = ctx.createRadialGradient(SUN_X, SUN_Y, R * .35, SUN_X, SUN_Y, R * 1.12);
    sg.addColorStop(0, `rgba(${G3},0)`);
    sg.addColorStop(.6, `rgba(${G3},${.07 * sA})`);
    sg.addColorStop(.86, `rgba(255,215,170,${.16 * sA})`);
    sg.addColorStop(1, "rgba(255,200,140,0)");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(SUN_X, SUN_Y, R * 1.12, 0, 6.283); ctx.fill();
    for (let i = 0; i < 150; i++) {
      const p = ejecta[(i * 7) % ejecta.length];
      const a = p.ang + i * .013;
      const rr = R * (.9 + .12 * Math.sin(a * 6 + p.hot * 4) + .05 * p.drift);
      const sz = 70 + p.size * 2.2;
      ctx.globalAlpha = sA * (.1 + .12 * p.hot);
      ctx.drawImage(warm, SUN_X + Math.cos(a) * rr - sz, SUN_Y + Math.sin(a) * rr - sz, sz * 2, sz * 2);
    }
    // plasma shell, stretched along its path and cooling as it spreads
    for (const p of ejecta) {
      const rr = (30 + e * 1150) * p.speed;
      const a = p.ang + p.drift * e;
      const life = Math.pow(fadeB, 1.5);
      const sz = p.size * (1.1 - .55 * e) * (.5 + .8 * life);
      const img = b < .12 + p.hot * .1 ? hot : b < .4 + p.hot * .2 ? warm : deep;
      for (let k = 0; k < 3; k++) {
        const r2 = rr * (1 - k * .035 * (1 - e * .5));
        ctx.globalAlpha = life * (.22 + .3 * p.hot) * (1 - k * .3);
        const x = SUN_X + Math.cos(a) * r2, y = SUN_Y + Math.sin(a) * r2 * .96, z = sz * (1 - k * .18);
        ctx.drawImage(img, x - z, y - z, z * 2, z * 2);
      }
    }
    // light rays
    const rayA = Math.pow(1 - seg(t, 5.3, 6.6), 1.6);
    if (rayA > 0) {
      for (const ry of rays) {
        const len = (300 + e * 1500) * ry.len;
        const x2 = SUN_X + Math.cos(ry.ang) * len, y2 = SUN_Y + Math.sin(ry.ang) * len;
        const g = ctx.createLinearGradient(SUN_X, SUN_Y, x2, y2);
        g.addColorStop(0, `rgba(255,245,220,${.5 * rayA})`); g.addColorStop(1, "rgba(255,200,120,0)");
        ctx.strokeStyle = g; ctx.lineWidth = ry.w * (1 + e); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(SUN_X, SUN_Y); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // lens streak
      const lg = ctx.createLinearGradient(0, SUN_Y, W, SUN_Y);
      lg.addColorStop(0, "rgba(255,200,140,0)"); lg.addColorStop(.5, `rgba(255,250,235,${.8 * rayA})`); lg.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = lg; ctx.fillRect(0, SUN_Y - 3 - 6 * rayA, W, 6 + 12 * rayA);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }

  function frame(t) {
    const shakeAmt = t > 5.15 && t < 6.2 ? (1 - seg(t, 5.15, 6.2)) * 18 : 0;
    const sx = (Math.random() - .5) * shakeAmt, sy = (Math.random() - .5) * shakeAmt;
    background(t, sx, sy);
    ctx.save(); ctx.translate(sx, sy);
    if (t < 5.4) drawStars(t);

    // Implosion: squeeze to a point, then a shock ring.
    if (t > 5.0 && t < 7.4) {
      if (t < 5.3) {
        const r = 210 * (1 - easeIn(seg(t, 5.0, 5.3))) + 8;
        const g = ctx.createRadialGradient(SUN_X, SUN_Y, 0, SUN_X, SUN_Y, r);
        g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,200,120,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(SUN_X, SUN_Y, r, 0, 6.283); ctx.fill();
      } else {
        blast(t);
      }
    }
    // The sun.
    if (t > 5.3) {
      const grow = easeOut(seg(t, 5.3, 6.8)), k = seg(t, 5.3, 5.9);
      const s = SUN_DRAW * (.15 + .85 * grow + Math.sin(seg(t, 5.3, 7.2) * Math.PI) * .05);
      const bl = ctx.createRadialGradient(SUN_X, SUN_Y, s * .2, SUN_X, SUN_Y, s * .75);
      bl.addColorStop(0, `rgba(${glowRgb.join(",")},${.28 * k})`); bl.addColorStop(1, `rgba(${glowRgb.join(",")},0)`);
      ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(SUN_X, SUN_Y, s * .75, 0, 6.283); ctx.fill();
      if (sun) { sun.render(t + 2, k); ctx.drawImage(sun.canvas, SUN_X - s / 2, SUN_Y - s / 2, s, s); }
      else {
        const g = ctx.createRadialGradient(SUN_X, SUN_Y, 0, SUN_X, SUN_Y, s * .25);
        g.addColorStop(0, `rgba(255,240,200,${k})`); g.addColorStop(.8, `rgba(255,150,40,${k})`); g.addColorStop(1, "rgba(255,120,20,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(SUN_X, SUN_Y, s * .25, 0, 6.283); ctx.fill();
      }
    }
    // The flash: blinding for an instant, gone fast so the blast shows.
    if (t > 5.25 && t < 6.2) {
      ctx.fillStyle = `rgba(255,245,225,${Math.pow(1 - seg(t, 5.28, 6.2), 3.2) * .85})`; ctx.fillRect(-40, -40, W + 80, H + 80);
    }
    ctx.restore();

    // The event: picture, then name, then date. Without a picture the text
    // moves up into its place.
    let textY = TITLE_Y;
    const nT = show.header ? 9.4 : 8.2;
    const stampOn = show.date && stampImg;
    const ST = nT + 1.1; // the stamp lands
    const hitT = t - ST;
    const jolt = stampOn && hitT > 0 && hitT < .22 ? Math.sin(hitT * 70) * (1 - hitT / .22) * 7 : 0;
    let cardBox = null;
    if (show.header) {
      const hIn = easeOut(seg(t, 8.0, 9.4));
      if (hIn > 0) {
        const cw = CARD.w, ch = CARD.h, x = EV_X - cw / 2 + jolt * .4, y = CARD.y + (1 - hIn) * 70 + jolt;
        cardBox = { x, y, cw, ch };
        ctx.save(); ctx.globalAlpha = hIn;
        ctx.shadowColor = `rgba(${G3},.35)`; ctx.shadowBlur = 60;
        roundRect(x, y, cw, ch, 28); ctx.fillStyle = "#111"; ctx.fill(); ctx.shadowBlur = 0;
        ctx.save(); roundRect(x, y, cw, ch, 28); ctx.clip(); drawCover(header, x, y, cw, ch); ctx.restore();
        ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 2; roundRect(x, y, cw, ch, 28); ctx.stroke();
        ctx.restore();
      }
    } else textY = TITLE_Y_BARE;
    if (show.name) {
      const nIn = easeOut(seg(t, nT, nT + 1.2));
      if (nIn > 0) {
        ctx.save(); ctx.globalAlpha = nIn; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
        ctx.shadowColor = `rgba(${G3},.45)`; ctx.shadowBlur = 24;
        fitText(title.toUpperCase(), EV_X, textY + (1 - nIn) * 26, TEXT_W, 104);
        ctx.restore();
      }
    }
    // The ShowPilot stamp slams onto the card's top-right corner (or under
    // the name when there's no picture): drops in big, hits, settles, with a
    // little ink burst.
    if (stampOn && t > ST - .25) {
      const sz = stampImg.width;
      const cx = cardBox ? cardBox.x + cardBox.cw - sz * .3 : EV_X;
      const cy = cardBox ? cardBox.y + sz * .22 : textY + (show.name ? 60 : 0) + sz * .48;
      const fall = clamp01((t - (ST - .25)) / .25);
      const scale = t < ST ? 2.3 - 1.4 * easeIn(fall) : 1 + .06 * Math.exp(-hitT * 18) * Math.cos(hitT * 40);
      const alpha = t < ST ? .25 + .55 * fall : .92;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.24 + (t < ST ? (1 - fall) * .12 : 0)); ctx.scale(scale, scale);
      if (t < ST) { ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 30 * (1 - fall); ctx.shadowOffsetY = 26 * (1 - fall); }
      ctx.globalAlpha = alpha;
      ctx.drawImage(stampImg, -sz / 2, -sz / 2);
      ctx.restore();
      if (hitT > 0 && hitT < .5) {
        const bt = hitT / .5;
        ctx.save(); ctx.globalAlpha = (1 - bt) * .5; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 3 * (1 - bt) + 1;
        ctx.beginPath(); ctx.arc(cx, cy, sz * (.42 + bt * .35), 0, 6.283); ctx.stroke(); ctx.restore();
      }
    }
    if (show.date && dateLine && !stampImg) {
      const dIn = easeOut(seg(t, nT + .8, nT + 1.8));
      if (dIn > 0) {
        ctx.save(); ctx.globalAlpha = dIn; ctx.textAlign = "center"; ctx.fillStyle = `rgba(${soft},.92)`;
        ctx.font = '500 32px "IBM Plex Mono", ui-monospace, Menlo, monospace';
        if ("letterSpacing" in ctx) ctx.letterSpacing = "5px";
        ctx.fillText(dateLine.toUpperCase(), EV_X, (show.name ? textY + 67 : textY) + (1 - dIn) * 16, TEXT_W);
        ctx.restore();
      }
    }
    const out = seg(t, 14.2, 16.8);
    if (out > 0) { ctx.fillStyle = `rgba(0,0,0,${easeInOut(out)})`; ctx.fillRect(0, 0, W, H); }
  }

  let raf = 0, startAt = 0, ended = null, onTime = null;
  function loop(now) {
    const t = (now - startAt) / 1000;
    frame(Math.min(t, DUR));
    onTime?.(Math.min(1, t / DUR));
    if (t < DUR) raf = requestAnimationFrame(loop);
    else { const cb = ended; ended = null; cb?.(); }
  }
  return {
    duration: DUR, width: W, height: H,
    play(onEnd, progress) {
      cancelAnimationFrame(raf); shooting = []; dust = []; seed = 11;
      ended = onEnd || null; onTime = progress || null;
      startAt = performance.now(); raf = requestAnimationFrame(loop);
    },
    stop() { cancelAnimationFrame(raf); ended = null; },
    still(t = 12) { cancelAnimationFrame(raf); frame(t); },
  };
}

// Record one full play as a video. Resolves { blob, ext } or rejects.
export function recordFilm(canvas, film, onProgress) {
  const types = ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const type = typeof MediaRecorder !== "undefined" ? types.find((m) => MediaRecorder.isTypeSupported(m)) : null;
  if (!canvas.captureStream || !type) return Promise.reject(new Error("unsupported"));
  return new Promise((resolve, reject) => {
    const mr = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onerror = (e) => reject(e.error || new Error("record failed"));
    mr.onstop = () => resolve({ blob: new Blob(chunks, { type: type.split(";")[0] }), ext: type.startsWith("video/mp4") ? "mp4" : "webm" });
    mr.start(500);
    film.play(() => setTimeout(() => mr.stop(), 150), onProgress);
  });
}

// "SUN · NOV 8 · 2026 · ABAA" from an event's date and venue.
export function filmDateLine(date, venue) {
  const d = date ? new Date(String(date).slice(0, 10) + "T12:00:00") : null;
  const parts = [];
  if (d && !isNaN(d)) {
    parts.push(d.toLocaleDateString("en-US", { weekday: "short" }), d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), String(d.getFullYear()));
  }
  if (venue) parts.push(venue);
  return parts.join(" · ").toUpperCase();
}
