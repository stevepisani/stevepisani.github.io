// Draws one stand-in from assets/js/walk/sets.js on white, as the picture Meshy builds a model
// from when text alone gets the shape wrong (`image` in tools/models/gauge.json; image-to-3D in
// tools/gauge-assets.mjs). The shape is ours, so the picture is too; Meshy adds the materials from
// the model's `texture` words.
//
//   node tools/model-ref.mjs chariot     → tools/models/chariot.png
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
const root = fileURLToPath(new URL('..', import.meta.url));
const fn = name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const js = (await build({
  stdin: {
    resolveDir: root,
    contents: `
      import * as THREE from 'three';
      import * as sets from './assets/js/walk/sets.js';
      const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide, ...o });
      // plain, believable colours: oak, red-painted wood, dark iron, bronze
      // (the paint: the chariot's red, the Rocket's yellow)
      const paint = ${JSON.stringify(name)} === 'locomotive' ? 0xe0b02a : 0x9c2a1c;
      const M = { wood: std(0x8a5f3a), paint: std(paint), iron: std(0x3a3a3c, { metalness: 0.5, roughness: 0.5 }), brass: std(0xb0853a, { metalness: 0.7, roughness: 0.4 }), horse: std(0x6b3f22), mane: std(0x2a1a10), white: std(0xf2f0ea), stone: std(0xb9ad97), hay: std(0xd9b46a), boxcar: std(0x7a3524), steel: std(0x9a9ea3, { metalness: 0.5, roughness: 0.4 }), coal: std(0x1c1b1a) };
      let thing;
      sets[${JSON.stringify(fn)}](M).traverse((o) => { if (o.userData.slot === ${JSON.stringify(name)}) thing = o; });
      thing.parent?.remove(thing); // the Rocket and the flatcar are slots themselves
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      scene.add(thing, new THREE.HemisphereLight(0xffffff, 0x8a8070, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(-3, 5, 4);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xffffff, 0.9); // from the camera's side, so no face is black
      fill.position.set(4, 2, 3);
      scene.add(fill);
      const box = new THREE.Box3().setFromObject(thing), mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.copy(mid).add(new THREE.Vector3(0.75, 0.5, 0.9).normalize().multiplyScalar(size * 2.2));
      camera.lookAt(mid);
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1024, 1024);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.render(scene, camera);
      window.png = renderer.domElement.toDataURL('image/png');`,
  },
  bundle: true, write: false, format: 'iife', logLevel: 'error',
})).outputFiles[0].text;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.addScriptTag({ content: js });
const png = await page.evaluate(() => window.png);
await browser.close();
const out = root + `tools/models/${name}.png`;
writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
console.log(out);
