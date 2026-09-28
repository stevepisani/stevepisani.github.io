# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jekyll personal site for stevenpisani.com, built by GitHub Pages (the `github-pages` gem, so Jekyll 3.x and only whitelisted plugins). The homepage is a small walkable planet (Three.js): you land on an asteroid in first person, walk around, and sit at a tiki bar where you "order" the site's content from a menu. Every other page is a normal Jekyll page, and the non-3D homepage lives at `/classic`. No CSS framework and no build step beyond Jekyll.

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
Plain three.js ES modules in `assets/js/world/`, no bundler, no physics engine:
- `main.js`: renderer, loading gate, camera choreography (orbit → swoop down), modes (`#world[data-state]` = loading | gate | flying | walk | reading | seat | paused | fallback), interaction prompts, the order menu, panels, bloom + grade post-processing (desktop only).
- `planet.js`: radius-16 planet. `heightAt(dir)` is analytic, so terrain and the player's feet always agree. `place(obj, dir, {heading})` stands anything upright on the sphere; `dirFrom(polar, longitude)` addresses spots (the bar is at the north pole, facing longitude π/2). Also the atmosphere shell and instanced wind-blown grass.
- `player.js`: first-person controller on a sphere. Orientation is a quaternion that is parallel-transported to the new up vector every step; never `lookAt` with a fixed world up (it flips at the poles). Collisions are circles in the tangent plane. Input: WASD + pointer lock or drag, touch joystick (left) + look (right), E to interact.
- `bar.js`: the tiki bar, robot bartender, seat pose, drink serving. `places.js`: rocket, signpost, telescope, campfire, dish, boat, and seeded scatter (`SPOTS` holds their positions).
- `sky.js`: fbm nebula dome, twinkling stars, ringed planet, moon, sun, shooting stars. `stylize.js`: toon material with a cool shadow tint and warm rim; `toonify()` converts loaded models; `glowMat()` for things that should bloom. `textures.js`: canvas textures.
- Models: Kenney CC0 kits, merged into one `assets/models/props.glb` (meshopt, ~300 KB) by `tools/build-models.mjs`. To add a model, drop its GLB in `tools/models/<kit>/`, run `cd tools && npm install && npm run models`, then clone it in code with `prop('<kit>_<name>', scale)`.
- Content stays HTML: the gate has real links, the order menu items are `<a href>`s (JS intercepts them to serve a drink and open `<template id="panel-<id>">`), so it works without WebGL and is crawlable. Without WebGL2 the page falls back to the gate + menu. `/#bar` deep-links to the seat; `/#<menu id>` orders that item.
- Testing hooks: `window.__sceneReady`, `window.__world` (state, player, SPOTS, goSeat...), `?test=1` freezes time and disables motion.
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
