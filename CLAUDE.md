# CLAUDE.md

Guidance for Claude Code working in this repository. Start here; the deeper references are in
`docs/`, and `docs/roadmap.md` says what's next.

## What this is

stevenpisani.com, Steve Pisani's personal site: Jekyll (the `github-pages` gem, so Jekyll 3.x),
built and deployed by GitHub Actions. The homepage is a small walkable planet in three.js: you're
dropped onto an asteroid in first person with a tiki bar in view, walk over, sit, and pick the
site's content from a menu; every section is also one click away in the top bar, and `/classic`
is the homepage without 3D. Every other page is a normal Jekyll page. Behind it is one Supabase
project (bottles, the page count, the AI bartender, the private apps at `/apps`), all as code. No CSS
framework; the one build step besides Jekyll is `npm run build`: esbuild bundling the JavaScript, and
merging Steve's books into `_data/library.json`.

| Read | When |
|---|---|
| `docs/world.md` | before changing anything on the planet (`assets/js/world/`): every module, and how each thing a visitor does works |
| `docs/apps.md` | before touching the private apps (`/apps`: the recipe tracker, and whatever's next), or adding one |
| `docs/backend.md` | Supabase, the bartender, deploys, secrets, the monthly budget |
| `docs/vision.md` | what the private apps are becoming, and the six rules that keep them improving as AI models do |
| `docs/roadmap.md` | what to build next, what's waiting on Steve, what's parked |
| `.claude/skills/verify-world` | how to see a change to the planet working (and the sandbox's quirks) |
| `.claude/skills/steward` | branches, PRs, CI, merging and the deploy afterwards |

## Commands

```bash
# Setup (Ruby 3.3 + Bundler, Node 22). On Claude Code on the web the SessionStart hook
# (.claude/hooks/session-start.sh) has already done this, and built the scripts once.
bundle config set --local path vendor/bundle && bundle install
npm install

# Develop: esbuild rebuilds assets/js/dist/ on save while Jekyll serves (make serve does both)
npm run watch & bundle exec jekyll serve

# Build: the scripts first (Jekyll copies assets/js/dist/ in), then Jekyll
npm run build && bundle exec jekyll build --strict_front_matter

# Check: every internal link and asset in the build exists (the bundles included)
npm run check

# Test: first the wardrobe's data and MCP server on the real schema (tools/wardrobe-test.mjs: every
# migration in PGlite, a few seconds), then trips in detail the same way (tools/trips-test.mjs), then the smoke test: every page, then the planet driven
# through everything a visitor can do, on desktop and phone, the private apps against a made-up
# Supabase, and the no-WebGL fallback, in headless Chromium; offline, never writes to Supabase.
# About 5 minutes under software WebGL. node tools/smoke.mjs --only desktop|phone|pages|apps|nogl, --shots <dir>.
npm test
```

CI (`.github/workflows/site.yml`) runs build, check, the wardrobe and trips tests and the smoke test on every PR, and on main
deploys only once they pass. Jekyll needs `LANG=C.UTF-8` to read the posts (the hook sets it).

## The JavaScript build

- `package.json` pins every library (three, postprocessing, n8ao, Rapier, supabase-js, esbuild, Playwright, the model tools), nowhere else. Import three's addons as `three/addons/...`.
- `tools/build-js.mjs` bundles and minifies `assets/js/site.js` → `assets/js/dist/site.js` (every page), each file in `assets/js/apps/` → `assets/js/dist/apps/` (the private apps, with their shared kit and the Supabase client split into one chunk), `assets/js/mcp-app/widget.js` → `assets/js/dist/mcp-app.js` (SJPJr's card in ChatGPT and Claude, one self-contained script: `card.js`, the shell, and a file per area in `views/`), and `assets/js/world/main.js` with everything it imports, three.js included → `assets/js/dist/world.js` (one request), with source maps. `assets/js/dist/` isn't committed; the sources are in `exclude:` so only the bundles are published. A new world module needs nothing but its import.
- The only thing split off is what's loaded later by `import()`: Rapier (`physics.js`), as `rapier-*.js` plus its `.wasm` (a plugin swaps the compat build's inline base64 for the file). The build fails if `world.js` would import a chunk statically (a request waterfall): keep `import()` targets self-contained.

## How Steve wants it done

- **DRY and KISS.** One source for each fact: links in `_config.yml`, content in `_data/`,
  library versions in `package.json`, the Supabase settings in `_config.yml`. Reuse before adding.
- **Everything as code.** Changes land through the repo and its workflows, never by hand in a
  dashboard (Supabase included). If something truly needs a click from Steve, say exactly where.
- **Budget: $20 a month, all in** (about $5 today; `docs/backend.md`). Anything with a running cost
  gets a cap in code.
- **Never mention clients** anywhere on the site or in what the bartender says.
- **Secrets:** never ask Steve to paste a token into the chat; they go in GitHub repo secrets.
- **Write plainly**, in the site's voice: short sentences, no marketing words, no filler. Update
  the docs (this file, `docs/`) in the same PR as the change they describe.
- **Show, don't claim:** check UI changes in a browser (`npm test`, screenshots) before saying
  they work, and say what you couldn't check.

## Where things are

- `_layouts/`: `default.html` (shell), `world.html` (the homepage: loads `world.css` and the one bundle `dist/world.js`, modulepreloaded, and preloads `props.glb`; the bundle URLs carry the build time as `?v=`, so a cached page never runs another build's script), `page.html` (kicker/heading/lede header + prose; `wide: true` drops the prose width), `post.html`, `app.html` (a private app: the sign-in gate around the page's content; its heading and back link can say where you are). Both shells share `_includes/head.html` (SEO via `{% seo %}`, fonts, site.css).
- `_includes/`: `nav.html`, `footer.html`, `launch.html` (next-launch card, Launch Library 2 API), `cover.html` (post cover, gradient fallback seeded by title), `post-row.html`, `lab-card.html`, `read_time.html`
- `_data/`: content lives here, edit these rather than HTML
  - `timeline.yml`: career timeline on /about
  - `lab.yml`: experiments on /lab (first three also appear on the homepage)
  - `drinks.yml`: Steve's favorite drinks and recipes (name, origin, glass, build, method, note, and `make`: how the robot makes it: glass, ice, colour, foam, garnish, and the steps after the pours; the header explains each field): the chalkboard behind the bar, the "Favorite drinks" panel (each recipe gets a "Make me one" button), and /drinks
  - `moon.yml`: the Apollo landing sites the telescope marks on the real moon (name, when, where, one line)
  - `profile.yml`: who Steve is (headline, what he does, focus, skills, tech stack): /about's skills, and `/profile.json` (`profile.json` at the root), a feed of that plus the latest posts and live lab items that the GitHub profile README is rebuilt from
  - `audible.json`: Steve's Audible library (finished and listening-now books), written daily by `tools/audible-sync.py` (`.github/workflows/audible.yml`); never edit it by hand. `audible_hide.yml` lists books never to show.
  - `books.yml`: Steve's shelves, the categories everywhere books show, in order: each with `hue`, `genres` (the Audible categories that land on it; `"*"` takes the rest) and `books` (a title listed here goes on that shelf, whether it's also on Audible or not; to move an Audible book, list it)
  - `library.json`: every book Steve has read, one list with no telling how he read it, by shelf, newest first, plus what he's reading now. Written by `tools/library.mjs` from the two above at `npm run build` (not committed; `jekyll serve` without a build shows no books). Feeds /bookshelf, `/library.json` (the stars over the hammock), the hammock's reading list and the bartender
  - `bar.yml`: the homepage's menu (label, a one-line note on what's there, fallback href), the bartender's lines, and the campfire list
- `_posts/`: posts (layout defaults to `post`). Optional front matter: `image_url` (a URL or a site path like `/assets/images/x.webp`, with a 192px square `x-thumb.webp` beside it for the post lists; `cover.html` asks Unsplash and Pexels for thumbnail-sized crops itself), `description`
- Pages: `index.html` (the asteroid), `classic.html` (/classic, the non-3D homepage), `about.html`, `blog.html` (/blog, labelled "Writing"), `lab.html`, `bookshelf.html` (a row of shelf links, "Reading now", then a section per shelf, newest first, three rows showing and the rest folded; covers in a dense grid, a title tile in the shelf's colour where there's no cover, a round play button for a sample), `drinks.html` (/drinks, recipes via `_includes/drinks.html`), `404.html`, `401.html`
- `lab/`: lab experiments with their own pages, e.g. `lab/sql-formatter.html` (SQLFluff in the browser via Pyodide; its Python lives in `assets/py/fluff.py`)
- `assets/files/.sqlfluff`: downloadable SQLFluff config for the SQL style guide. It's the single source of truth; the formatter fetches it too. Listed under `include:` because Jekyll skips dotfiles.
- `apps/`: the private apps, members only (`public.members`), sign-ups off: `index.html` (/apps, the list from `_data/apps.yml`), `recipes.html` (/apps/recipes, the recipe tracker, also linked from the lab), `wardrobe.html` (/apps/wardrobe, Steve's clothes, private to him; ChatGPT and Claude reach it through SJPJr, the MCP server, `supabase/functions/mcp` (one file per area in `areas/`, the rules in `server.js`), and show it in a card, `assets/js/mcp-app/`) and `authorize.html` (/apps/authorize, the OAuth consent page they send you to; not listed). `offline.js` is the service worker that lets the wardrobe open with no connection. On a phone the wardrobe is laid out like an app (tabs at the bottom, sheets from the bottom, outfits laid flat on one photo ground; the rules are in `docs/apps.md`). They use `_layouts/app.html`, `assets/css/apps.css` and `assets/js/apps/` (one script per app on the shared `lib/kit.js`, bundled to `dist/apps/`; the wardrobe's weather is drawn by `lib/sky.js`, its journeys, stays and home-and-away line by `lib/travel.js`). Each installs as a full-screen home-screen app (`apps/<app>.webmanifest`, the SJPJr badge as its icon, from `tools/app-icons.mjs`) and signs in by the link or the 6-digit code in the email (`supabase/templates/magic_link.html`, applied by the Supabase workflow). How they work and how to add one: `docs/apps.md`. `recipe_tracker/` only redirects to /apps/recipes.
- `supabase/`: the Supabase project as code (migrations, auth settings and email templates, edge functions); see `docs/backend.md`.
- `proxy/`: `_worker.js`, the Cloudflare Pages worker behind `mcp.stevenpisani.com`, SJPJr's (the MCP server's) own address (deployed by `.github/workflows/mcp-proxy.yml`; `docs/apps.md`).
- `tools/`: `build-js.mjs` (the esbuild bundle; it runs `library.mjs` first), `library.mjs` (the books merge), `check-site.mjs` (links and assets), `smoke.mjs` (the browser test), `wardrobe-test.mjs` (the wardrobe's migrations, view, row-level security and MCP tools, in PGlite, on `wardrobe-db.mjs`, which the smoke test's card session uses too), `trips-test.mjs` (trips in detail the same way: the London and Florence trip end to end; and `_shared/weather.js` against a made-up Open-Meteo), `supabase.mjs` (applies `supabase/`), `empty-trash.mjs` and `photo-copies.mjs` (the hourly Supabase job: the wardrobe's trash, and its photos' smaller copies for the MCP server and the app), `supabase-logs.mjs` (the edge functions' recent logs, via the Supabase workflow's "logs" option), `audible-sync.py` (the Audible sync), `fixtures/` (made-up data for tests: an Audible library and shelves, recipes, clothes, photos, trips), `build-models.mjs` and `models/` (the 3D model pipeline and hero model prompts), `app-icons.mjs` (the private apps' home-screen icon: the SJPJr badge on cream).

## The asteroid (homepage)

Art direction: moody, realistic mid-century "Polynesian Pop" at night. The bar is the warm light source against deep space; cool moonlight is the key light; every warm tone comes from practicals (torches, pufferfish lamps, floats, neon, fire). Tiki signals, strongest first: carved tikis, a steep A-frame thatch roof, glass floats in nets, pufferfish lamps, bamboo, tiki mugs, tapa cloth, lava rock, torches, neon script. Tiki is an American pop fantasy: use invented pop-style tikis, never replicas of real sacred carvings, and no caricatured people.

Design rules, from Krug's *Don't Make Me Think* and Apple's HIG. Keep them when changing anything here:
- No start screen, splash, or instructions panel. The first frame shows the bar and its neon sign ahead, far enough that you have to walk.
- Loading never looks broken (HIG: Launching). The launch screen (`#veil` in `index.html`) is a painted stand-in for the first frame: night sky, horizon, and the neon sign warming up exactly where the real one will be (an SVG copy of the 3D sign, drawn from the same numbers as `bar.js` and the canvas textures and placed by CSS `perspective` at the sign's camera-space pose from the spawn, so the scene fades in with the sign on top of itself; `world.css` notes what to re-measure if the spawn, sign or fov change), a progress bar whose sheen keeps moving while the main thread builds (compositor-only animation), and a plain line saying what's being done (`step()` in `main.js`). It sits under the UI, so the top bar, menu and deep-linked panels work while it loads. It fades only after the first frames are drawn (shaders compile there), never over a frozen scene. After 10 s a way out appears ("see the site without 3D" → /classic), pure CSS, so it shows even if the script never loads.
- Site ID + tagline top-left and every section in the top bar at all times (a Menu button under 1040px, where seven sections would wrap), with the speaker beside them; the buttons keep their size and the tagline wraps first. Nobody is ever forced to walk to reach content.
- Click/tap where you want to go, drag to look. WASD/arrows and E are extras, never required.
- Clickable things look clickable without hover. The bar needs no label: it's the lit, open thing at the end of the path with its neon sign readable from where you land, your stool sits in a pool of light from a pendant lamp, and the bartender turns and waves as you walk up. The menu card's "Pick up the menu" label stays until the first time someone picks it up.
- One hint at a time, shown just in time, retired forever (localStorage `world-*`) once used.
- The menu is an old-school tiki menu (bamboo frame, parchment, tapa band, "Steve's" in script) with plain labels (`label` in `_data/bar.yml`) and one line each saying what's there (`note`). No filler text: no prices, no made-up drink names, nothing decorative that's words.
- Every state has a way back: × and Esc close panels; at the bar × and Esc put the menu back down, then Esc or "Leave the bar" (in the menu, or bottom-left when it's down) leave; the browser Back button closes panels (`#<id>` history entries), and deep links (`/#about`) open content directly.
- The camera never moves on its own: no intro flights, no idle sway. It moves only when the guest asks (sitting, leaving, leaning in to watch a drink being made). Respect reduced motion.
- The point of view is continuous: sitting down and getting up are first-person body motions (`flyPath` in `main.js`: one curve through a few poses in `bar.seat`, speeding up over its first quarter, steady, slowing over its last, so its peak is only 4/3 of its average speed) that start from and end in the exact walking view. Keep them unhurried; getting up turns you around, so it takes about 4 s and the turn peaks near 140°/s.
- Tap targets at least 44px.
- Nothing on the planet selects as text (`world.css`): a long press is a look and a held button is a throw, never a selection or the copy callout. Only a panel's content and what you type into select.

How it's built, module by module: `docs/world.md`.

## Styling and scripts

- `assets/css/site.css`: the site-wide stylesheet (`assets/css/world.css` adds the homepage world on top). Colors are custom properties on `:root` with three themes: light (default), dark a.k.a. space (Milky Way background; system preference or chosen), terminal (chosen). New components should use the tokens, never raw colors.
- `assets/js/site.js` (published as `dist/site.js`): theme cycling (auto → light → dark → terminal) and `window.nextLaunch()` / `window.tMinus()`, which fill any `[data-launch]` block (cached in localStorage for an hour; the API allows 15 requests/hour/IP); `window.moonTonight()`, `window.issNow()` (wheretheiss.at, no key, about 1 request/s allowed) and `window.fillSky(el)`, which fill a `[data-sky]` block (the telescope's "Up there tonight": the moon's phase, and the ISS live every 5 s with its distance from Philadelphia); `window.siteDb` (the Supabase url and public key, from the `supabase-url` / `supabase-key` meta tags `_includes/head.html` writes from `_config.yml`) the nav's "Apps" link, shown only to someone signed in to the private apps on this browser; and the page count: one `pageviews` row per page view (path, referring host if it's another site, phone/tablet/desktop), no cookies or IPs, skipped for Do Not Track, Global Privacy Control, automated browsers and localhost. No jQuery.
- `assets/css/apps.css`: the private apps' parts, on the same tokens; loaded only by `layout: app` pages.
- Fonts: Fraunces (display), Inter (body), JetBrains Mono (labels/code) from Google Fonts; the homepage adds Pacifico (the neon and the menu's script) and Caveat (the message in a bottle's handwriting).

## Important notes

- `_config.yml` sets each link once (`links:`, with YAML anchors that `social.links` reuses for jekyll-seo-tag).
- CNAME holds the custom domain; don't remove it.
- Post permalinks use Jekyll's default (`/YYYY/MM/DD/Title.html`); don't change them, they're linked externally.
- Use `relative_url` for internal links and assets.
- Non-site files (this file, README, Makefile, Gemfile, `package.json`, `node_modules`, `docs/`, `tools/`, `supabase/`, and the script sources the bundles are built from) are in `exclude:` in `_config.yml` so they aren't published.
- Front matter values containing `: ` must be quoted, or Jekyll silently drops the layout (it only logs a YAML Exception); CI builds with `--strict_front_matter` so it fails instead).
