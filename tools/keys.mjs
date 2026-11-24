// Renders the buttons laid over the planet: an arcade button modelled and lit in three.js (a
// dished plunger in a chrome collar, seen from a little below), resting and pressed, in each
// colour, as small pictures world.css stretches to any width with border-image. Run it again
// only when the button's shape or colours change, and commit what it writes.
//
//   node tools/keys.mjs     → assets/images/keys/<colour>.webp and <colour>-down.webp
//
// The numbers world.css depends on (see "Keys" there): a face 44 px high with half-round ends,
// a 40 px stretch between them, and 18 px of room all round for the collar and the tilt, so a
// picture is 120 × 80 CSS px (drawn at 3×) and its border-image slice is 40 px (120 in the file).
import { build } from 'esbuild';
import { chromium } from './chromium.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COLOURS = { cream: '#f3e6cb', coral: '#e2452a' }; // cream by default, coral for the main thing to do
const root = fileURLToPath(new URL('..', import.meta.url));

const js = (await build({
  stdin: {
    resolveDir: root,
    contents: `
      import * as THREE from 'three';
      import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
      const R = 22, L = 40, PAD = 18, W = L + 2 * R + 2 * PAD, H = 2 * R + 2 * PAD, K = 3, TILT = 30 * Math.PI / 180;
      const RISE = 13, DOWN = 5.5, COLLAR = 5; // how far the plunger stands out, resting and pressed, and the collar's height
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(W * K, H * K, false);
      renderer.setClearColor(0, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.95;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
      // from a little below, so the plunger's wall shows under its face; shifted so the resting face sits on the button's own box
      const shift = RISE * Math.sin(TILT);
      const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2 + shift, -H / 2 + shift, -500, 500);
      cam.position.set(0, -Math.sin(TILT) * 100, Math.cos(TILT) * 100);
      cam.lookAt(0, 0, 0);

      // A stadium-shaped solid: half-length l, radius r, a top surface z = profile(s) (s = 0 on the
      // centre line, 1 at the edge), then a wall straight down to z = 0.
      function stadium(l, r, profile, rings = 28, around = 96) {
        const per = [], q = around / 4; // the perimeter: each point's centre and outward direction
        for (let i = 0; i <= 2 * q; i++) { const a = -Math.PI / 2 + Math.PI * i / (2 * q); per.push([l, Math.cos(a), Math.sin(a)]); }
        for (let i = 0; i <= 2 * q; i++) { const a = Math.PI / 2 + Math.PI * i / (2 * q); per.push([-l, Math.cos(a), Math.sin(a)]); }
        const n = per.length, pos = [], idx = [], ss = [];
        for (let j = 0; j <= rings; j++) ss.push(Math.sin(Math.PI / 2 * j / rings)); // finer near the edge
        for (let j = 0; j <= rings; j++) for (const [c, dx, dy] of per) pos.push(c + r * ss[j] * dx, r * ss[j] * dy, profile(ss[j]));
        for (const [c, dx, dy] of per) pos.push(c + r * dx, r * dy, 0); // the foot of the wall
        const at = (j, k) => j * n + (k % n);
        for (let j = 0; j <= rings; j++) for (let k = 0; k < n; k++) { const a = at(j, k), b = at(j, k + 1), c = at(j + 1, k), d = at(j + 1, k + 1); idx.push(a, c, b, b, c, d); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      }
      const quarter = (x) => 1 - Math.sqrt(Math.max(0, 1 - x * x)); // a rounded shoulder: 0 at x = 0, 1 at x = 1
      // the plunger: a flat top with a rounded shoulder and a dish in the middle
      const dish = (h) => (s) => h - 4 * quarter(Math.max(0, (s - (1 - 4 / R)) / (4 / R))) - 4.5 * Math.max(0, 1 - (s / 0.8) ** 2) ** 1.3;
      // the collar: a ring round a well the plunger sits in, rounded on the outside
      const RING = R + 7.5, inner = (R + 1.6) / RING;
      const collar = (s) => s < inner ? 0.6 : s < inner + 0.04 ? 0.6 + (COLLAR - 0.6) * (s - inner) / 0.04 : COLLAR - 3.2 * quarter(Math.max(0, (s - 0.86) / 0.14));

      window.key = (color, pressed) => {
        const scene = new THREE.Scene();
        scene.environment = env;
        scene.environmentIntensity = 0.55;
        const key = new THREE.DirectionalLight(0xffffff, 2.6);
        key.position.set(-40, 90, 120);
        const rim = new THREE.DirectionalLight(0xffe2c0, 0.8);
        rim.position.set(60, -40, 60);
        const all = new THREE.Group();
        all.add(
          new THREE.Mesh(stadium(L / 2, RING, collar, 60), new THREE.MeshPhysicalMaterial({ color: '#f1f2f6', metalness: 1, roughness: 0.14 })),
          new THREE.Mesh(stadium(L / 2, R + 1.5, () => 0.8), new THREE.MeshBasicMaterial({ color: '#050507' })), // the well's dark floor
          new THREE.Mesh(stadium(L / 2, R - 0.4, dish(pressed ? DOWN : RISE)), new THREE.MeshPhysicalMaterial({ color, roughness: 0.26, clearcoat: 0.45, clearcoatRoughness: 0.12, envMapIntensity: 0.42 })),
        );
        all.scale.y = 1 / Math.cos(TILT); // so the tilted face still measures 2R on screen
        scene.add(key, rim, all);
        renderer.render(scene, cam);
        return renderer.domElement.toDataURL('image/webp', 0.9);
      };`,
  },
  bundle: true, write: false, format: 'iife', logLevel: 'error',
})).outputFiles[0].text;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.addScriptTag({ content: js });
const dir = root + 'assets/images/keys/';
mkdirSync(dir, { recursive: true });
for (const [name, color] of Object.entries(COLOURS)) for (const pressed of [false, true]) {
  const out = `${dir}${name}${pressed ? '-down' : ''}.webp`;
  const url = await page.evaluate(([c, p]) => window.key(c, p), [color, pressed]);
  if (!url.startsWith('data:image/webp')) throw new Error('this browser wrote no WebP');
  writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log(out);
}
await browser.close();
