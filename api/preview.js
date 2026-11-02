// Link previews (job 203). When someone pastes a ShowPilot link into iMessage,
// Slack, Discord and the like, the app fetches the page and reads its title,
// description, picture and color. The site is a single page app, so every link
// would otherwise say "ShowPilot" in green. vercel.json sends ONLY preview
// fetchers (bots) for /v/<code>, /intake/<code>, /gig/shared and /gig/web here;
// this returns the normal index.html with the event's name, the invitation
// type, the overview-card picture (api/card.js) and the profile's color filled
// in. People opening the link never come through here.
import { lookup, colorFor, typeLabel, prettyDate } from "./_preview.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "showpilot.space";
  const origin = `https://${host}`;
  const { kind, key } = req.query || {};

  let html;
  try {
    html = await (await fetch(`${origin}/index.html`)).text();
  } catch {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }

  const info = await lookup(kind, key);
  if (info) {
    const color = colorFor(info.role);
    const type = typeLabel(kind, info);
    const desc = [type, prettyDate(info.date), info.venue].filter(Boolean).join(" · ");
    const title = esc(info.title);
    const img = `${origin}/api/card?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}`;
    const tags = [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="ShowPilot" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${esc(desc)}" />`,
      `<meta property="og:image" content="${img}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${img}" />`,
      `<meta name="description" content="${esc(desc)}" />`,
    ].join("\n    ");
    html = html
      .replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`)
      .replace(/<meta name="theme-color"[^>]*>/i, `<meta name="theme-color" content="${color}" />`)
      .replace(/<\/head>/i, `    ${tags}\n  </head>`);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.statusCode = 200;
  res.end(html);
}
