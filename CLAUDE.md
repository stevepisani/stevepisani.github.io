# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jekyll personal site for stevenpisani.com, built by GitHub Pages (the `github-pages` gem, so Jekyll 3.x and only whitelisted plugins). The homepage is a Three.js tiki bar floating in space; everything in the bar opens a panel of real site content (about, writing, bookshelf, lab, next launch, contact, résumé). Every other page is a normal Jekyll page, and the old homepage lives at `/classic`. No CSS framework and no build step beyond Jekyll.

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

- `_layouts/`: `default.html` (shell), `bar.html` (the homepage: import map for Three.js from jsDelivr, loads `bar.css` + `bar/main.js`), `page.html` (kicker/heading/lede header + prose; `wide: true` drops the prose width), `post.html`. Both shells share `_includes/head.html` (SEO via `{% seo %}`, fonts, site.css).
- `_includes/`: `nav.html`, `footer.html`, `launch.html` (next-launch card, Launch Library 2 API), `cover.html` (post cover, gradient fallback seeded by title), `post-row.html`, `lab-card.html`, `read_time.html`
- `_data/`: content lives here, edit these rather than HTML
  - `timeline.yml`: career timeline on /about
  - `lab.yml`: experiments on /lab (first three also appear on the homepage)
  - `books.yml`: shelves on /bookshelf
  - `bar.yml`: the bar's clickable spots (id, label, hint) and the robot bartender's lines
- `_posts/`: posts (layout defaults to `post`). Optional front matter: `image_url`, `description`
- Pages: `index.html` (the bar), `classic.html` (/classic, the non-3D homepage), `about.html`, `blog.html` (/blog, labelled "Writing"), `lab.html`, `bookshelf.html`, `404.html`, `401.html`
- `lab/`: lab experiments with their own pages, e.g. `lab/sql-formatter.html` (SQLFluff in the browser via Pyodide; its Python lives in `assets/py/fluff.py`)
- `assets/files/.sqlfluff`: downloadable SQLFluff config for the SQL style guide. It's the single source of truth; the formatter fetches it too. Listed under `include:` because Jekyll skips dotfiles.
- `recipe_tracker/`: standalone app (own inline styles, Supabase), linked from the lab

### The space tiki bar (homepage)
- `assets/js/bar/world.js`: builds the scene from primitives (no model files). Each clickable object is registered with `spot(id, object, anchor, view)`; `view` is the camera pose the bar flies to when that panel opens. Coordinates: deck at y = 0, bar faces +z.
- `assets/js/bar/textures.js`: every texture is drawn on a canvas (neon sign, chalkboard menu from real posts, pineapple shirt, tiki faces, planet).
- `assets/js/bar/main.js`: renderer, bloom (desktop only), OrbitControls with clamped angles, raycast picking, camera flights (wall-clock timed), panels, and the bartender's speech bubble.
- Panel content is HTML in `<template id="panel-<spot id>">` in `index.html`, so it's crawlable and works without WebGL. To add a spot: add it to `_data/bar.yml`, add a template, and register an object with `spot()` in world.js.
- `#bar[data-state]` is `loading | ready | fallback`. Fallback (no WebGL2 or an error) shows the spots as a plain menu. Phones (< 760px) dock the spots as a chip row instead of floating them. `/#<spot id>` deep-links to a panel.
- Three.js is pinned in the import map in `_layouts/bar.html`; bump the version there and in the modulepreload together.

### Styling and scripts
- `assets/css/site.css`: the site-wide stylesheet (`assets/css/bar.css` adds the homepage bar on top). Colors are custom properties on `:root` with three themes: light (default), dark a.k.a. space (Milky Way background; system preference or chosen), terminal (chosen). New components should use the tokens, never raw colors.
- `assets/js/site.js`: theme cycling (auto → light → dark → terminal) and `window.nextLaunch()` / `window.tMinus()`, which fill any `[data-launch]` block (cached in localStorage for an hour; the API allows 15 requests/hour/IP). No jQuery.
- `assets/css/normalize.css` is kept only for `recipe_tracker/`.
- Fonts: Fraunces (display), Inter (body), JetBrains Mono (labels/code) from Google Fonts.

## Important Notes
- CNAME holds the custom domain; don't remove it.
- Post permalinks use Jekyll's default (`/YYYY/MM/DD/Title.html`); don't change them, they're linked externally.
- Use `relative_url` for internal links and assets.
- Non-site files (this file, README, Makefile, Gemfile) are in `exclude:` in `_config.yml` so they aren't published.
