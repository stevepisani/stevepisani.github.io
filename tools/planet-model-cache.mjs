// Reproducible inputs and resumable task state for the offline asset producer. No API calls.
import { createHash, randomUUID } from 'node:crypto';

import {STYLE_NAME, STYLE, FRAME, pictureTask} from '../supabase/functions/_shared/planet-models.js';
export {STYLE_NAME};
const STYLE_VERSION = 1;
export const MODEL_SETTINGS = Object.freeze({ ai_model: 'meshy-7.1', topology: 'triangle', target_polycount: 30000, should_remesh: true, should_texture: true, enable_pbr: true, target_formats: ['glb'] });
export const digest = (value) => createHash('sha256').update(value).digest('hex');

export function modelSource(words) {
  const picture = pictureTask(words);
  return { inputId: digest(JSON.stringify({ words, style: STYLE, version: STYLE_VERSION, picture, model: MODEL_SETTINGS })), picture };
}

// Grandfather complete legacy assets. A cache migration must not buy an entire replacement
// library. Newly produced records match every input; explicit redo can replace a legacy asset.
export function currentModel(rec, words) {
  return rec?.model === words && rec.style === STYLE_NAME && (!rec.inputId || rec.inputId === modelSource(words).inputId);
}

export function pendingModel(rec, words, redo = false) {
  const { inputId, picture } = modelSource(words);
  if (rec.pending?.inputId === inputId) return rec.pending;
  // Never associate a new description with a legacy slug/id PNG or an unidentified task.
  return rec.pending = { inputId, pictureRequest: picture, ...(redo ? { redo: true, attempt: randomUUID() } : {}) };
}

export function pictureName(pending) {
  return `${pending.inputId}${pending.attempt ? '-' + pending.attempt : ''}.png`;
}
