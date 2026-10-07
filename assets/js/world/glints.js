// Glints: now and then, something on the planet you can use catches the light: a quick
// four-pointed sparkle on it, one at a time, never announced. Nothing says what it means; the
// first time someone follows one and finds the thing does something, they start trying the rest.
// The more of them you've used, the more often they come (main.js says which have been used).
import * as THREE from 'three';

function sparkle() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const core = g.createRadialGradient(64, 64, 0, 64, 64, 22);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.35, 'rgba(255,240,205,.75)');
  core.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, 128, 128);
  // four thin rays, longest across and up
  g.globalCompositeOperation = 'lighter';
  for (const [w, h, turn] of [[60, 2.2, 0], [2.2, 60, 0], [34, 1.4, Math.PI / 4], [1.4, 34, Math.PI / 4]]) { // the short pair on the diagonals
    const r = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h));
    r.addColorStop(0, 'rgba(255,245,220,.95)');
    r.addColorStop(1, 'rgba(255,230,180,0)');
    g.save();
    g.translate(64, 64);
    g.rotate(turn);
    g.fillStyle = r;
    g.fillRect(-w, -h, 2 * w, 2 * h);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGlints({ scene, reducedMotion = false }) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkle(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sprite.visible = false;
  sprite.renderOrder = 5;
  scene.add(sprite);
  const DUR = 1.1; // seconds a glint lasts
  let wait = 9, t = -1, last = null;
  const _p = new THREE.Vector3();
  return {
    /**
     * Each frame: `things` is what could glint now ({ key, at: Vector3 }, already filtered by
     * main.js to what you could use from here), `used` how many different things you've used.
     */
    update(dt, camera, things, used = 0) {
      if (t >= 0) {
        t += dt;
        const k = t / DUR, e = Math.sin(Math.min(1, k) * Math.PI); // in and out
        sprite.material.opacity = e;
        if (!reducedMotion) { sprite.scale.setScalar(0.12 + 0.38 * e); sprite.material.rotation = k * 0.9; }
        else sprite.scale.setScalar(0.4);
        if (k >= 1) { t = -1; sprite.visible = false; wait = Math.max(3.5, 9 - 1.4 * used) * (0.75 + Math.random() * 0.5); }
        return;
      }
      if ((wait -= dt) > 0 || !things.length) return;
      // something in view, not too near, not too far, and not the one that glinted last
      const seen = things.filter((x) => {
        if (x.key === last && things.length > 1) return false;
        const d = x.at.distanceTo(camera.position);
        if (d < 2 || d > 18) return false;
        _p.copy(x.at).project(camera);
        return _p.z < 1 && Math.abs(_p.x) < 0.8 && Math.abs(_p.y) < 0.75;
      });
      if (!seen.length) { wait = 1.5; return; }
      const pick = seen[Math.floor(Math.random() * seen.length)];
      last = pick.key;
      sprite.position.copy(pick.at);
      sprite.visible = true;
      t = 0;
    },
    /** Where a glint is showing now, or null (for tests). */
    get showing() { return sprite.visible ? sprite.position.clone() : null; },
    /** Stop any glint now (sitting down, getting up). */
    clear() { t = -1; sprite.visible = false; wait = Math.max(wait, 4); },
  };
}
