// The view through the door: a panorama of a place (portal.js PLACES), from where you come in,
// that the door on the planet shows in its opening (places.js), so it looks out onto daylight
// before anyone steps through. Six square views rendered by the real thing (dist/portal.js, Spark)
// in headless Chromium, stitched into one equirectangular WebP whose centre column is the way
// you face as you come in. Software WebGL is slow with a million splats: a few minutes.
//
//   npm run build && node tools/portal-view.mjs sala   →  assets/splats/sala-view.webp
//
// Run it again only when the splat or where you come in changes; the WebP is committed.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const place = process.argv[2] || 'sala';
const FACE = 768, W = 2048, H = 1024;

// the repo itself, served: /assets/js/dist/portal.js and /assets/splats/*
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(req.url === '/' ? 200 : 404, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0">'); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript' }[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: FACE, height: FACE } });
page.on('pageerror', (e) => console.error(e.message));
await page.goto(base + '/');
const webp = await page.evaluate(async ({ place, FACE, W, H }) => {
  const { enter } = await import('/assets/js/dist/portal.js');
  const P = await enter(place, { reduce: true });
  const y0 = P.startYaw, q = Math.PI / 2;
  // faces as [yaw, pitch] relative to the way you face coming in
  const faces = [[0, 0], [q, 0], [2 * q, 0], [3 * q, 0], [0, q], [0, -q]];
  const pixels = [];
  for (const [fy, fp] of faces) {
    const img = new Image();
    img.src = await P.snapshot({ size: FACE, fov: 90, dir: [y0 + fy, fp], frames: 5 });
    await img.decode();
    const c = new OffscreenCanvas(FACE, FACE), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    pixels.push(g.getImageData(0, 0, FACE, FACE).data);
  }
  await P.leave();
  // each face's camera basis (rotateY(yaw) then rotateX(pitch), as portal.js poses the camera)
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
      const yaw = (0.5 - (i + 0.5) / W) * 2 * Math.PI; // centre: straight ahead; left of it: turned left
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
}, { place, FACE, W, H });
const file = `assets/splats/${place}-view.webp`;
writeFileSync(root + file, Buffer.from(webp));
console.log(`${file}  ${(webp.length / 1024).toFixed(0)} KB`);
await browser.close();
server.close();
