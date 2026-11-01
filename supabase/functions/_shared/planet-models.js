// The house style of the real models on friends' planets (My Tiny Planet, docs/planets.md), and how
// each is asked of Meshy: one place, for the Planet models workflow (tools/planet-models.mjs) and
// for the models made while the chat waits (supabase/functions/planets/models.js). Steve chose the
// style on Oct 27, 2026: "lock it in and have it as our style". Change it and every model is made
// again. Plain JavaScript, so Node, Deno and the browser all read it.

export const STYLE_NAME = 'storybook';
export const STYLE = 'A storybook miniature: hand-painted textures, soft rounded forms, gentle exaggerated proportions, warm and cosy, like a Tiny Glade or Little Prince illustration come to life';
export const FRAME = 'One object alone on a plain white background, with no ground, no base, no plinth and no shadow under it, no text and no logos; seen from the front and a little above, three-quarter view, the whole object in frame';

export const TEXT_TO_IMAGE = 'https://api.meshy.ai/openapi/v1/text-to-image';
export const IMAGE_TO_3D = 'https://api.meshy.ai/openapi/v1/image-to-3d';

/** What Meshy is asked for the picture of a thing, from its words. */
export const pictureTask = (words) => ({ ai_model: 'nano-banana-2', prompt: `${words}. ${STYLE}. ${FRAME}.`.slice(0, 1000), aspect_ratio: '1:1' });
/** What Meshy is asked for the model, from the picture (a URL, or a data: URL). */
export const modelTask = (image_url) => ({ image_url, ai_model: 'latest', topology: 'triangle', target_polycount: 30000, should_remesh: true, should_texture: true, enable_pbr: true });

/**
 * The name of the model a thing's words make in the house style: the same words make the same
 * model, on any planet, so it's made once. 32 hex characters of SHA-256.
 */
export async function modelKey(words) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${STYLE_NAME}\n${words}`)));
  return [...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Where a planet asks how the models made while the chat waits are coming: ?models=<key>,<key>. */
export const MODELS_URL = 'https://mcp.stevenpisani.com/planets';
