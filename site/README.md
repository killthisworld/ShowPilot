# get.showpilot.space

The Show Pilot marketing site (job 333). Plain static files, no build step:
`index.html`, `styles.css`, `site.js`, the app icons and `vercel.json`.

It is its own Vercel project with **Root Directory = `site`** and the domain
`get.showpilot.space`. It does not touch the app (showpilot.space), and the
app's build ignores this folder.

Prices come from the project doc `claude/pricing.md`; profile wording mirrors
`src/lib/profileShowcase.js`. Change them together.

The "Inside the app" tour (a feature list for each profile) is generated:
edit the lists in `scripts/build-site-tour.py` and run
`python3 scripts/build-site-tour.py site/index.html site/index.html`.
It rewrites only the part between `<!--TOUR-->` and `<!--/TOUR-->`.
