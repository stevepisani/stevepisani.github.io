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
    for (const [blur, w, a] of [[46, width * 2.2, 0.35], [22, width * 1.4, 0.7], [8, width, 1]]) {
      g.shadowBlur = blur;
      g.globalAlpha = a;
      g.lineWidth = w;
      g.strokeText(text, 512, y);
    }
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.strokeStyle = '#fff6fb';
    g.lineWidth = Math.max(1.5, width * 0.35);
    g.strokeText(text, 512, y);
  };
  tube("Steve's", `180px ${FONT_SCRIPT}`, 140, '#ff4fa3', 7);
  tube('SPACE  TIKI  BAR', `600 40px ${FONT_MONO}`, 272, '#3ff5e8', 2.5);
  return texture(c);
}

/** Chalkboard drinks menu. Posts become cocktails; reading time is the price. */
export function chalkboard(posts) {
  const [c, g] = canvas(640, 800);
  g.fillStyle = '#1d2a22';
  g.fillRect(0, 0, 640, 800);
  // chalk dust smudges
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    g.beginPath();
    g.ellipse(Math.random() * 640, Math.random() * 800, 40 + Math.random() * 120, 20 + Math.random() * 60, Math.random() * 3, 0, 7);
    g.fill();
  }
  g.strokeStyle = '#7a5230';
  g.lineWidth = 28;
  g.strokeRect(14, 14, 612, 772);

  g.fillStyle = '#f7f3e8';
  g.textAlign = 'center';
  g.font = `800 64px ${FONT_DISPLAY}`;
  g.fillText('DRINKS', 320, 110);
  g.font = `600 22px ${FONT_MONO}`;
  g.fillStyle = '#ffd36e';
  g.fillText('(the writing menu)', 320, 150);

  g.textAlign = 'left';
  let y = 215;
  for (const p of posts.slice(0, 5)) {
    const words = p.title.split(' ');
    const lines = [];
    let line = '';
    g.font = `600 27px ${FONT_DISPLAY}`;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > 440 && line) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
    g.fillStyle = '#f7f3e8';
    lines.slice(0, 2).forEach((l, i) => g.fillText(l, 60, y + i * 32));
    g.fillStyle = '#9ff0d6';
    g.font = `600 22px ${FONT_MONO}`;
    g.textAlign = 'right';
    g.fillText(`${p.mins} min`, 580, y);
    g.textAlign = 'left';
    y += Math.min(lines.length, 2) * 32 + 44;
    if (y > 740) break;
  }
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
