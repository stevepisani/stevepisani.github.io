---
name: verify-world
description: See a change to the homepage planet working in a real browser, here in the sandbox or on the live site. Use after changing anything in assets/js/world/, the homepage, or its CSS, and before saying it works; covers the smoke test, screenshots from chosen spots, frame-by-frame motion, and the sandbox's network quirks.
---

# Verify the planet

The planet only exists in WebGL, so "it builds" proves little. Look at it.

## 1. The smoke test (always)

```bash
npm run build && bundle exec jekyll build --strict_front_matter && npm test
```

`tools/smoke.mjs` serves `_site` itself, refuses every request outside it (so it's offline and
never writes to Supabase), and drives the planet through `window.__world` with `?test=1` and
reduced motion: top bar panel, tap the bar, sit, menu, order, a drink made, leave, campfire,
hammock, skipping a stone, a bottle written and thrown, a coconut carried and thrown; desktop and
phone; plus every page and the no-WebGL fallback. About 5 minutes (SwiftShader). While iterating:
`node tools/smoke.mjs --only desktop --shots /path/in/scratchpad` and read the PNGs. If you add a
thing a visitor can do, add its step here and its hook to `window.__world` (`main.js`, listed in
`docs/world.md`).

## 2. Screenshots from where you choose

Write a small Playwright script in the scratchpad (not the repo), on the smoke test's pattern:
chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`,
`reducedMotion: 'reduce'`, `?test=1`, wait for `window.__sceneReady`. Then place the viewer:

```js
// stand at direction `dir` (a unit vector; SPOTS has the landmarks), looking at a world point
await page.evaluate(() => {
  const W = window.__world, V = W.camera.position.constructor;
  W.player.spawn(W.SPOTS.campfire.clone(), W.bar.group.localToWorld(new V(0, 2.6, 0)), /* pitch */ 0);
});
await page.waitForTimeout(2500); // a few software frames
await page.screenshot({ path: 'shot.png', timeout: 180000 });
```

- Bar-local coordinates: the bar sits at the north pole unrotated, so `bar.group.localToWorld()`
  maps (x, y, z) near it; `(polar, longitude)` addresses spots anywhere (`dirFrom` in `planet.js`).
- To look from above or any angle, override the camera each frame: wrap
  `W.pipeline.render` to set `W.camera.position` / `lookAt` before calling the original.
- Hide an HTML layer for a clean view: `document.getElementById('menu').style.visibility = 'hidden'`.
- Compare before and after side by side (PIL contact sheets) and zoom into the part that changed.
- A screenshot can take tens of seconds; give `page.screenshot` a long timeout.

## 3. Motion, frame by frame

Software WebGL runs a few frames a second, so a timed animation can't be watched live. Freeze time
and step it: `addInitScript` that replaces `performance.now` with a value you set
(`window.__freeze(ms)`), drop `?test=1` and reduced motion, start the motion, then set the clock
forward in steps (e.g. 100 ms), wait for a frame, and screenshot each; lay them out as a contact
sheet. That's how the camera moves (sitting down, the bottle ritual) were checked: continuous,
no jumps, and under 140°/s.

## 4. The live site

After a deploy, load https://stevenpisani.com/ the same way. Two sandbox quirks:

- **The browser can't use the sandbox's proxy** (TLS errors), but `curl` can. Route every https
  request through curl: `context.route(/^https:\/\//, ...)` running
  `curl -sSL -D <headers> -o <body> <url>` and `route.fulfill` with its status, body and
  content type. Node's own `fetch` / `WebSocket` work directly.
- **The browser can't open websockets** here at all, so the fireflies (Supabase Realtime presence)
  can't connect in it; check presence from Node instead: two `WebSocket`s to
  `wss://<ref>.supabase.co/realtime/v1/websocket?apikey=<anon>&vsn=1.0.0`, each `phx_join` on
  `realtime:planet` with a presence key, then `track`; each should see the other in
  `presence_state` / `presence_diff`.

The page count skips automated browsers (`navigator.webdriver`); to test it, override that in an
init script and check `rpc/pageviews_daily` with the anon key. Don't leave test rows behind
needlessly: one view is fine, a loop is not.

## Things that have bitten before

- A mesh wound the wrong way is culled and vanishes: anything built from a tangent frame needs
  `side × up` in the right order (the walk-to ring, trail ribbons, flagstones).
- Positions in camera space need `camera.updateMatrixWorld(true)` before projecting them in the
  same frame (the bottle's writing surface landed in the wrong place without it).
- `?test=1` freezes ambient time; things the guest causes run on real frame time (`realDt`), so
  they still play, slowly. Wait on state (`waitForFunction`), not on fixed sleeps.
- Rapier bodies on a slope never sleep on their own; `physics.js` drags and sleeps them. A body
  that never settles in a test is a real bug, not a slow machine.
