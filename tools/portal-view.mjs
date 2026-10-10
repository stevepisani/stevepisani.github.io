// The views through the doors, as panoramas their openings show (an equirectangular WebP whose
// centre column is straight through the opening; left of it, turned left):
//
//   node tools/portal-view.mjs sala          the place from where you come in, for the planet's
//                                            door (places.js)  →  assets/splats/sala-view.webp
//   node tools/portal-view.mjs sala --back   the planet from its door's step, looking back down
//                                            the trail, for the door back in the place (portal.js)
//                                                              →  assets/splats/sala-back.webp
//
// Six square views rendered by the real thing (dist/portal.js and Spark, or the built planet) in
// headless Chromium, then stitched. Run `npm run build` first (and Jekyll for --back). Software
// WebGL is slow: minutes. Run it again only when the splat, where you come in or the door moves;
// the WebPs are committed.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const place = process.argv[2] || 'sala';
const back = process.argv.includes('--back');
const FACE = 768, W = 2048, H = 1024;

// the repo (portal.js and the splats), or for --back the built site, served as Pages would
const dir = back ? join(root, '_site') : root;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  let p = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (back && existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(req.url === '/' ? 200 : 404, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0">'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: FACE, height: FACE }, reducedMotion: 'reduce' });
await context.route((url) => !url.href.startsWith(base), (route) => route.abort()); // offline, like the smoke test
const page = await context.newPage();
page.on('pageerror', (e) => console.error(e.message));
await page.goto(base + '/');
if (back) await page.waitForFunction(() => window.__world && window.__world.state === 'walk', null, { timeout: 600000 });
const webp = await page.evaluate(async ({ place, back, FACE, W, H }) => {
  const q = Math.PI / 2;
  // faces as [yaw, pitch] relative to straight through the opening
  const faces = [[0, 0], [q, 0], [2 * q, 0], [3 * q, 0], [0, q], [0, -q]];
  let snap, done = () => {};
  if (!back) {
    const { enter } = await import('/assets/js/dist/portal.js');
    const P = await enter(place, { reduce: true });
    while (!P.complete) await new Promise((r) => setTimeout(r, 1000)); // the full copy, not the light one
    snap = ([fy, fp]) => P.snapshot({ size: FACE, fov: 90, dir: [P.startYaw + fy, fp], frames: 5 });
    done = () => P.leave();
  } else {
    // the planet: stand at the door's step (so the sky and the lamps are where they'd be), then
    // stop the frame loop and pose the camera by hand at the step, turned round to the trail
    const w = window.__world, it = w.interactables.find((i) => i.id === 'door'), g = it.object;
    w.player.spawn(it.approach.clone().normalize(), it.point, 0);
    await new Promise((r) => setTimeout(r, 3000));
    w.renderer.setAnimationLoop(null);
    const V = g.position.constructor, Q = g.quaternion.constructor, cam = w.camera;
    g.updateMatrixWorld(true);
    const eye = g.localToWorld(new V(0, w.player.eye, 0.16));
    const out = g.getWorldQuaternion(new Q()).multiply(new Q().setFromAxisAngle(new V(0, 1, 0), Math.PI));
    cam.fov = 90; cam.aspect = 1; cam.updateProjectionMatrix();
    snap = async ([fy, fp]) => {
      cam.position.copy(eye);
      cam.quaternion.copy(out).multiply(new Q().setFromAxisAngle(new V(0, 1, 0), fy)).multiply(new Q().setFromAxisAngle(new V(1, 0, 0), fp));
      for (let i = 0; i < 3; i++) w.pipeline.render(1 / 60); // a few, for the post-processing to settle
      return w.renderer.domElement.toDataURL('image/png');
    };
  }
  const pixels = [];
  for (const f of faces) {
    const img = new Image();
    img.src = await snap(f);
    await img.decode();
    const c = new OffscreenCanvas(FACE, FACE), g = c.getContext('2d');
    g.drawImage(img, 0, 0, FACE, FACE);
    pixels.push(g.getImageData(0, 0, FACE, FACE).data);
  }
  await done();
  // each face's camera basis (rotateY(yaw) then rotateX(pitch), as the cameras are posed)
  const basis = faces.map(([a, p]) => {
    const ry = (v) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
    const rx = (v) => [v[0], v[1] * Math.cos(p) - v[2] * Math.sin(p), v[1] * Math.sin(p) + v[2] * Math.cos(p)];
    const R = (v) => ry(rx(v));
    return { f: R([0, 0, -1]), r: R([1, 0, 0]), u: R([0, 1, 0]) };
  });
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const out = new ImageData(W, H);
  for (let j = 0; j < H; j++) {
    const pitch = (0.5 - (j + 0.5) / H) * Math.PI;
    for (let i = 0; i < W; i++) {
      const yaw = (0.5 - (i + 0.5) / W) * 2 * Math.PI; // centre: straight through; left of it: turned left
      const d = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      let k = 0, best = -2;
      for (let n = 0; n < 6; n++) { const z = dot(d, basis[n].f); if (z > best) { best = z; k = n; } }
      const b = basis[k];
      const x = dot(d, b.r) / best, y = dot(d, b.u) / best;
      const px = Math.min(FACE - 1, Math.max(0, Math.floor((x + 1) / 2 * FACE)));
      const py = Math.min(FACE - 1, Math.max(0, Math.floor((1 - y) / 2 * FACE)));
      const s = (py * FACE + px) * 4, o = (j * W + i) * 4;
      out.data.set(pixels[k].subarray(s, s + 4), o);
    }
  }
  const c = new OffscreenCanvas(W, H);
  c.getContext('2d').putImageData(out, 0, 0);
  const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.82 });
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}, { place, back, FACE, W, H });
const file = `assets/splats/${place}-${back ? 'back' : 'view'}.webp`;
writeFileSync(root + file, Buffer.from(webp));
console.log(`${file}  ${(webp.length / 1024).toFixed(0)} KB`);
await browser.close();
server.close();
