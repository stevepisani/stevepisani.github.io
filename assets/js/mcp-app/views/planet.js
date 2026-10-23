// The planet's view in the Planets connector's card (card.js is the shell):
//   planet   preview_planet: the planet itself, the homepage's world in a frame (/p/preview/#…),
//            or, where 3D can't run here (a phone's app, a host that won't show the frame), its
//            parts as a plain card. Either way a link opens it in the browser, full size.
// The preview page tells this card how it's going (assets/js/world/spec.js tellCard): loading,
// ready, or failed; a frame that says nothing at all was blocked, and the plain card takes over.
import { app, button, css, el, full, goFull, host, request, views } from '../card.js';

const SILENT_MS = 12000; // a frame that hasn't said "loading" by now isn't going to

const open = (url) => request('ui/open-link', { url }).catch(() => window.open(url, '_blank', 'noopener'));

function plain(p, box) {
  box.textContent = '';
  if (p.robot) box.append(el('p', 'pl-robot', `“${p.robot}”`));
  if (p.links.length) {
    box.append(el('p', 'w-kicker', 'The menu'));
    const ul = el('ul', 'pl-list');
    for (const l of p.links) {
      const li = el('li');
      const outside = /^(https:|mailto:)/.test(l.href);
      li.append(outside ? button('w-link pl-a', l.label, () => open(l.href)) : el('strong', null, l.label));
      if (l.note) li.append(el('span', 'w-cap', l.note));
      ul.append(li);
    }
    box.append(ul);
  }
  if (p.board.names.length) { box.append(el('p', 'w-kicker', `On the chalkboard: ${p.board.title}`)); const ul = el('ul', 'pl-list'); for (const n of p.board.names) ul.append(el('li', null, n)); box.append(ul); }
  if (p.thoughts.length) { box.append(el('p', 'w-kicker', 'By the fire')); const ul = el('ul', 'pl-list'); for (const t of p.thoughts) ul.append(el('li', null, t)); box.append(ul); }
}

views.planet = (data) => {
  const p = data.planet;
  // the plain card's heading (in 3D, the planet's own top bar says who it is)
  const head = el('header', 'w-head');
  const titles = el('div');
  titles.append(el('h2', 'pl-sign', p.sign), el('p', 'w-sub', p.home ? `${p.name}'s tiny planet, in ${p.home}` : `${p.name}'s tiny planet`));
  head.append(titles);
  const stage = el('div', 'pl-stage'), parts = el('div', 'pl-parts');
  // 3D where it can run: not in a phone's app (a heavy page in a small webview), and only with WebGL2
  const phone = host.platform === 'mobile' || matchMedia('(pointer: coarse)').matches;
  let gl = false;
  try { gl = !!document.createElement('canvas').getContext('webgl2'); } catch (e) { /* none */ }
  const actions = el('div', 'w-actions'), threeD = !phone && gl;
  // in 3D here, it opens bigger in the browser; on the plain card, it's the only way to walk round it
  const walk = button('w-btn w-btn--primary', threeD ? 'Open in browser' : 'Walk around it', () => open(data.url));
  const showPlain = () => { stage.replaceWith(head); plain(p, parts); walk.textContent = 'Walk around it'; };
  actions.append(walk);
  if (threeD) {
    const frame = el('iframe', 'pl-frame');
    frame.title = `${p.sign}: a tiny planet`;
    frame.src = data.url;
    stage.append(frame);
    let heard = false;
    const silent = setTimeout(() => { if (!heard) showPlain(); }, SILENT_MS);
    const listen = (e) => {
      if (e.source !== frame.contentWindow || !e.data || !e.data.planet) return;
      heard = true;
      if (e.data.planet === 'failed') { clearTimeout(silent); removeEventListener('message', listen); showPlain(); }
      if (e.data.planet === 'ready') clearTimeout(silent);
    };
    addEventListener('message', listen);
    app.append(stage);
    if ((host.availableDisplayModes || []).includes('fullscreen') && !full()) actions.prepend(button('w-btn', 'Full screen', () => goFull()));
  } else { app.append(head); plain(p, parts); }
  app.append(parts, actions);
};

css(`
@font-face { font-family: Pacifico; font-display: swap; src: url(https://stevenpisani.com/assets/fonts/pacifico-latin.woff2) format('woff2'); }
.pl-sign { margin: 0; font: 400 28px/1.2 Pacifico, "Brush Script MT", cursive; color: #ff4fa3; text-shadow: 0 0 6px rgb(255 79 163 / .55); }
.pl-stage { margin: -14px -14px 0; background: #0b0d1c; }
.pl-frame { display: block; width: 100%; height: 440px; border: 0; }
.is-full .pl-frame { height: calc(100vh - 150px); }
.pl-parts { display: grid; gap: 8px; }
.pl-parts:empty { display: none; }
.pl-robot { font-style: italic; color: var(--w-ink2); }
.pl-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.pl-list li { display: grid; }
.pl-a { min-height: 32px; text-align: left; font-weight: 600; }
`);
