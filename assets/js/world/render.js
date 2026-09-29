// Rendering pipeline: pmndrs postprocessing + N8AO.
//
//   scene → N8AO ambient occlusion → bloom (HDR only, mipmap blur) → AgX tone mapping
//         → vignette + fine grain → SMAA
//   then `overlay`, drawn untouched on top: things that must look exactly like the page (the menu
//   card in your hands, which the HTML menu takes over from).
//
// Phones and weak GPUs get a lighter tier: no AO, cheaper bloom, no grain.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, NoiseEffect, SMAAEffect, BlendFunction,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export function createPipeline(renderer, scene, camera, { high }) {
  // postprocessing does its own tone mapping at the end of the chain
  renderer.toneMapping = THREE.NoToneMapping;
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  let ao = null;
  if (high) {
    ao = new N8AOPostPass(scene, camera, 1, 1);
    Object.assign(ao.configuration, {
      aoRadius: 1.1,          // metres; the props are small
      distanceFalloff: 0.8,
      intensity: 2.6,
      color: new THREE.Color(0x0a0604), // warm-dark occlusion, not grey
      gammaCorrection: false, // the chain handles colour
      halfRes: false,
    });
    ao.setQualityMode('Medium');
    composer.addPass(ao);
  }

  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: 1.0,   // only HDR emissives (flames, neon, lamps) bloom
    luminanceSmoothing: 0.25,
    intensity: high ? 1.35 : 1.0,
    radius: 0.72,
  });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.62 });
  const effects = [bloom, tone, vignette];
  if (high) {
    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
    grain.blendMode.opacity.value = 0.12;
    effects.push(grain);
  }
  composer.addPass(new EffectPass(camera, ...effects));
  composer.addPass(new EffectPass(camera, new SMAAEffect()));

  const overlay = new THREE.Scene();
  return {
    composer,
    overlay,
    setSize(w, h) {
      composer.setSize(w, h);
      if (ao) ao.setSize(w, h);
    },
    render(dt) {
      composer.render(dt);
      if (!overlay.children.length) return;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(overlay, camera);
      renderer.autoClear = true;
    },
  };
}
