// The picture in a link preview (job 203): the event's overview card as a
// 1200x630 image, like the card at the top of the event link: the event
// picture, venue, name and date over the bottom, plus a badge in the
// profile's color saying what kind of invitation the link is.
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { lookup, colorFor, typeLabel, prettyDate, extraAccess, typeIcon } from "./_preview.js";
import { iconUrl } from "./_icons.js";

const font600 = readFileSync(new URL("./_fonts/barlow-condensed-latin-600-normal.woff", import.meta.url));
const font700 = readFileSync(new URL("./_fonts/barlow-condensed-latin-700-normal.woff", import.meta.url));

// satori draws PNG and JPEG pictures; anything else (webp, huge files) falls back to the color panel.
async function pictureData(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") || "").split(";")[0];
    if (!/^image\/(png|jpe?g)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const h = (type, style, children) => ({ type, props: { style, children } });

export default async function handler(req, res) {
  const { kind, key } = req.query || {};
  const info = (await lookup(kind, key)) || { title: "ShowPilot", role: null };
  const color = colorFor(info.role);
  const pic = await pictureData(info.image);
  const label = info.title === "ShowPilot" ? "" : typeLabel(kind, info);
  const mainIcon = iconUrl(typeIcon(kind, info), "#0a0a0a");
  const extra = extraAccess(kind, info);
  const sub = [prettyDate(info.date, true), info.venue].filter(Boolean).join("  ·  ");

  const tree = h("div", { display: "flex", position: "relative", width: 1200, height: 630, background: pic ? "#111" : "#141414", fontFamily: "Barlow" }, [
    pic ? { type: "img", props: { src: pic, width: 1200, height: 630, style: { position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" } } } : h("div", { position: "absolute", top: 0, left: 0, width: 1200, height: 630, background: `${color}22` }, ""),
    h("div", { position: "absolute", top: 0, left: 0, width: 1200, height: 630, backgroundImage: "linear-gradient(180deg, rgba(10,10,10,0) 30%, rgba(10,10,10,0.94))" }, ""),
    h("div", { position: "absolute", top: 40, left: 48, display: "flex", flexDirection: "column", alignItems: "flex-start" }, [
      label ? h("div", { display: "flex", alignItems: "center", padding: "10px 26px 10px 14px", borderRadius: 999, background: color, color: "#0a0a0a", fontSize: 34, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }, [
        mainIcon ? { type: "img", props: { src: mainIcon, width: 40, height: 40, style: { width: 40, height: 40, marginRight: 12 } } } : h("div", { width: 12 }, ""),
        h("div", { display: "flex" }, label),
      ]) : h("div", {}, ""),
      ...extra.map((x) => h("div", { display: "flex", alignItems: "center", marginTop: 12, padding: "8px 22px 8px 12px", borderRadius: 999, background: "rgba(10,10,10,0.82)", border: `3px solid ${x.color}`, color: "#fff", fontSize: 28, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }, [
        { type: "img", props: { src: iconUrl(x.icon, x.color), width: 32, height: 32, style: { width: 32, height: 32, marginRight: 10 } } },
        h("div", { display: "flex" }, `Access given: ${x.label}`),
      ])),
    ]),
    h("div", { position: "absolute", left: 48, right: 48, bottom: 44, display: "flex", flexDirection: "column" }, [
      info.venue ? h("div", { display: "flex", color, fontSize: 34, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase" }, String(info.venue)) : h("div", {}, ""),
      h("div", { display: "flex", color: "#fff", fontSize: 104, fontWeight: 700, lineHeight: 1.0 }, String(info.title).slice(0, 60)),
      sub ? h("div", { display: "flex", color: "rgba(255,255,255,0.78)", fontSize: 38, fontWeight: 600, marginTop: 6 }, prettyDate(info.date, true)) : h("div", {}, ""),
    ]),
  ]);

  try {
    const svg = await satori(tree, { width: 1200, height: 630, fonts: [{ name: "Barlow", data: font600, weight: 600, style: "normal" }, { name: "Barlow", data: font700, weight: 700, style: "normal" }] });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    res.statusCode = 200;
    res.end(png);
  } catch (e) {
    console.error(e);
    res.statusCode = 302;
    res.setHeader("Location", "/icon-512.png");
    res.end();
  }
}
