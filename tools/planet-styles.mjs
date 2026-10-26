// The house styles a friend's planet could be drawn in (My Tiny Planet, docs/planets.md), and
// pictures of the same few things in each, to choose one from (Steve, Oct 26: "i would like us to
// be consistent in what we produce"). Each thing is drawn as a picture first (Meshy text-to-image),
// the step that will keep every model in one style once a style is chosen, then the oven and the
// van are made into 3D from their pictures (image-to-3D, about 30 credits each), to see on a
// planet. Only what's missing is made. Run by the Planet models workflow (`styles`), which has MESHY_API_KEY;
// the pictures go to tools/models/planets/styles/ (not published).
//
//   MESHY_API_KEY=... node tools/planet-styles.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { get, task, finished, balance, optimize, IMAGE_TO_3D } from './meshy.mjs';

export const STYLES = {
  storybook: 'A storybook miniature: hand-painted textures, soft rounded forms, gentle exaggerated proportions, warm lamp light at night, like a Tiny Glade or Little Prince illustration come to life',
  realism: 'Moody realism at night: true-to-life materials and wear, warm practical lights against cool moonlight, like a film still',
  toy: 'A clean low-poly toy: flat colours, crisp simple shapes, no texture noise, soft even light, like Townscaper',
};
const THINGS = {
  oven: 'A Portuguese wood-fired bread oven: a whitewashed clay dome on a low stone base, an arched brick mouth with a fire glowing inside, loaves cooling on the ledge',
  bench: 'A weathered wooden bench with a sack of flour leaning on it',
  van: 'A white high-roof camper van with an orange stripe and a roof rack',
};
const MODELLED = ['oven', 'van'];
const FRAME = 'One object alone, seen from the front and a little above, three-quarter view, whole object in frame, plain background';
const IMAGE = 'https://api.meshy.ai/openapi/v1/text-to-image';

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = fileURLToPath(new URL('models/planets/styles/', import.meta.url));
  mkdirSync(out, { recursive: true });
  const before = await balance();
  const jobs = [];
  for (const [style, words] of Object.entries(STYLES)) for (const [thing, what] of Object.entries(THINGS)) {
    const file = `${out}${style}-${thing}.png`;
    if (existsSync(file)) continue;
    jobs.push((async () => {
      const id = await task({ ai_model: 'nano-banana-2', prompt: `${what}. ${words}. ${FRAME}.`, aspect_ratio: '1:1' }, IMAGE);
      const done = await finished(id, `${style} ${thing}`, IMAGE);
      writeFileSync(file, Buffer.from(await (await get(done.image_urls[0])).arrayBuffer()));
      console.log(`${style}-${thing}.png (${done.consumed_credits ?? '?'} credits)`);
    })());
  }
  await Promise.allSettled(jobs);
  // then 3D from the pictures
  for (const [style] of Object.entries(STYLES)) for (const thing of MODELLED) {
    const png = `${out}${style}-${thing}.png`, glb = `${out}${style}-${thing}.glb`;
    if (!existsSync(png) || existsSync(glb)) continue;
    jobs.push((async () => {
      const image_url = 'data:image/png;base64,' + readFileSync(png).toString('base64');
      const id = await task({ image_url, ai_model: 'latest', topology: 'triangle', target_polycount: 30000, should_remesh: true, should_texture: true, enable_pbr: true }, IMAGE_TO_3D);
      const done = await finished(id, `${style} ${thing} 3D`, IMAGE_TO_3D);
      const raw = `${out}${style}-${thing}.raw.glb`;
      writeFileSync(raw, Buffer.from(await (await get(done.model_urls.glb)).arrayBuffer()));
      optimize(raw, glb, 1024);
      rmSync(raw);
      console.log(`${style}-${thing}.glb`);
    })());
  }
  const failed = (await Promise.allSettled(jobs)).filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason));
  const after = await balance();
  console.log(`Meshy credits: ${after ?? '?'}${before != null && after != null ? ` (${before - after} spent)` : ''}`);
  if (failed.length) { for (const e of failed) console.log('::error::' + e); process.exit(1); }
}
