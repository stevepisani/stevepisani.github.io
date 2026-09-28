# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jekyll personal site for stevenpisani.com, built by GitHub Pages (the `github-pages` gem, so Jekyll 3.x and only whitelisted plugins). The homepage is a small walkable planet (Three.js): you're dropped onto an asteroid in first person with a tiki bar in view, walk over, sit, and pick the site's content from a menu. Every section is also one click away in the top bar. Every other page is a normal Jekyll page, and the non-3D homepage lives at `/classic`. No CSS framework and no build step beyond Jekyll.

## Development Commands

### Setup
```bash
# Install dependencies (Ruby 3.x + Bundler)
gem install bundler
bundle install
```

### Local Development
```bash
# Run Jekyll development server
bundle exec jekyll serve

# Build the site
bundle exec jekyll build
```

## Architecture

- `_layouts/`: `default.html` (shell), `world.html` (the homepage: import map for Three.js from jsDelivr, loads `world.css` + `world/main.js`, preloads `props.glb`), `page.html` (kicker/heading/lede header + prose; `wide: true` drops the prose width), `post.html`. Both shells share `_includes/head.html` (SEO via `{% seo %}`, fonts, site.css).
- `_includes/`: `nav.html`, `footer.html`, `launch.html` (next-launch card, Launch Library 2 API), `cover.html` (post cover, gradient fallback seeded by title), `post-row.html`, `lab-card.html`, `read_time.html`
- `_data/`: content lives here, edit these rather than HTML
  - `timeline.yml`: career timeline on /about
  - `lab.yml`: experiments on /lab (first three also appear on the homepage)
  - `books.yml`: shelves on /bookshelf
  - `bar.yml`: the homepage's order menu (drink name, section, fallback href), the bartender's lines, and the campfire list
- `_posts/`: posts (layout defaults to `post`). Optional front matter: `image_url`, `description`
- Pages: `index.html` (the asteroid), `classic.html` (/classic, the non-3D homepage), `about.html`, `blog.html` (/blog, labelled "Writing"), `lab.html`, `bookshelf.html`, `404.html`, `401.html`
- `lab/`: lab experiments with their own pages, e.g. `lab/sql-formatter.html` (SQLFluff in the browser via Pyodide; its Python lives in `assets/py/fluff.py`)
- `assets/files/.sqlfluff`: downloadable SQLFluff config for the SQL style guide. It's the single source of truth; the formatter fetches it too. Listed under `include:` because Jekyll skips dotfiles.
- `recipe_tracker/`: standalone app (own inline styles, Supabase), linked from the lab

### The asteroid (homepage)
Art direction: moody, realistic mid-century "Polynesian Pop" at night. The bar is the warm light source against deep space; cool moonlight is the key light; every warm tone comes from practicals (torches, pufferfish lamps, floats, neon, fire). Tiki signals, strongest first: carved tikis, a steep A-frame thatch roof, glass floats in nets, pufferfish lamps, bamboo, tiki mugs, tapa cloth, lava rock, torches, neon script. Tiki is an American pop fantasy: use invented pop-style tikis, never replicas of real sacred carvings, and no caricatured people.

Design rules, from Krug's *Don't Make Me Think* and Apple's HIG. Keep them when changing anything here:
- No start screen, splash, or instructions panel. The first frame shows the bar and its neon sign ahead, far enough that you have to walk.
- Site ID + tagline top-left and every section in the top bar at all times (a Menu button under 900px). Nobody is ever forced to walk to reach content.
- Click/tap where you want to go, drag to look. WASD/arrows and E are extras, never required.
- Clickable things look clickable without hover: the bar's floating "Sit at the bar" label and ring stay until the first time someone sits.
- One hint at a time, shown just in time, retired forever (localStorage `world-*`) once used.
- Plain labels in the menu (`label` in `_data/bar.yml`); themed drink names are secondary flavour only.
- Every state has a way back: × and Esc close panels, Esc/× leave the bar, the browser Back button closes panels (`#<id>` history entries), and deep links (`/#about`) open content directly.
- The camera never moves on its own: no intro flights, no idle sway. Respect reduced motion.
- Tap targets at least 44px.

Plain three.js ES modules in `assets/js/world/`, no bundler, no physics engine:
- `main.js`: panels, menu, top bar, history (works before and without 3D); then the renderer, picking (hover label + ground ring, click-to-walk, click-to-use), sitting and leaving, hints, bloom + grade post-processing (desktop only). `#world[data-state]` = loading | walk | seat | fallback.
- `planet.js`: radius-20 planet. `heightAt(dir)` is analytic, so terrain and the player's feet always agree. `place(obj, dir, {heading})` stands anything upright on the sphere; `dirFrom(polar, longitude)` addresses spots (the bar is at the north pole, facing longitude π/2). Also the atmosphere shell and instanced wind-blown grass.
- `player.js`: first-person controller on a sphere. Orientation is a quaternion that is parallel-transported to the new up vector every step; never `lookAt` with a fixed world up (it flips at the poles). Collisions are circles in the tangent plane. `walkTo(point)` auto-walks and turns you toward your path; timing uses simulation time, not wall clock. Input: one pointer vocabulary for mouse and touch (press without moving = tap, press and move = look), plus WASD/arrows and E/Enter.
- `bar.js`: Steve's, a classic A-frame tiki bar on a lava-rock plinth at the pole: carved tiki posts, steep thatched roof with an upswept ridge and Googie starburst, neon script sign in the gable, bamboo bar front, tapa-cloth back bar, floats and pufferfish lamps, volcano bowl, torches, the robot bartender, palms. `groundY(x, z)` gives the real ground height off the deck (the planet curves away). Seat pose and drink serving live here too: `serve(id)` has the robot shake at once, then at 0.9s slides a mug across the counter to your seat (placed directly under reduced motion); `greet()`/`farewell()` are called on sitting and leaving. `update(t, dt)`: `t` is ambient time (frozen by `?test`), `dt` real frame time for things the guest causes, so they still play under `?test`. `places.js`: the stepping-stone path with lanterns, rocket, telescope, campfire, dish, boat, and seeded scatter (`SPOTS` holds their positions). Interactables are `{ id, label, verb, object, point, approach, radius }`: click `object`, walk to `approach`, then use it.
- `robot.js`: the bartender, a 1950s tin-toy robot built from primitives: box head with a glowing Grog-o-Meter dial, glass dome and antenna, riveted teal-and-cream enamel, aloha shirt, lei and bow tie, jointed arms with pincers and a shaker, one wheel. Poses (rest, greet, shake, pour) are eased per joint; `greet(spot, guest)` rolls over and turns to face you; with reduced motion it snaps between poses and nothing moves on its own. A `robot` hero model can replace the body only.
- `sky.js`: dim fbm nebula dome, twinkling stars, ringed gas giant, moon, a cool distant star (the moonlight's source), shooting stars. Distant bodies set `fog: false`.
- `materials.js`: the palette (`PALETTE`) and every surface: procedural canvas textures (wood grain, bamboo, thatch, lava rock, tapa cloth, rattan, scuffed tin) on PBR materials, `enamel()` and `chrome()` for the robot, `glow()` for things that should bloom, `restyle()` for loaded Kenney models. Use these; don't introduce ad-hoc colours.
- `props.js`: procedural tiki props: carved tiki (a height-map face displaced into real geometry), glass floats in rope nets, pufferfish lamps, tiki mugs, volcano bowl, bamboo torches, palms with alpha-textured fronds, lava rocks, moai. `fire.js`: shader flames on crossed quads + flickering lights (`light: 0` = flame only).
- `render.js`: pmndrs `postprocessing` + `n8ao`: AO → HDR-only mipmap bloom (threshold 1) → AgX tone mapping → vignette + grain → SMAA. Phones skip AO, grain, and shadows.
- `hero.js`: optional hero props (AI-generated or hand-made GLBs) in `assets/models/hero/`, listed in `manifest.json`; each slot falls back to its procedural version. Slots, prompts, manifest options (`height`, `rotateY`, `roughness`, `tint`, `brightness`, `glow`) and specs: `tools/models/HERO_PROMPTS.md`; sources and licences: `tools/models/README.md`.
- Models: a few Kenney CC0 props (bottles, coconut, rocket parts, dish, boat, crystals, bushes) merged into `assets/models/props.glb` by `tools/build-models.mjs`. To add one, drop its GLB in `tools/models/<kit>/`, run `cd tools && npm install && npm run models`, then clone it with `prop('<kit>_<name>', scale)`.
- Content stays HTML: the top bar and menu items are `<a href>`s (JS intercepts them to open `<template id="panel-<id>">`, and serves a drink if you're seated), so it works without WebGL and is crawlable. Without WebGL2 the menu is the page.
- Testing hooks: `window.__sceneReady`, `window.__world` (state, player, SPOTS, bar, interactables, sitDown, leaveBar, pick), `?test=1` freezes ambient time, disables motion, and allows large time steps so walks finish under software rendering.
- Three.js is pinned in the import map in `_layouts/world.html`; bump it there and in the modulepreload together.

### Styling and scripts
- `assets/css/site.css`: the site-wide stylesheet (`assets/css/world.css` adds the homepage world on top). Colors are custom properties on `:root` with three themes: light (default), dark a.k.a. space (Milky Way background; system preference or chosen), terminal (chosen). New components should use the tokens, never raw colors.
- `assets/js/site.js`: theme cycling (auto → light → dark → terminal) and `window.nextLaunch()` / `window.tMinus()`, which fill any `[data-launch]` block (cached in localStorage for an hour; the API allows 15 requests/hour/IP). No jQuery.
- `assets/css/normalize.css` is kept only for `recipe_tracker/`.
- Fonts: Fraunces (display), Inter (body), JetBrains Mono (labels/code) from Google Fonts.

## Important Notes
- CNAME holds the custom domain; don't remove it.
- Post permalinks use Jekyll's default (`/YYYY/MM/DD/Title.html`); don't change them, they're linked externally.
- Use `relative_url` for internal links and assets.
- Non-site files (this file, README, Makefile, Gemfile, `tools/`) are in `exclude:` in `_config.yml` so they aren't published.
- Front matter values containing `: ` must be quoted, or Jekyll silently drops the layout (it only logs a YAML Exception).
