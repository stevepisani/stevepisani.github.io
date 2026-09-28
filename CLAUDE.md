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
  - `drinks.yml`: favorite drinks and recipes (name, origin, glass, build, method, note): the chalkboard behind the bar, the "Favorite drinks" panel, and /drinks. Starts with three classics as placeholders to replace
  - `bar.yml`: the homepage's menu (label, a one-line note on what's there, fallback href), the bartender's lines, and the campfire list
- `_posts/`: posts (layout defaults to `post`). Optional front matter: `image_url`, `description`
- Pages: `index.html` (the asteroid), `classic.html` (/classic, the non-3D homepage), `about.html`, `blog.html` (/blog, labelled "Writing"), `lab.html`, `bookshelf.html`, `drinks.html` (/drinks, recipes via `_includes/drinks.html`), `404.html`, `401.html`
- `lab/`: lab experiments with their own pages, e.g. `lab/sql-formatter.html` (SQLFluff in the browser via Pyodide; its Python lives in `assets/py/fluff.py`)
- `assets/files/.sqlfluff`: downloadable SQLFluff config for the SQL style guide. It's the single source of truth; the formatter fetches it too. Listed under `include:` because Jekyll skips dotfiles.
- `recipe_tracker/`: standalone app (own inline styles, Supabase), linked from the lab

### The asteroid (homepage)
Art direction: moody, realistic mid-century "Polynesian Pop" at night. The bar is the warm light source against deep space; cool moonlight is the key light; every warm tone comes from practicals (torches, pufferfish lamps, floats, neon, fire). Tiki signals, strongest first: carved tikis, a steep A-frame thatch roof, glass floats in nets, pufferfish lamps, bamboo, tiki mugs, tapa cloth, lava rock, torches, neon script. Tiki is an American pop fantasy: use invented pop-style tikis, never replicas of real sacred carvings, and no caricatured people.

Design rules, from Krug's *Don't Make Me Think* and Apple's HIG. Keep them when changing anything here:
- No start screen, splash, or instructions panel. The first frame shows the bar and its neon sign ahead, far enough that you have to walk.
- Site ID + tagline top-left and every section in the top bar at all times (a Menu button under 1040px, where seven sections would wrap). Nobody is ever forced to walk to reach content.
- Click/tap where you want to go, drag to look. WASD/arrows and E are extras, never required.
- Clickable things look clickable without hover. The bar needs no label: it's the lit, open thing at the end of the path with its neon sign readable from where you land, your stool sits in a pool of light from a pendant lamp, and the bartender turns and waves as you walk up. The menu card's "Pick up the menu" label stays until the first time someone picks it up.
- One hint at a time, shown just in time, retired forever (localStorage `world-*`) once used.
- The menu is an old-school tiki menu (bamboo frame, parchment, tapa band, "Steve's" in script) with plain labels (`label` in `_data/bar.yml`) and one line each saying what's there (`note`). No filler text: no prices, no made-up drink names, nothing decorative that's words.
- Every state has a way back: × and Esc close panels; at the bar × and Esc put the menu back down, then Esc or "Leave the bar" (in the menu, or bottom-left when it's down) leave; the browser Back button closes panels (`#<id>` history entries), and deep links (`/#about`) open content directly.
- The camera never moves on its own: no intro flights, no idle sway. Respect reduced motion.
- The point of view is continuous: sitting down and getting up are first-person body motions (`flyPath` in `main.js`: one eased curve through a few poses in `bar.seat`) that start from and end in the exact walking view. Keep them unhurried; getting up turns you around, so it takes about 4 s and the turn peaks near 140°/s.
- Tap targets at least 44px.

Plain three.js ES modules in `assets/js/world/`, no bundler, no physics engine:
- `main.js`: panels, menu, top bar, history (works before and without 3D); then the renderer, picking (hover label + ground ring, click-to-walk, click-to-use), sitting and leaving, hints, bloom + grade post-processing (desktop only). `#world[data-state]` = loading | walk | seat | camp | fallback.
- `planet.js`: radius-20 planet. `heightAt(dir)` is analytic, so terrain and the player's feet always agree. The visible terrain is a fine cube-sphere (about 0.3 m between vertices on desktop, 0.5 m on phones) with analytic normals and triplanar grain and bump from `textures.js` `groundDetail()`, worn to soil beside the trails; picking uses a coarse invisible copy named `ground` (clicks only need a direction). `place(obj, dir, {heading})` stands anything upright on the sphere; `dirFrom(polar, longitude)` addresses spots (the bar is at the north pole, facing longitude π/2). Also the atmosphere shell, instanced wind-blown grass tufts and pebbles, kept off trails and landmarks (`keepClear` from `places.js`).
- `player.js`: first-person controller on a sphere. Orientation is a quaternion that is parallel-transported to the new up vector every step; never `lookAt` with a fixed world up (it flips at the poles). Collisions are circles in the tangent plane, tested only against colliders that are actually nearby in 3D (flattened onto the tangent plane, things on the far side of the planet land under your feet). `walkTo(point)` auto-walks and turns you toward your path; timing uses simulation time, not wall clock. Input: one pointer vocabulary for mouse and touch (press without moving = tap, press and move = look), plus WASD/arrows and E/Enter.
- `bar.js`: Steve's, a classic A-frame tiki bar on a lava-rock plinth at the pole: carved tiki posts, steep thatched roof with an upswept ridge and Googie starburst, neon script sign in the gable, bamboo bar front, tapa-cloth back bar with a chalkboard of favorite drinks hung where you see it from your stool (click it for the recipes), floats and pufferfish lamps, volcano bowl, torches, the robot bartender, palms. `groundY(x, z)` gives the real ground height off the deck (the planet curves away). Seat pose and drink serving live here too: `serve(id)` has the robot shake at once, then at 0.9s slides a mug across the counter to your seat (placed directly under reduced motion); `greet()`/`farewell()` are called on sitting and leaving. `update(t, dt)`: `t` is ambient time (frozen by `?test`), `dt` real frame time for things the guest causes, so they still play under `?test`. `places.js`: the trail network (`TRAILS`: a flagstone walk from where you land to the bar, gravel trails from its fork to the rocket, telescope, boat and dish, and on round the back to the campfire, with lanterns on the long ones), your Saturn V (`rocket.js`) on a lava-rock landing pad with chasing edge lights and floodlights up the hull, a brass refractor telescope on a wooden tripod, the campfire (`camp.js`), dish, boat, and seeded scatter (kept off the trails) (`SPOTS` holds their positions). Interactables are `{ id, label, verb, object, point, approach, radius }`: click `object`, walk to `approach`, then use it.
- `rocket.js`: the Saturn V, procedural at real proportions (a little stouter than life): a lathe body (S-IC, S-II, S-IVB, instrument unit, adapter, service and command modules) with UVs by height, so one canvas paints the livery in metres (black-and-white roll pattern, "USA" and a flag on the first stage, the SJPJr badge from the favicon on the second, drawn in once the image loads); five F-1 bells, fairings and fins; the launch escape tower. `faceBadge(x, z)` turns it so the badge faces the path. `launcher()` adds the deck with hold-down arms and the red umbilical tower (instanced lattice, swing arms that reach the hull at each height, hammerhead crane, blinking warning light).
- `camp.js`: the campfire, Outer Wilds style. `buildCampfire()`: lava-rock ring, glowing coals, a log teepee (turned so no log stands end-on in front of you), two flames, sparks, log benches, the moai, a bag of marshmallows; `seatToward(x, z)` puts your bench toward the trail and returns the seat poses. `createRoaster(camera)`: the stick you hold (on the camera, so it follows your look); press and hold (Space on keyboards) reaches it into the flame, it toasts by distance to the hot spot (cream, golden, brown, black), catches fire past dark brown, and `eat()` gives a `verdict()`; each marshmallow comes with a line from `likes` in `_data/bar.yml`. In `main.js`, `sitAtFire()`/`leaveFire()` use the same continuous `flyPath` body motion as the bar; "Eat it" (or "Blow it out") bottom-right, "Leave the fire" bottom-left, Esc leaves; the roast hint retires once something's toasted.
- `paths.js`: trails built vertex by vertex on the analytic surface, so nothing floats or sinks: `sampleTrail(points)` (a smooth, gently meandering curve), a crushed-shell gravel ribbon with ragged edges (`trailTexture()`), flagstones draped on the terrain (top a few cm proud, sides running into the ground), pebble borders, lantern spots, and `trailEdgeFn()` (distance to the nearest trail edge, for grass, scatter and ground wear). Triangles must face outward: a ribbon or slab wound the other way is culled and vanishes.
- `decor.js`: the layered density real tiki bars have (from Smuggler's Cove, Three Dots and a Dash, Trader Vic's, Tiki-Ti): a backlit rum wall (instanced lathe bottles with labels and caps) on every shelf, crossed paddles and a carved mask on the tapa, a sagging net of glass floats under the roof, a grass fringe and festoon bulbs on the front beam, rope trim on the bar top, the robot's station (citrus, tins, jigger, bitters, swizzles and umbrellas, towel), and monstera, red ti and fern beds around the plinth (entrance left open). Repeats are instanced and it adds no lights, so phones pay little. Leaves, net and rope textures live in `textures.js`.
- `robot.js`: the bartender, a 1950s tin-toy robot built from primitives: box head with a glowing Grog-o-Meter dial, glass dome and antenna, riveted teal-and-cream enamel, aloha shirt, lei and bow tie, jointed arms with pincers and a shaker, one wheel. Poses (rest, greet, shake, pour) are eased per joint; `beckon(guest)` turns and waves as you walk up; `greet(spot, guest)` rolls over and turns to face you when you sit; with reduced motion it snaps between poses and nothing moves on its own. A `robot` hero model can replace the body only.
- `sky.js`: dim fbm nebula dome, twinkling stars, a cool distant star (the moonlight's source), shooting stars, and two bodies lit by that star in their own shaders: a ringed gas giant (warped turbulent bands, a storm, soft terminator, limb darkening, rings and globe shadowing each other) low on the left as you land, and a cratered moon (`textures.js` `moonMaps()`, Lommel-Seeliger shading, earthshine) up on the right. Physics decides the phase: near the star in the sky means a crescent, so place them by angle to `sunDir`. Distant bodies set `fog: false`.
- `materials.js`: the palette (`PALETTE`) and every surface: procedural canvas textures (wood grain, bamboo, thatch, lava rock, tapa cloth, rattan, scuffed tin) on PBR materials, `enamel()` and `chrome()` for the robot, `glow()` for things that should bloom, `restyle()` for loaded Kenney models. Use these; don't introduce ad-hoc colours.
- `props.js`: procedural tiki props: carved tiki (a height-map face displaced into real geometry), glass floats in rope nets, pufferfish lamps, tiki mugs, volcano bowl, bamboo torches, palms with alpha-textured fronds, lava rocks, moai. `fire.js`: shader flames on crossed quads + flickering lights (`light: 0` = flame only).
- `render.js`: pmndrs `postprocessing` + `n8ao`: AO → HDR-only mipmap bloom (threshold 1) → AgX tone mapping → vignette + grain → SMAA. Phones skip AO, grain, and shadows.
- `hero.js`: optional hero props (AI-generated or hand-made GLBs) in `assets/models/hero/`, listed in `manifest.json`; each slot falls back to its procedural version. Slots, prompts, manifest options (`height`, `rotateY`, `roughness`, `tint`, `brightness`, `glow`) and specs: `tools/models/HERO_PROMPTS.md`; sources and licences: `tools/models/README.md`.
- Models: a few Kenney CC0 props (bottles, coconut, dish, boat, crystals, bushes; the rocket parts are unused now) merged into `assets/models/props.glb` by `tools/build-models.mjs`. To add one, drop its GLB in `tools/models/<kit>/`, run `cd tools && npm install && npm run models`, then clone it with `prop('<kit>_<name>', scale)`.
- Content stays HTML: the top bar and menu items are `<a href>`s (JS intercepts them to open `<template id="panel-<id>">`, and serves a drink if you're seated), so it works without WebGL and is crawlable. Without WebGL2 the menu is the page. Once the panels are in charge, `main.js` points those links at `#<id>` (their real hrefs, some outbound: the résumé on Google Drive, mailto:) and `fallback()` restores them, so nothing in the menu or the drink animation ever leaves the page; the no-WebGL menu marks its outbound items ↗. Outbound links inside panels say where they go ("on Google Drive ↗").
- Ordering at the bar (`order()` in `main.js`): choosing an item puts the menu back down so you can watch the robot shake the drink and slide it over (`bar.serve(id, onServed)`), then the mug lifts to you, tipped so you look into the drink, and the section's panel pours open out of the mug's mouth (`.panel.is-pouring`, a clip-path circle from `--ox/--oy`). Closing it sets the mug back down and the menu comes back up. Drinks come in the tiki mug (open top, so there's a drink to look into), coloured per section; the parrot and pineapple mugs dress the counter and shelf. Reduced motion skips the flights.
- At the bar the menu is a real card on the counter (`bar.menu`, drawn by `textures.js` `menuCard()` from the same items as the HTML menu). Sitting down leaves it there; clicking it (or E/Enter, or the Menu button) picks it up: `main.js` flies the 3D card to the exact rectangle the HTML menu will fill, facing the camera, then fades the HTML menu in over it. × / Esc fly it back down. Clicking the card from anywhere walks you over, sits you down and picks it up. The camera never moves for this; reduced motion skips the flight.
- Testing hooks: `window.__sceneReady`, `window.__world` (state, menuHeld, cardFlying, cameraFlying, player, SPOTS, bar, interactables, sitDown, leaveBar, pickUpMenu, putDownMenu, pick, sitAtFire, leaveFire, eatIt, roaster, roast), `?test=1` freezes ambient time, disables motion, and allows large time steps so walks finish under software rendering. Under SwiftShader, emulate `prefers-reduced-motion` too: CSS fades barely advance while WebGL frames take seconds.
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
