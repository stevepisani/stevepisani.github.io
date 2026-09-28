// Every texture in the bar is drawn on a <canvas>: no image files to load, and the
// chalkboard menu can list real posts.
import * as THREE from 'three';
import { PALETTE } from './materials.js';

const FONT_DISPLAY = '"Fraunces", Georgia, serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';
const FONT_SCRIPT = '"Pacifico", "Brush Script MT", cursive';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, { repeat } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Wait (briefly) for web fonts so canvas text doesn't render in a fallback face.
export async function fontsReady() {
  if (!document.fonts) return;
  const loads = ['800 40px Fraunces', '600 20px "JetBrains Mono"', '40px Pacifico'].map((f) => document.fonts.load(f));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1500))]);
}

/**
 * Neon in a 1950s brush script, drawn as tubes: a wide soft glow, the coloured tube,
 * and a thin hot core, the way bent glass neon actually looks.
 */
export function neonSign() {
  const [c, g] = canvas(1024, 320);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = g.lineCap = 'round';
  const tube = (text, font, y, color, width) => {
    g.font = font;
    g.shadowColor = color;
    g.strokeStyle = color;
    // a tight halo only: the world's bloom adds the rest, and two soft glows smear the letters
    for (const [blur, w, a] of [[18, width * 1.8, 0.35], [8, width * 1.3, 0.75], [3, width, 1]]) {
      g.shadowBlur = blur;
      g.globalAlpha = a;
      g.lineWidth = w;
      g.strokeText(text, 512, y);
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.strokeStyle = '#fff6fb';
    g.lineWidth = Math.max(2, width * 0.45);
    g.strokeText(text, 512, y);
  };
  tube("Steve's", `190px ${FONT_SCRIPT}`, 135, '#ff4fa3', 10);
  tube('SPACE  TIKI  BAR', `600 54px ${FONT_MONO}`, 272, '#3ff5e8', 4.5);
  return texture(c);
}

/** Chalkboard drinks menu. Posts become cocktails; reading time is the price. */
export function chalkboard(drinks) {
  // landscape, hung on the back wall behind the bar: "Favorite drinks" and their names
  const W = 800, H = 600;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#1d2a22';
  g.fillRect(0, 0, W, H);
  let seed = 5;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); // same smudges every visit
  for (let i = 0; i < 40; i++) { // chalk dust
    g.fillStyle = `rgba(255,255,255,${rand() * 0.035})`;
    g.beginPath();
    g.ellipse(rand() * W, rand() * H, 40 + rand() * 120, 20 + rand() * 60, rand() * 3, 0, 7);
    g.fill();
  }
  g.strokeStyle = '#7a5230';
  g.lineWidth = 26;
  g.strokeRect(13, 13, W - 26, H - 26);
  g.textAlign = 'center';
  g.fillStyle = '#f7f3e8';
  g.font = `800 58px ${FONT_DISPLAY}`;
  g.fillText('Favorite drinks', W / 2, 105);
  g.strokeStyle = 'rgba(247,243,232,.6)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(W / 2 - 190, 128); g.quadraticCurveTo(W / 2, 140, W / 2 + 190, 128); g.stroke();
  const list = drinks.slice(0, 6);
  const step = Math.min(72, 380 / Math.max(1, list.length));
  list.forEach((name, i) => {
    const y = 205 + i * step;
    g.fillStyle = '#ffd36e';
    g.font = `600 30px ${FONT_MONO}`;
    g.fillText('✶', W / 2 - 250, y);
    g.fillStyle = '#f7f3e8';
    g.font = `600 44px ${FONT_DISPLAY}`;
    g.fillText(name, W / 2, y, W - 200);
  });
  return texture(c);
}

const css = (n) => '#' + n.toString(16).padStart(6, '0');

/** Robot bartender's aloha shirt: cream hibiscus and teal leaves on coral. */
export function alohaShirt() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = css(PALETTE.coral);
  g.fillRect(0, 0, 512, 512);
  const leaf = (x, y, a, s) => {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = css(PALETTE.teal);
    g.beginPath(); g.ellipse(0, -26 * s, 9 * s, 26 * s, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -50 * s); g.stroke();
    g.restore();
  };
  const hibiscus = (x, y, s, rot) => {
    for (let i = 0; i < 3; i++) leaf(x, y, rot + 1.1 + i * 0.9, s);
    g.fillStyle = css(PALETTE.cream);
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      g.beginPath(); g.ellipse(x + Math.cos(a) * 15 * s, y + Math.sin(a) * 15 * s, 16 * s, 11 * s, a, 0, 7); g.fill();
    }
    g.fillStyle = css(PALETTE.hibiscus);
    g.beginPath(); g.arc(x, y, 7 * s, 0, 7); g.fill();
    g.strokeStyle = css(PALETTE.amber); g.lineWidth = 2.5 * s;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 * s, y - 16 * s); g.stroke();
  };
  // a repeating half-drop pattern, so it tiles
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      hibiscus(col * 128 + (row % 2) * 64 + 40, row * 128 + 50, 1 + ((row + col) % 3) * 0.15, row + col * 2);
    }
  }
  return texture(c, { repeat: [2, 1] });
}

/**
 * The robot's face: a big round gauge, cream with an amber glow, ticked like a 1950s
 * speedometer from MILD to VOLCANIC. The needle is a separate mesh so it can swing.
 */
export function dialFace() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const cx = S / 2;
  const grd = g.createRadialGradient(cx, cx, 10, cx, cx, cx);
  grd.addColorStop(0, css(PALETTE.cream));
  grd.addColorStop(0.75, css(PALETTE.amber));
  grd.addColorStop(1, css(PALETTE.coral));
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = css(PALETTE.lava);
  g.fillStyle = css(PALETTE.lava);
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI * (0.8 + (i / 20) * 1.4);
    const r0 = i % 5 ? 96 : 84;
    g.lineWidth = i % 5 ? 3 : 6;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * 112, cx + Math.sin(a) * 112);
    g.stroke();
  }
  g.font = '600 17px ' + FONT_MONO;
  g.textAlign = 'center';
  g.fillText('MILD', cx - 58, cx + 62);
  g.fillText('VOLCANIC', cx + 48, cx + 62);
  g.font = '800 22px ' + FONT_DISPLAY;
  g.fillText('GROG-O-METER', cx, cx + 34);
  return texture(c);
}

/** A carved tiki face wrapped around a mug. */
export function tikiFace(base) {
  const [c, g] = canvas(256, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 128);
  const dark = 'rgba(0,0,0,.45)';
  g.fillStyle = dark;
  // brow
  g.fillRect(70, 22, 116, 12);
  // eyes
  for (const x of [98, 158]) {
    g.beginPath();
    g.ellipse(x, 50, 16, 11, 0, 0, 7);
    g.fill();
  }
  // nose
  g.fillRect(120, 44, 16, 34);
  g.fillRect(110, 72, 36, 10);
  // mouth with teeth
  g.fillRect(84, 92, 88, 22);
  g.fillStyle = base;
  for (let x = 90; x < 170; x += 14) g.fillRect(x, 95, 8, 8);
  return texture(c);
}

/** Planet with warm bands, for the gas giant in the background. */
export function planetBands() {
  const [c, g] = canvas(512, 256);
  const bands = ['#e8b37a', '#d4895a', '#f1d2a3', '#b86a45', '#eec08b', '#c97c52', '#f5dcb4', '#a85b3c'];
  let y = 0;
  while (y < 256) {
    const h = 8 + Math.random() * 26;
    g.fillStyle = bands[Math.floor(Math.random() * bands.length)];
    g.fillRect(0, y, 512, h);
    y += h;
  }
  g.globalAlpha = 0.25;
  for (let i = 0; i < 30; i++) {
    g.fillStyle = bands[i % bands.length];
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 256, 30 + Math.random() * 60, 3 + Math.random() * 5, 0, 0, 7);
    g.fill();
  }
  return texture(c);
}

/** Planet ring: concentric translucent stripes, mapped radially in world.js. */
export function ringStripes() {
  const [c, g] = canvas(512, 8);
  for (let x = 0; x < 512; x++) {
    const a = 0.15 + 0.6 * Math.abs(Math.sin(x * 0.09) * Math.sin(x * 0.023));
    g.fillStyle = `rgba(240, 214, 170, ${x < 30 || x > 490 ? a * 0.3 : a})`;
    g.fillRect(x, 0, 1, 8);
  }
  return texture(c);
}

/** Soft round glow for nebulae, stars, and flame halos. */
export function glow(color) {
  const [c, g] = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return texture(c);
}

/** Small printed label, e.g. "TIPS" on the jar. */
export function label(text, { bg = '#f4ead2', fg = '#3a2a18', w = 256, h = 96 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // shrink the text until it fits with a little margin
  let size = Math.floor(h * 0.55);
  do { g.font = `800 ${size}px ${FONT_DISPLAY}`; size -= 2; } while (g.measureText(text).width > w * 0.9 && size > 8);
  g.fillText(text, w / 2, h / 2 + 4);
  return texture(c);
}

// The tiki mask from the HTML menu (index.html), as the same SVG path data.
const TIKI_HEAD = 'M6 6q14-8 28 0v40q-14 12-28 0z';
const TIKI_CUT = 'M8 16h24v5H8zM10 24q5-3 9 0q-4 4-9 0zM21 24q5-3 9 0q-4 4-9 0zM17 27h6l2 9h-10zM10 40q10 6 20 0v5q-10 5-20 0z';
const TIKI_TEETH = 'M13 41h3v3h-3zM18.5 41.5h3v3h-3zM24 41h3v3h-3z';

/**
 * The menu that stands on the bar: the same design as the HTML menu (world.css .menu),
 * lashed bamboo frame, parchment, "Steve's" in script, a tapa band, and the real items
 * (`items` = [{ label, note }], read from the page). 2:3, like the card it's drawn on.
 */
export function menuCard(items) {
  const W = 512, H = 768, P = 26;
  const [c, g] = canvas(W, H);
  const paper = '#f7ecd4', soft = '#7a5a3c'; // --paper and --ink-soft in world.css
  const lacquer = css(PALETTE.stain), coral = css(PALETTE.coral), lava = css(PALETTE.lava);
  g.fillStyle = lacquer;
  g.fillRect(0, 0, W, H);
  // bamboo poles
  const pole = (x, y, w, h, across) => {
    g.fillStyle = css(PALETTE.bamboo);
    g.fillRect(x, y, w, h);
    const len = across ? h : w;
    for (let t = 70; t < len; t += 76) {
      g.fillStyle = '#6b4a22';
      across ? g.fillRect(x, y + t, w, 4) : g.fillRect(x + t, y, 4, h);
    }
    const sh = across ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
    sh.addColorStop(0, 'rgba(255,255,255,.3)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = sh;
    g.fillRect(x, y, w, h);
  };
  pole(0, 0, W, P, false); pole(0, H - P, W, P, false); pole(0, 0, P, H, true); pole(W - P, 0, P, H, true);
  g.fillStyle = lacquer;
  for (const [x, y] of [[P / 2, P / 2], [W - P / 2, P / 2], [P / 2, H - P / 2], [W - P / 2, H - P / 2]]) { g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); }
  // parchment with a darker rim and an inner rule
  g.fillStyle = paper;
  g.fillRect(P, P, W - 2 * P, H - 2 * P);
  const rim = g.createRadialGradient(W / 2, H * 0.3, W * 0.3, W / 2, H * 0.45, H * 0.65);
  rim.addColorStop(0, 'rgba(122,80,30,0)'); rim.addColorStop(1, 'rgba(122,80,30,.22)');
  g.fillStyle = rim;
  g.fillRect(P, P, W - 2 * P, H - 2 * P);
  g.strokeStyle = lacquer; g.lineWidth = 3;
  g.strokeRect(P + 12, P + 12, W - 2 * P - 24, H - 2 * P - 24);
  // header: tiki, "Steve's", tiki
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = '64px ' + FONT_SCRIPT;
  g.fillStyle = lava; g.fillText("Steve's", W / 2 + 4, 132);
  g.fillStyle = coral; g.fillText("Steve's", W / 2, 128);
  const mask = (x, flip) => {
    g.save(); g.translate(x, 64); g.scale(flip ? -1.3 : 1.3, 1.3); if (flip) g.translate(-40, 0);
    g.fillStyle = lacquer; g.fill(new Path2D(TIKI_HEAD)); g.fill(new Path2D(TIKI_TEETH));
    g.fillStyle = paper; g.fill(new Path2D(TIKI_CUT));
    g.restore();
  };
  mask(58, false); mask(W - 58 - 52, true);
  // tapa band
  const by = 156;
  g.fillStyle = lacquer; g.fillRect(P + 20, by, W - 2 * P - 40, 3); g.fillRect(P + 20, by + 17, W - 2 * P - 40, 3);
  g.fillStyle = coral;
  for (let x = P + 20; x < W - P - 30; x += 14) { g.beginPath(); g.moveTo(x, by + 16); g.lineTo(x + 7, by + 5); g.lineTo(x + 14, by + 16); g.fill(); }
  g.fillStyle = lacquer;
  g.font = 'italic 600 30px ' + FONT_DISPLAY;
  g.fillText("What'll it be?", W / 2, 222);
  // the items: plain labels, one line on what's there
  const top = 262, step = Math.min(66, (H - P - 40 - top) / Math.max(1, items.length));
  items.forEach((it, i) => {
    const y = top + i * step;
    if (i) { g.strokeStyle = 'rgba(74,44,26,.35)'; g.setLineDash([2, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(P + 40, y - 12); g.lineTo(W - P - 40, y - 12); g.stroke(); g.setLineDash([]); }
    g.fillStyle = lacquer;
    g.font = '800 25px ' + FONT_DISPLAY;
    if ('letterSpacing' in g) g.letterSpacing = '2px';
    g.fillText(it.label.toUpperCase(), W / 2, y + 16);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.fillStyle = soft;
    g.font = 'italic 17px ' + FONT_DISPLAY;
    g.fillText(it.note, W / 2, y + 40, W - 2 * P - 60);
  });
  const t = texture(c);
  t.anisotropy = 8;
  return t;
}

/** The rocket's landing pad: scuffed concrete, a coral ring, a dashed aqua circle and chevrons. */
export function landingPad() {
  const S = 512, cx = S / 2;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#3a3a40';
  g.fillRect(0, 0, S, S);
  let seed = 11;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); // same pad every visit
  for (let i = 0; i < 2200; i++) { // concrete speckle
    g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.06)';
    g.fillRect(rand() * S, rand() * S, 2, 2);
  }
  const scorch = g.createRadialGradient(cx, cx, 10, cx, cx, 170);
  scorch.addColorStop(0, 'rgba(10,8,8,.75)'); scorch.addColorStop(1, 'rgba(10,8,8,0)');
  g.fillStyle = scorch; g.fillRect(0, 0, S, S);
  g.lineCap = 'butt';
  g.strokeStyle = css(PALETTE.coral); g.lineWidth = 22;
  g.beginPath(); g.arc(cx, cx, 205, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = css(PALETTE.aqua); g.lineWidth = 8; g.setLineDash([26, 18]);
  g.beginPath(); g.arc(cx, cx, 150, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.fillStyle = css(PALETTE.amber);
  for (let i = 0; i < 8; i++) { // chevrons pointing in to the centre
    g.save(); g.translate(cx, cx); g.rotate((i / 8) * Math.PI * 2);
    g.beginPath(); g.moveTo(-22, -185); g.lineTo(0, -165); g.lineTo(22, -185); g.lineTo(22, -176); g.lineTo(0, -156); g.lineTo(-22, -176); g.closePath(); g.fill();
    g.restore();
  }
  return texture(c);
}

/* ---------- Dressing (decor.js): leaves, net, rope ---------- */
// Leaves are drawn in greys with alpha; each plant tints them from the palette.

/** A leaf card, stem at the bottom centre: 'monstera' (split and holed), 'ti' (a long strap),
 *  or 'fern' (a frond of small pinnae). */
export function leafCard(kind) {
  const W = 256, H = 512;
  const [c, g] = canvas(W, H);
  let seed = kind.length * 17 + 3;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const shade = g.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, '#9a9a9a'); shade.addColorStop(0.5, '#e8e8e8'); shade.addColorStop(1, '#8a8a8a');
  if (kind === 'monstera') {
    g.fillStyle = shade;
    g.beginPath();
    g.moveTo(W / 2, H - 40);
    g.bezierCurveTo(-60, H * 0.62, 10, 40, W / 2, 30);
    g.bezierCurveTo(W - 10, 40, W + 60, H * 0.62, W / 2, H - 40);
    g.fill();
    // the splits and holes that make it a monstera
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const y = 90 + i * 52;
      for (const s of [-1, 1]) {
        g.lineWidth = 7;
        g.beginPath(); g.moveTo(W / 2 + s * (60 + i * 3), y); g.lineTo(W / 2 + s * 170, y + 24 + i * 4); g.stroke();
        if (i % 2) { g.beginPath(); g.ellipse(W / 2 + s * 34, y + 12, 7, 12, s * 0.5, 0, 7); g.fill(); }
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(W / 2, H - 40); g.quadraticCurveTo(W / 2 + 4, H / 2, W / 2, 40); g.stroke();
    // the stem below the leaf
    g.fillStyle = '#b0b0b0'; g.fillRect(W / 2 - 4, H - 44, 8, 44);
  } else if (kind === 'ti') {
    g.fillStyle = shade;
    g.beginPath();
    g.moveTo(W / 2, H);
    g.bezierCurveTo(W / 2 - 70, H * 0.7, W / 2 - 60, H * 0.2, W / 2, 0);
    g.bezierCurveTo(W / 2 + 60, H * 0.2, W / 2 + 70, H * 0.7, W / 2, H);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 10); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2;
    for (let y = 40; y < H - 30; y += 18) { g.beginPath(); g.moveTo(W / 2, y + 14); g.lineTo(W / 2 - 40, y); g.moveTo(W / 2, y + 14); g.lineTo(W / 2 + 40, y); g.stroke(); }
  } else { // fern
    g.strokeStyle = '#c8c8c8'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(W / 2, H); g.quadraticCurveTo(W / 2 + 10, H / 2, W / 2, 6); g.stroke();
    for (let y = H - 30; y > 20; y -= 14) {
      const k = y / H, len = 18 + k * 90;
      g.fillStyle = `rgb(${190 + rand() * 50 | 0},${190 + rand() * 50 | 0},${190 + rand() * 50 | 0})`;
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(W / 2 + s * len / 2, y - 6, len / 2, 6, s * -0.35, 0, 7); g.fill(); }
    }
  }
  const t = texture(c);
  t.anisotropy = 4;
  return t;
}

/** Knotted fishing net: rope-coloured diamonds on transparent, tiles. */
export function fishingNet() {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.strokeStyle = css(PALETTE.bamboo);
  g.lineWidth = 4;
  const n = 4, d = S / n;
  for (let i = -n; i <= 2 * n; i++) {
    g.beginPath(); g.moveTo(i * d, 0); g.lineTo(i * d + S, S); g.stroke();
    g.beginPath(); g.moveTo(i * d, 0); g.lineTo(i * d - S, S); g.stroke();
  }
  g.fillStyle = css(PALETTE.thatch);
  for (let x = 0; x <= n; x++) for (let y = 0; y <= n; y++) { g.beginPath(); g.arc(x * d, y * d, 5, 0, 7); g.fill(); g.beginPath(); g.arc(x * d + d / 2, y * d + d / 2, 5, 0, 7); g.fill(); }
  return texture(c, { repeat: [5, 3] });
}

/** Twisted manila rope, to wrap along its length. */
export function ropeTexture() {
  const [c, g] = canvas(128, 32);
  g.fillStyle = css(PALETTE.bamboo);
  g.fillRect(0, 0, 128, 32);
  g.strokeStyle = css(PALETTE.thatch);
  g.lineWidth = 7;
  for (let x = -32; x < 160; x += 16) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 24, 0); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
  for (let x = -32; x < 160; x += 16) { g.beginPath(); g.moveTo(x + 5, 32); g.lineTo(x + 29, 0); g.stroke(); }
  return texture(c, { repeat: [40, 1] });
}
