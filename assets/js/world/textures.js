// Every texture in the bar is drawn on a <canvas>: no image files to load, and the
// chalkboard menu can list real posts.
import * as THREE from 'three';

const FONT_DISPLAY = '"Fraunces", Georgia, serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

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
  const loads = ['800 40px Fraunces', '600 20px "JetBrains Mono"'].map((f) => document.fonts.load(f));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1500))]);
}

/** Pink neon "STEVE'S" with a teal "space tiki bar" underneath. Emissive, so bloom picks it up. */
export function neonSign() {
  const [c, g] = canvas(1024, 320);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const glow = (text, font, y, color, blur) => {
    g.font = font;
    g.shadowColor = color;
    for (const b of [blur, blur / 2, 0]) {
      g.shadowBlur = b;
      g.fillStyle = b ? color : '#fff';
      g.fillText(text, 512, y);
    }
  };
  glow("STEVE'S", `800 170px ${FONT_DISPLAY}`, 130, '#ff4fa3', 40);
  glow('· SPACE TIKI BAR ·', `600 46px ${FONT_MONO}`, 262, '#3ff5e8', 24);
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

/** Robot bartender's shirt: pineapples, obviously. */
export function pineappleShirt() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#4fb6b0'; // teal shirt so the pineapples pop
  g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const x = col * 88 + (row % 2) * 44 + 22;
      const y = row * 88 + 30;
      // leaves
      g.fillStyle = '#2f8f4e';
      for (const a of [-0.5, 0, 0.5]) {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.beginPath();
        g.ellipse(0, -14, 5, 16, 0, 0, 7);
        g.fill();
        g.restore();
      }
      // fruit
      g.fillStyle = '#f2b632';
      g.beginPath();
      g.ellipse(x, y + 18, 15, 21, 0, 0, 7);
      g.fill();
      g.strokeStyle = '#b97a14';
      g.lineWidth = 2;
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.moveTo(x - 14, y + 18 + k * 8);
        g.lineTo(x + 14, y + 26 + k * 8);
        g.stroke();
      }
    }
  }
  return texture(c, { repeat: [2, 1] });
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
