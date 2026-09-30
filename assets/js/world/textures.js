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

/** A printed page: cream, with lines of text (too small to read) in a column. */
export function bookPage() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#eadcbc';
  g.fillRect(0, 0, 128, 128);
  let seed = 7;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = 'rgba(60, 44, 30, 0.55)';
  for (let y = 14; y < 118; y += 7) {
    const para = rand() < 0.12;
    g.fillRect(para ? 20 : 12, y, (para ? 96 : 104) * (y > 110 || rand() < 0.1 ? 0.6 : 1), 2.2);
  }
  const t = texture(c);
  t.center.set(0.5, 0.5);
  t.rotation = Math.PI / 2; // the pages' u runs along the spine: turned, the lines run across the page
  return t;
}

/** A canvas someone else painted, as a colour texture. */
export function canvasTexture(c) {
  const t = texture(c);
  t.anisotropy = 8;
  return t;
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
  const loads = ['800 40px Fraunces', 'italic 400 16px Fraunces', 'italic 600 18px Fraunces', '600 16px Inter', '400 16px Inter', '600 20px "JetBrains Mono"', '40px Pacifico'].map((f) => document.fonts.load(f));
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
  return texture(c);
}

/** The lit box under the neon: dark letters on a glowing cream face, as on Googie roadside signs. */
export function signBox(text) {
  const [c, g] = canvas(1024, 192);
  const face = g.createLinearGradient(0, 0, 0, 192);
  face.addColorStop(0, css(PALETTE.cream));
  face.addColorStop(0.5, '#' + new THREE.Color(PALETTE.cream).lerp(new THREE.Color(0xffffff), 0.6).getHexString());
  face.addColorStop(1, css(PALETTE.cream));
  g.fillStyle = face;
  g.fillRect(0, 0, 1024, 192);
  // a coral rule inside the edge, then the words, spaced wide
  g.strokeStyle = css(PALETTE.coral);
  g.lineWidth = 6;
  g.strokeRect(18, 16, 1024 - 36, 192 - 32);
  g.fillStyle = css(PALETTE.lava);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = '3px';
  // as big as fits inside the rule, and a touch heavier than the font (it's read from far off)
  let size = 130;
  do { g.font = `800 ${size}px ${FONT_DISPLAY}`; size -= 4; } while (g.measureText(text).width > 1024 - 90 && size > 40);
  g.strokeStyle = g.fillStyle;
  g.lineWidth = 3;
  g.strokeText(text, 512, 100);
  g.fillText(text, 512, 100);
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
/** The moon's surface, equirectangular: albedo (highlands, dark maria, bright-rimmed craters with
 *  rays) and a matching height map for bump. Craters are stretched toward the poles so they stay
 *  round on the sphere. */
export function moonMaps() {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H), [ch, gh] = canvas(W, H);
  const n = periodicNoise(21);
  const img = g.createImageData(W, H), himg = gh.createImageData(W, H);
  const hi = new THREE.Color(PALETTE.lunar), lo = new THREE.Color(PALETTE.mare), col = new THREE.Color();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0, amp = 0.5;
    for (let o = 0, f = 3; o < 5; o++, f *= 2, amp *= 0.5) v += amp * n((x / W) * f, (y / H) * f * 0.5, f);
    const sea = Math.min(1, Math.max(0, (v - 0.52) * 7));      // dark lava seas
    const grit = n(x * 0.6, y * 0.6, W * 0.6);
    col.copy(hi).lerp(lo, sea * 0.85).multiplyScalar(0.86 + grit * 0.22);
    const i = (y * W + x) * 4;
    img.data[i] = col.r * 255; img.data[i + 1] = col.g * 255; img.data[i + 2] = col.b * 255; img.data[i + 3] = 255;
    const h = (0.55 - sea * 0.15 + grit * 0.015) * 255; // no fine grit in the relief: it aliases
    himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = h; himg.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  gh.putImageData(himg, 0, 0);
  let seed = 9;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 300; k++) {
    const y = H * (0.08 + rand() * 0.84), lat = (y / H - 0.5) * Math.PI;
    const r = 2 + Math.pow(rand(), 3.2) * 34, stretch = 1 / Math.max(0.25, Math.cos(lat));
    const x = rand() * W;
    for (const xx of [x, x - W, x + W]) {
      // rays from the big young ones
      if (r > 22) {
        g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2;
        for (let j = 0; j < 14; j++) { const a = rand() * 6.28, L = r * (2 + rand() * 3); g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + Math.cos(a) * L * stretch, y + Math.sin(a) * L); g.stroke(); }
      }
      // a soft bowl with a raised rim: shading from the bump does the work, as on the real moon
      const bowl = (ctx, stops) => {
        ctx.save(); ctx.translate(xx, y); ctx.scale(stretch, 1);
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.25);
        for (const [k, col] of stops) gr.addColorStop(k, col);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, 7); ctx.fill(); ctx.restore();
      };
      bowl(gh, [[0, 'rgba(0,0,0,.45)'], [0.6, 'rgba(0,0,0,.3)'], [0.78, 'rgba(255,255,255,.35)'], [0.86, 'rgba(255,255,255,.2)'], [1, 'rgba(255,255,255,0)']]);
      bowl(g, [[0, 'rgba(60,56,52,.10)'], [0.7, 'rgba(60,56,52,.06)'], [0.8, 'rgba(255,250,240,.07)'], [1, 'rgba(255,250,240,0)']]);
    }
  }
  const map = texture(c);
  const height = new THREE.CanvasTexture(ch);
  height.colorSpace = THREE.NoColorSpace;
  return { map, height };
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
 * The menu that stands on the bar, painted from the HTML menu itself (`card` = the laid-out
 * .menu__card element): every box, line of text and colour is read from the page, so when you
 * pick it up and the HTML menu takes over, nothing moves or changes. `scale` = canvas px per CSS px.
 * Returns the canvas and the card's aspect (width / height).
 */
export function paintMenuCard(card, scale = 2) {
  const box = card.getBoundingClientRect();
  const [c, g] = canvas(Math.round(box.width * scale), Math.round(box.height * scale));
  g.scale(scale, scale);
  const rel = (r) => ({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height });
  const style = (el) => getComputedStyle(el);
  const cs = style(card);
  const v = (name) => cs.getPropertyValue(name).trim();
  const lacquer = v('--lacquer'), bamboo = v('--bamboo'), node = v('--bamboo-node'), hi = v('--bamboo-hi');
  const paper = v('--paper'), coral = v('--coral');
  const W = box.width, H = box.height, P = parseFloat(v('--pole')) || 12;

  // the card's rounded corners (the 3D card cuts them out with alphaTest)
  const radius = parseFloat(cs.borderTopLeftRadius) || 0;
  g.beginPath(); g.roundRect(0, 0, W, H, radius); g.clip();
  // frame: lacquer, four bamboo poles (a node every 67px), round shading across each, lashings
  g.fillStyle = lacquer;
  g.fillRect(0, 0, W, H);
  const pole = (x, y, w, h, down) => {
    const len = down ? h : w;
    for (let t = 0; t < len; t += 67) {
      const seg = (a, b, col) => { g.fillStyle = col; down ? g.fillRect(x, y + t + a, w, Math.min(b - a, len - t - a)) : g.fillRect(x + t + a, y, Math.min(b - a, len - t - a), h); };
      seg(0, 62, bamboo); if (t + 62 < len) seg(62, 65, node); if (t + 65 < len) seg(65, 67, hi);
    }
    const sh = down ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
    sh.addColorStop(0, 'rgb(255 255 255 / .28)'); sh.addColorStop(0.35, 'rgb(255 255 255 / 0)'); sh.addColorStop(1, 'rgb(0 0 0 / .3)');
    g.fillStyle = sh;
    g.fillRect(x, y, w, h);
  };
  // the same stacking as the CSS backgrounds: side poles under the top and bottom ones
  pole(0, 0, P, H, true); pole(W - P, 0, P, H, true); pole(0, 0, W, P, false); pole(0, H - P, W, P, false);
  g.fillStyle = lacquer;
  for (const [x, y] of [[12, 12], [W - 12, 12], [12, H - 12], [W - 12, H - 12]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }

  // parchment: paper, a darker rim, faint fibres, the inset rule
  const sheet = card.querySelector('.menu__sheet');
  const S = rel(sheet.getBoundingClientRect());
  g.save();
  g.beginPath(); g.rect(S.x, S.y, S.w, S.h); g.clip();
  g.fillStyle = paper;
  g.fillRect(S.x, S.y, S.w, S.h);
  g.save(); // ellipse at 50% 30%, farthest-corner (√2 × the farthest sides), clear to 55%, then brown
  const cx = S.x + S.w / 2, cy = S.y + S.h * 0.3;
  const rx2 = Math.SQRT2 * S.w / 2, ry2 = Math.SQRT2 * S.h * 0.7;
  g.translate(cx, cy); g.scale(1, ry2 / rx2);
  const rim = g.createRadialGradient(0, 0, 0, 0, 0, rx2);
  rim.addColorStop(0.55, 'rgb(122 80 30 / 0)'); rim.addColorStop(1, 'rgb(122 80 30 / .16)');
  g.fillStyle = rim;
  g.fillRect(-rx2 * 2, -rx2 * 2, rx2 * 4, rx2 * 4);
  g.restore();
  g.fillStyle = 'rgb(120 70 20 / .028)'; // a touch fainter than the CSS: resampled, it reads stronger
  for (let x = S.x + 3; x < S.x + S.w; x += 4) g.fillRect(x, S.y, 1, S.h);
  g.strokeStyle = lacquer; g.lineWidth = 2;
  g.strokeRect(S.x + 9, S.y + 9, S.w - 18, S.h - 18);

  // text: each line where the browser laid it out, in its own font, colour and spacing
  const text = (el, { color, shadow } = {}) => {
    const st = style(el);
    g.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
    if ('letterSpacing' in g) g.letterSpacing = st.letterSpacing === 'normal' ? '0px' : st.letterSpacing;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    const asc = g.measureText('Hg').fontBoundingBoxAscent;
    const upper = st.textTransform === 'uppercase';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement.closest('[hidden]') || style(n.parentElement).display === 'none') continue;
      // split the node into the lines it was wrapped into
      const range = document.createRange();
      let start = 0, top = null;
      const flush = (end) => {
        if (end <= start) return;
        range.setStart(n, start); range.setEnd(n, end);
        const r = range.getClientRects()[0];
        const str = n.data.slice(start, end).replace(/\s+$/, '');
        if (!r || !str.trim()) return;
        const x = r.left - box.left, y = r.top - box.top + asc;
        const s = upper ? str.toUpperCase() : str;
        if (shadow) { g.fillStyle = shadow[2]; g.fillText(s, x + shadow[0], y + shadow[1]); }
        g.fillStyle = color || st.color;
        g.fillText(s, x, y);
      };
      for (let k = 0; k < n.data.length; k++) {
        range.setStart(n, k); range.setEnd(n, k + 1);
        const r = range.getClientRects()[0];
        if (!r) continue;
        if (top !== null && r.top > top + 2) { flush(k); start = k; }
        top = r.top;
      }
      flush(n.data.length);
    }
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  };

  // header: tiki, "Steve's" with its hard lava shadow, tiki
  for (const svg of sheet.querySelectorAll('.menu__tiki')) {
    const r = rel(svg.getBoundingClientRect());
    g.save();
    g.translate(r.x, r.y);
    g.scale(r.w / 40, r.h / 56);
    if (svg.classList.contains('menu__tiki--flip')) { g.translate(40, 0); g.scale(-1, 1); }
    g.fillStyle = lacquer; g.fill(new Path2D(TIKI_HEAD)); g.fill(new Path2D(TIKI_TEETH));
    g.fillStyle = paper; g.fill(new Path2D(TIKI_CUT));
    g.restore();
  }
  const name = sheet.querySelector('.menu__bar');
  const sh = style(name).textShadow.match(/(rgba?\([^)]*\)|#\w+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px/);
  text(name, { shadow: sh ? [parseFloat(sh[2]), parseFloat(sh[3]), sh[1]] : null });
  // the tapa band over the title: two rules with coral teeth between
  const title = sheet.querySelector('.menu__title');
  const T = rel(title.getBoundingClientRect());
  g.fillStyle = lacquer;
  g.fillRect(T.x, T.y, T.w, 2); g.fillRect(T.x, T.y + 10, T.w, 2);
  g.fillStyle = coral;
  for (let x = T.x; x < T.x + T.w; x += 8) { g.beginPath(); g.moveTo(x, T.y + 2); g.lineTo(x + 4, T.y + 6); g.lineTo(x + 8, T.y + 2); g.fill(); }
  text(title);
  // the close ×
  const close = sheet.querySelector('.menu__close');
  if (close) text(close);
  // items, with the dotted rule between them
  const lis = [...sheet.querySelectorAll('.menu__list li')];
  lis.forEach((li, i) => {
    // a focused or hovered item looks the same on the card as on the page
    const a = li.querySelector('a');
    if (a && a.matches(':focus-visible, :hover')) {
      const st = style(a), r = rel(a.getBoundingClientRect());
      const rr = parseFloat(st.borderTopLeftRadius) || 0;
      g.fillStyle = st.backgroundColor;
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, rr); g.fill();
      const ow = parseFloat(st.outlineWidth) || 0;
      if (st.outlineStyle !== 'none' && ow) {
        const o = (parseFloat(st.outlineOffset) || 0) + ow / 2;
        g.strokeStyle = st.outlineColor; g.lineWidth = ow;
        g.beginPath(); g.roundRect(r.x - o, r.y - o, r.w + 2 * o, r.h + 2 * o, rr + o); g.stroke();
      }
    }
    if (i) {
      const r = rel(li.getBoundingClientRect());
      g.fillStyle = 'rgb(74 44 26 / .3)';
      for (let x = r.x; x < r.x + r.w; x += 2) g.fillRect(x, r.y, 1, 1);
    }
    for (const el of li.querySelectorAll('.menu__label, .menu__note')) text(el);
  });
  // foot: a rule, the "Leave the bar" pill, the plain link
  const foot = sheet.querySelector('.menu__foot');
  if (foot) {
    const F = rel(foot.getBoundingClientRect());
    g.fillStyle = lacquer;
    g.fillRect(F.x, F.y, F.w, 2);
    const leave = foot.querySelector('.menu__leave');
    if (leave && style(leave).display !== 'none') {
      const r = rel(leave.getBoundingClientRect());
      g.fillStyle = style(leave).backgroundColor;
      g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, r.h / 2); g.fill();
      text(leave);
    }
    for (const a of foot.querySelectorAll('a')) {
      text(a);
      const r = rel(a.getBoundingClientRect());
      const st = style(a);
      g.fillStyle = st.color;
      g.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
      const base = r.y + g.measureText('Hg').fontBoundingBoxAscent;
      g.fillRect(r.x, base + Math.max(1, parseFloat(st.fontSize) * 0.1), r.w, Math.max(1, parseFloat(st.fontSize) / 14));
    }
  }
  g.restore();
  return { canvas: c, aspect: W / H };
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

/** Hammock canvas: wide stripes in the bar's colours down its length, a woven grain, tasselled ends. */
export function hammockCloth() {
  const [c, g] = canvas(512, 256);
  const bands = [PALETTE.cream, PALETTE.coral, PALETTE.cream, PALETTE.tinTeal, PALETTE.cream, PALETTE.amber, PALETTE.cream, PALETTE.coral, PALETTE.cream];
  const h = 256 / bands.length;
  bands.forEach((col, i) => { g.fillStyle = css(col); g.fillRect(0, i * h, 512, h + 1); });
  g.fillStyle = 'rgba(0,0,0,.07)';
  for (let x = 0; x < 512; x += 4) g.fillRect(x, 0, 1, 256); // the weave
  for (let y = 0; y < 256; y += 4) g.fillRect(0, y, 512, 1);
  const edge = g.createLinearGradient(0, 0, 0, 256); // a little grime along the edges
  edge.addColorStop(0, 'rgba(60,40,20,.25)'); edge.addColorStop(0.15, 'rgba(60,40,20,0)'); edge.addColorStop(0.85, 'rgba(60,40,20,0)'); edge.addColorStop(1, 'rgba(60,40,20,.25)');
  g.fillStyle = edge; g.fillRect(0, 0, 512, 256);
  return texture(c);
}

/** A signpost board's lettering: hand-painted cream capitals on transparent (the plank is wood). */
export function signLettering(text) {
  const [c, g] = canvas(512, 96);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = '4px';
  let size = 60;
  do { g.font = `800 ${size}px ${FONT_DISPLAY}`; size -= 2; } while (g.measureText(text).width > 440 && size > 20);
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(30,18,10,.8)'; g.lineWidth = 6;
  g.strokeText(text, 256, 52);
  g.fillStyle = css(PALETTE.cream);
  g.fillText(text, 256, 52);
  const t = texture(c);
  t.anisotropy = 8;
  return t;
}

/* ---------- The ground and its trails ---------- */

// Tileable value noise: a lattice that wraps every `period` cells, smoothly interpolated.
function periodicNoise(seed) {
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 144269504) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const w = (i) => ((i % period) + period) % period;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(w(xi), w(yi)), b = hash(w(xi + 1), w(yi)), c = hash(w(xi), w(yi + 1)), d = hash(w(xi + 1), w(yi + 1));
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** Grain for the planet's surface (grey, tiles): fine grit over soft clods. Sampled triplanar. */
export function groundDetail() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const n = periodicNoise(5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.5;
    for (let o = 0, f = 4; o < 5; o++, f *= 2, amp *= 0.5) v += amp * n((x / S) * f, (y / S) * f, f);
    const grit = n(x * 0.75, y * 0.75, S * 0.75);
    const k = Math.max(0, Math.min(255, (v * 0.8 + grit * 0.35) * 255 - 20)) | 0;
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A gravel trail: crushed shell and coral with darker grit, u across (soft, ragged edges in
 *  alpha), v along (tiles). */
export function trailTexture() {
  const W = 256, H = 512;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  const n = periodicNoise(11);
  // crushed shell and coral, as Hawaiian garden paths are: pale, so it reads by moonlight
  const shell = new THREE.Color(PALETTE.cream), ash = new THREE.Color(PALETTE.ash), col = new THREE.Color();
  for (let y = 0; y < H; y++) {
    // a ragged edge that wanders along the trail (periodic in v, so the texture tiles)
    const edgeL = 0.1 + 0.12 * n(0.5, (y / H) * 8, 8) + 0.05 * n(3.5, (y / H) * 32, 32);
    const edgeR = 0.1 + 0.12 * n(7.5, (y / H) * 8, 8) + 0.05 * n(9.5, (y / H) * 32, 32);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const grit = n(x * 0.5, y * 0.5, 256), clod = n((x / W) * 6, (y / H) * 12, 12);
      col.copy(shell).lerp(ash, 0.35 + clod * 0.4).multiplyScalar(0.62 + grit * 0.45);
      const a = Math.min(1, Math.min(u / edgeL, (1 - u) / edgeR));
      const i = (y * W + x) * 4;
      img.data[i] = col.r * 255; img.data[i + 1] = col.g * 255; img.data[i + 2] = col.b * 255;
      img.data[i + 3] = Math.max(0, Math.min(1, a * a * (3 - 2 * a) * (0.85 + grit * 0.3))) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  // gravel: little stones, lit from the top left, drawn twice across the seam so v tiles
  let seed = 3;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const tones = [PALETTE.cream, PALETTE.stone, PALETTE.ash, PALETTE.coral, PALETTE.cream, PALETTE.basalt].map((c) => new THREE.Color(c));
  for (let i = 0; i < 1400; i++) {
    const x = 44 + rand() * (W - 88), y = rand() * H, r = 1 + rand() * rand() * 5;
    const t = tones[i % tones.length].clone().multiplyScalar(0.8 + rand() * 0.6);
    for (const yy of [y, y - H, y + H]) {
      g.fillStyle = `rgba(0,0,0,.35)`;
      g.beginPath(); g.ellipse(x + r * 0.3, yy + r * 0.35, r, r * 0.8, 0, 0, 7); g.fill();
      g.fillStyle = `#${t.getHexString()}`;
      g.beginPath(); g.ellipse(x, yy, r, r * 0.8, rand() * 3, 0, 7); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/* ---------- The robot's lithographed tin ---------- */

/**
 * A printed tin panel, as on 1950s toy robots (they were lithographed, not plain): the base
 * enamel colour, a printed cream line inset from the edge with a coral one inside it, seam
 * lines, rows of printed rivets with a highlight, and (optionally) a few vent slots. Every face
 * of a box maps to the whole texture, so each face gets its own bordered panel.
 */
export function tinLitho({ base = PALETTE.tinTeal, vents = false, stripes = false } = {}) {
  const S = 256;
  const [c, g] = canvas(S, S);
  const col = new THREE.Color(base);
  g.fillStyle = css(base);
  g.fillRect(0, 0, S, S);
  // a faint sheen across the sheet, as printed tin has
  const sheen = g.createLinearGradient(0, 0, S, S);
  sheen.addColorStop(0, 'rgba(255,255,255,.10)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,.10)');
  g.fillStyle = sheen; g.fillRect(0, 0, S, S);
  if (stripes) {
    // chevrons round the skirt
    g.fillStyle = css(PALETTE.cream);
    for (let x = -S; x < S * 2; x += 48) { g.beginPath(); g.moveTo(x, S * 0.3); g.lineTo(x + 24, S * 0.5); g.lineTo(x, S * 0.7); g.lineTo(x + 12, S * 0.7); g.lineTo(x + 36, S * 0.5); g.lineTo(x + 12, S * 0.3); g.fill(); }
    g.fillStyle = css(PALETTE.coral); g.fillRect(0, S * 0.2, S, 8); g.fillRect(0, S * 0.78, S, 8);
  } else {
    g.strokeStyle = css(PALETTE.cream); g.lineWidth = 7; g.strokeRect(14, 14, S - 28, S - 28);
    g.strokeStyle = css(PALETTE.coral); g.lineWidth = 3; g.strokeRect(24, 24, S - 48, S - 48);
    // printed rivets along the cream line, each with a dark dot and a highlight
    for (let i = 0; i <= 8; i++) {
      const k = 14 + (i / 8) * (S - 28);
      for (const [x, y] of [[k, 14], [k, S - 14], [14, k], [S - 14, k]]) {
        g.fillStyle = 'rgba(40,30,20,.55)'; g.beginPath(); g.arc(x + 1, y + 1, 3.2, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x - 0.8, y - 0.8, 1.3, 0, 7); g.fill();
      }
    }
    if (vents) {
      g.fillStyle = css(col.clone().multiplyScalar(0.35).getHex());
      for (let i = 0; i < 5; i++) { const y = S * 0.58 + i * 14; g.beginPath(); g.roundRect ? g.roundRect(S * 0.3, y, S * 0.4, 7, 3.5) : g.rect(S * 0.3, y, S * 0.4, 7); g.fill(); }
    }
  }
  // a couple of fine seams
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(S * 0.5, 30); g.lineTo(S * 0.5, S * 0.42); g.stroke();
  return texture(c);
}

/** A plumeria (frangipani) flower for the lei: five overlapping cupped petals, white to a warm
 *  centre. Drawn once; each flower in the lei is tinted. */
export function plumeria() {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.translate(S / 2, S / 2);
  for (let i = 0; i < 5; i++) {
    g.save();
    g.rotate((i / 5) * Math.PI * 2);
    const grd = g.createLinearGradient(0, 0, 0, -58);
    grd.addColorStop(0, css(PALETTE.amber)); grd.addColorStop(0.35, '#ffffff'); grd.addColorStop(1, '#f4f0ea');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(9, -30, 17, 30, 0.35, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1.5; g.stroke();
    g.restore();
  }
  return texture(c);
}
