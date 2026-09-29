// Palette and materials for the night-time tiki look.
//
// Every colour in the world comes from PALETTE (Polynesian Pop, circa 1958, at night),
// and every surface is PBR with a procedural canvas texture: no image files, and
// everything shares a consistent, slightly weathered, hand-made feel.
import * as THREE from 'three';

export const PALETTE = {
  lava: 0x1b1412,      // lava rock, deep shadow
  stain: 0x4a2c1a,     // dark tiki stain (carved wood)
  wood: 0x6b4128,      // lighter carved wood
  bamboo: 0xc9a66b,    // bamboo tan
  thatch: 0xa88550,    // dried palm thatch
  amber: 0xf2a541,     // lamp glow
  coral: 0xe8634a,
  hibiscus: 0xd6336c,  // neon pink
  teal: 0x0f5e63,
  aqua: 0x5fc7c4,      // glass floats, neon accents
  lagoon: 0x050d13,     // still water at night
  lagoonSky: 0x2a2752,  // the nebula, as the water reflects it
  limestone: 0xa99f8a,  // the Rodin Museum's Beaux-Arts gateway
  bronze: 0x5a4630,     // the Thinker's patina
  cream: 0xeadcbc,     // enamel trim on the tin-toy robot
  leaf: 0x2f5a2c,      // tropical planting: monstera, fern
  lime: 0x8fb33a,      // citrus on the bar
  chrome: 0xc9ced8,
  brass: 0xc9953a,     // the telescope
  tinTeal: 0x1a74a6,   // the robot's enamel: bluer than teal on purpose, so it still reads teal under the amber lamps
  rocketWhite: 0xe8e6e0, // the Saturn V's paint
  rocketBlack: 0x19191b,
  towerRed: 0x9a3322,  // its umbilical tower
  moss: 0x2f4a2a,      // the planet: mossy ground
  mossDeep: 0x1d3322,
  ash: 0x7a6c5c,       // pale ash-sand round the bar
  basalt: 0x231c1a,    // bare rock in the southern basins
  soil: 0x3e3229,      // worn earth beside the trails
  stone: 0x6f665d,     // flagstones and pebbles
  moon: 0x9fb4ff,      // moonlight
  lunar: 0xb9b5ae,     // the moon itself: highlands
  mare: 0x5f5b57,      //   and its dark seas
  giantCream: 0xf1d9b0, // the ringed gas giant's bands, light to dark
  giantTan: 0xd9a06a,
  giantRust: 0xb0623f,
  giantUmber: 0x5e3624,
  night: 0x070913,     // sky / fog
};

const textures = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}

// Deterministic noise so textures look the same on every visit.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }

/** Memoised texture pair { map, bump } built by `draw(g, w, h, rand, isBump)`. */
function textureSet(key, w, h, draw, opts) {
  if (textures.has(key)) return textures.get(key);
  const [c1, g1] = canvas(w, h);
  const [c2, g2] = canvas(w, h);
  draw(g1, w, h, rng(7), false);
  draw(g2, w, h, rng(7), true);
  const set = { map: tex(c1, opts), bump: tex(c2, { ...opts, srgb: false }) };
  textures.set(key, set);
  return set;
}

/* ---------------- Surfaces ---------------- */

/** Dark stained wood with long grain; the carved-tiki and bar-top look. */
export function woodSet(base = PALETTE.stain) {
  return textureSet('wood' + base, 256, 512, (g, w, h, r, bump) => {
    g.fillStyle = bump ? '#808080' : hex(base);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = r() * w, width = 1 + r() * 4;
      const dark = r() < 0.5;
      g.fillStyle = bump ? (dark ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.18)') : `rgba(${dark ? '20,10,5' : '140,95,60'},${0.12 + r() * 0.2})`;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.02 + i) * 6, y);
      g.lineWidth = width;
      g.strokeStyle = g.fillStyle;
      g.stroke();
    }
    // a few knots
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(r() * w, r() * h, 6 + r() * 8, 14 + r() * 12, 0, 0, 7);
      g.strokeStyle = bump ? 'rgba(0,0,0,.4)' : 'rgba(15,8,4,.5)';
      g.lineWidth = 3;
      g.stroke();
    }
  }, { repeat: [1, 1] });
}

/** Bamboo: tan with darker nodes every so often and fine vertical fibres. */
export function bambooSet() {
  return textureSet('bamboo', 128, 512, (g, w, h, r, bump) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, bump ? '#606060' : '#9c7a44');
    grd.addColorStop(0.5, bump ? '#9a9a9a' : hex(PALETTE.bamboo));
    grd.addColorStop(1, bump ? '#606060' : '#9c7a44');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = bump ? 'rgba(0,0,0,.12)' : 'rgba(80,55,25,.15)';
      g.fillRect(r() * w, 0, 1, h);
    }
    for (const y of [0, h * 0.5]) {
      g.fillStyle = bump ? '#303030' : '#5a4020';
      g.fillRect(0, y, w, 7);
      g.fillStyle = bump ? '#c0c0c0' : '#d8b87a';
      g.fillRect(0, y + 7, w, 3);
    }
  });
}

/** Dried palm thatch: overlapping strands, lighter tips. */
export function thatchSet() {
  return textureSet('thatch', 512, 512, (g, w, h, r, bump) => {
    g.fillStyle = bump ? '#404040' : '#5e4524';
    g.fillRect(0, 0, w, h);
    for (let row = 0; row < 14; row++) {
      const y0 = row * (h / 14);
      for (let i = 0; i < 160; i++) {
        const x = r() * w, len = 30 + r() * 30;
        const light = 0.55 + r() * 0.45;
        g.strokeStyle = bump ? `rgba(255,255,255,${0.2 + r() * 0.3})` : `rgba(${Math.round(190 * light)},${Math.round(150 * light)},${Math.round(90 * light)},0.9)`;
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        g.moveTo(x, y0);
        g.lineTo(x + (r() - 0.5) * 8, y0 + len);
        g.stroke();
      }
    }
  }, { repeat: [3, 2] });
}

/** Porous lava rock. */
export function lavaSet() {
  return textureSet('lava', 256, 256, (g, w, h, r, bump) => {
    g.fillStyle = bump ? '#909090' : '#2a211d';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h, s = 1 + r() * 5;
      g.fillStyle = bump ? `rgba(0,0,0,${0.3 + r() * 0.5})` : `rgba(${r() < 0.15 ? '90,40,25' : '10,8,7'},${0.3 + r() * 0.5})`;
      g.beginPath();
      g.arc(x, y, s, 0, 7);
      g.fill();
    }
  }, { repeat: [2, 2] });
}

/** Tapa cloth: bands of triangles, zigzags and diamonds in brown and black on tan. */
export function tapaTexture() {
  if (textures.has('tapa')) return textures.get('tapa');
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#c9a877';
  g.fillRect(0, 0, 512, 512);
  const r = rng(3);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(90,60,30,${r() * 0.08})`; g.fillRect(r() * 512, r() * 512, 2, 2); }
  const ink = ['#3a2416', '#1b1412', '#7a3b22'];
  let y = 16;
  let band = 0;
  while (y < 500) {
    const hgt = 36 + (band % 3) * 10;
    g.fillStyle = ink[band % 3];
    g.fillRect(0, y, 512, 4);
    g.fillRect(0, y + hgt - 4, 512, 4);
    for (let x = 0; x < 512; x += hgt) {
      g.beginPath();
      if (band % 3 === 0) { g.moveTo(x, y + hgt - 6); g.lineTo(x + hgt / 2, y + 6); g.lineTo(x + hgt, y + hgt - 6); }
      else if (band % 3 === 1) { g.moveTo(x + hgt / 2, y + 6); g.lineTo(x + hgt - 4, y + hgt / 2); g.lineTo(x + hgt / 2, y + hgt - 6); g.lineTo(x + 4, y + hgt / 2); }
      else { g.moveTo(x, y + 8); g.lineTo(x + hgt / 2, y + hgt - 8); g.lineTo(x + hgt, y + 8); g.lineWidth = 5; g.strokeStyle = ink[2]; g.stroke(); continue; }
      g.fill();
    }
    y += hgt + 14;
    band++;
  }
  const t = tex(c);
  textures.set('tapa', t);
  return t;
}

/** Woven rattan for stools. */
export function rattanSet() {
  return textureSet('rattan', 256, 256, (g, w, h, r, bump) => {
    g.fillStyle = bump ? '#707070' : '#8a6a3c';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        const over = ((x + y) / 16) % 2 === 0;
        g.fillStyle = bump ? (over ? '#d0d0d0' : '#505050') : (over ? '#c7a26a' : '#9a7644');
        g.fillRect(x + 1, y + 1, 14, 14);
      }
    }
  }, { repeat: [4, 2] });
}

/** Worn lithographed tin: fine scratches and dents, for the bump channel of enamel(). */
export function tinSet() {
  return textureSet('tin', 256, 256, (g, w, h, r, bump) => {
    g.fillStyle = bump ? '#808080' : '#ffffff';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const x = r() * w, y = r() * h, a = r() * 7, len = 4 + r() * 22;
      g.strokeStyle = bump ? `rgba(0,0,0,${0.15 + r() * 0.3})` : `rgba(90,80,70,${0.05 + r() * 0.12})`;
      g.lineWidth = 0.6 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      g.fillStyle = bump ? 'rgba(0,0,0,.12)' : 'rgba(60,50,40,.06)';
      g.beginPath();
      g.arc(r() * w, r() * h, 3 + r() * 9, 0, 7);
      g.fill();
    }
  }, { repeat: [2, 2] });
}

/* ---------------- Materials ---------------- */

export function pbr(params = {}) {
  return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...params });
}

/** Material from one of the texture sets above. */
export function surface(set, { color = 0xffffff, bumpScale = 1.5, roughness = 0.85, repeat, ...rest } = {}) {
  let { map, bump } = set;
  if (repeat) {
    map = map.clone(); map.repeat.set(...repeat); map.needsUpdate = true;
    bump = bump.clone(); bump.repeat.set(...repeat); bump.needsUpdate = true;
  }
  return pbr({ map, bumpMap: bump, bumpScale, color, roughness, ...rest });
}

/** Glossy baked enamel over tin (the robot bartender): clear-coated, lightly scuffed. */
export function enamel(color, { roughness = 0.38, ...rest } = {}) {
  const { map, bump } = tinSet();
  return new THREE.MeshPhysicalMaterial({ color, map, bumpMap: bump, bumpScale: 0.6, roughness, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12, ...rest });
}

/** Polished chrome trim. */
export function chrome({ roughness = 0.22, ...rest } = {}) {
  return pbr({ color: PALETTE.chrome, metalness: 1, roughness, ...rest });
}

/** Unlit, HDR-bright material for things that glow (bloom threshold is 1). */
export function glow(color, intensity = 3) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
  m.userData.keep = true;
  return m;
}

/**
 * Restyle loaded Kenney models for the night look: PBR instead of their flat unlit
 * feel, colours nudged darker and warmer toward the palette.
 */
export function restyle(root, { tint = 0xffffff, roughness = 0.8, metalness = 0 } = {}) {
  const cache = new Map();
  const t = new THREE.Color(tint);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => {
      if (m.userData.keep) return m;
      if (!cache.has(m.uuid)) {
        const c = m.color ? m.color.clone().multiply(t) : new THREE.Color(1, 1, 1);
        cache.set(m.uuid, pbr({ color: c, map: m.map || null, roughness, metalness, vertexColors: m.vertexColors }));
      }
      return cache.get(m.uuid);
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return root;
}
