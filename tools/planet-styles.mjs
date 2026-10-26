// The house styles a friend's planet could be drawn in (My Tiny Planet, docs/planets.md), and
// pictures of the same few things in each, to choose one from (Steve, Oct 26: "i would like us to
// be consistent in what we produce"). Each thing is drawn as a picture first (Meshy text-to-image),
// the step that will keep every model in one style once a style is chosen. Pictures only: no 3D
// yet, a few credits each. Run by the Planet models workflow (`styles`), which has MESHY_API_KEY;
// the pictures go to tools/models/planets/styles/ (not published).
//
//   MESHY_API_KEY=... node tools/planet-styles.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { get, task, finished, balance } from './meshy.mjs';

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
  const failed = (await Promise.allSettled(jobs)).filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason));
  const after = await balance();
  console.log(`Meshy credits: ${after ?? '?'}${before != null && after != null ? ` (${before - after} spent)` : ''}`);
  if (failed.length) { for (const e of failed) console.log('::error::' + e); process.exit(1); }
}
