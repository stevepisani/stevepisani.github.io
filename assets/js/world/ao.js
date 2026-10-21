// Ambient occlusion (N8AO), only for computers with the high-quality tier (render.js): its own
// bundle, dist/ao.js, loaded by URL so phones never download it. It uses the planet's own three.js
// and postprocessing, handed over by render.js (tools/build-js.mjs, the "ao-libs" plugin).
export { N8AOPostPass } from 'n8ao';
