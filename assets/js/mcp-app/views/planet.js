// The planet's view in the Planets connector's card (card.js is the shell):
//   planet   preview_planet: the planet itself, their own small world in a frame (/p/preview/#…,
//            assets/js/planets/), on a computer and in a phone's app alike, or, where 3D can't run
//            (no WebGL2, a host that won't show the frame, a page that fails), who it's for and
//            what they love as a plain card. Either way a link opens it in the browser, full size.
// The preview page tells this card how it's going (tellCard in assets/js/world/spec.js): loading,
// ready, or failed; a frame that says nothing at all was blocked, and the plain card takes over.
// Once it's drawn, it sends a few views of itself ("look"), which go into the model's context where
// the host takes pictures there, so the AI that made the planet can see it and fix what's off.
import { app, button, caps, css, el, full, goFull, host, request, views } from '../card.js';

const SILENT_MS = 12000; // a frame that hasn't said "loading" by now isn't going to
const LOADING_MS = 60000; // a page that loaded but never draws still needs a way out

const open = (url) => request('ui/open-link', { url }).catch(() => window.open(url, '_blank', 'noopener'));

function plain(p, box) {
  box.textContent = '';
  if (p.links.length) {
    const ul = el('ul', 'pl-list');
    for (const l of p.links) {
      const li = el('li');
      li.append(button('w-link pl-a', l.label, () => open(l.href)));
      if (l.note) li.append(el('span', 'w-cap', l.note));
      ul.append(li);
    }
    box.append(ul);
  }
  for (const c of p.loves) {
    box.append(el('p', 'w-kicker', c.title));
    const ul = el('ul', 'pl-list');
    for (const n of c.items) ul.append(el('li', null, n));
    box.append(ul);
  }
}

views.planet = (data) => {
  const p = data.planet;
  // the plain card's heading (in 3D, the planet's own top bar says who it is)
  const head = el('header', 'w-head');
  const titles = el('div');
  titles.append(el('h2', 'pl-name', p.name), el('p', 'w-sub', p.home ? `A tiny planet in ${p.home}` : 'A tiny planet'));
  head.append(titles);
  const stage = el('div', 'pl-stage'), parts = el('div', 'pl-parts');
  // 3D wherever WebGL2 runs, phones included (Steve: the phone and the computer should be the same);
  // if the frame then fails or says nothing, the plain card takes over
  let gl = false;
  try { gl = !!document.createElement('canvas').getContext('webgl2'); } catch (e) { /* none */ }
  const actions = el('div', 'w-actions'), threeD = gl;
  // in 3D here, it opens bigger in the browser; on the plain card, it's the only way to walk round it
  const walk = button('w-btn w-btn--primary', threeD ? 'Open in browser' : 'Walk around it', () => open(data.url));
  let cleanup = () => {};
  const showPlain = () => { cleanup(); stage.replaceWith(head); plain(p, parts); walk.textContent = 'Walk around it'; };
  actions.append(walk);
  if (threeD) {
    const frame = el('iframe', 'pl-frame');
    frame.title = `${p.name}: a tiny planet`;
    frame.src = data.url;
    stage.append(frame);
    let heard = false;
    const silent = setTimeout(() => { if (!heard) showPlain(); }, SILENT_MS);
    const loading = setTimeout(showPlain, LOADING_MS);
    const origin = new URL(data.url).origin;
    const listen = (e) => {
      // Sandboxed MCP hosts can give every nested page an opaque origin. Accept that only
      // from this exact child window; a normal page must also match the preview site's origin.
      if (e.source !== frame.contentWindow || (e.origin !== 'null' && e.origin !== origin) || !e.data || !e.data.planet) return;
      heard = true;
      if (e.data.planet === 'failed') showPlain();
      if (e.data.planet === 'ready') { clearTimeout(silent); clearTimeout(loading); }
      if (e.data.planet === 'look' && caps.updateModelContext?.image && e.data.detail?.images?.length) {
        const { text, images } = e.data.detail;
        request('ui/update-model-context', { content: [{ type: 'text', text }, ...images.map((data) => ({ type: 'image', data, mimeType: 'image/jpeg' }))] }).catch(() => {});
      }
    };
    cleanup = () => { clearTimeout(silent); clearTimeout(loading); removeEventListener('message', listen); };
    addEventListener('message', listen);
    app.append(stage);
    if ((host.availableDisplayModes || []).includes('fullscreen') && !full()) actions.prepend(button('w-btn', 'Full screen', () => goFull()));
  } else { app.append(head); plain(p, parts); }
  app.append(parts, actions);
  return cleanup; // the shell calls it when a result replaces this view or the host tears it down
};

css(`
.pl-name { margin: 0; font-size: 22px; }
.pl-stage { margin: -14px -14px 0; background: #0b0d1c; }
.pl-frame { display: block; width: 100%; height: 440px; border: 0; }
.is-full .pl-frame { height: calc(100vh - 150px); }
.pl-parts { display: grid; gap: 8px; }
.pl-parts:empty { display: none; }
.pl-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.pl-list li { display: grid; }
.pl-a { min-height: 32px; text-align: left; font-weight: 600; }
`);
