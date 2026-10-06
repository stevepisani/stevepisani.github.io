// What every private app at /apps is built on (docs/apps.md): the Supabase client, the
// members-only gate, a table with its failures said out loud, saving as you type, photos, and a
// form in a dialog. An app is a page with `layout: app` and a script beside this folder that
// calls start().
import { createClient } from '@supabase/supabase-js';
import { SIZES, QUALITY, copyPath, copyPaths } from './photo-sizes.js';

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content || '';
export const db = createClient(meta('supabase-url'), meta('supabase-key'));
export const $ = (sel, el = document) => el.querySelector(sel);

// One line at the bottom of the screen, gone in a few seconds (longer when it's bad news, or
// when it offers a way back: `undo` runs if its Undo button is pressed in time).
let toastTimer;
export function toast(text, bad = false, undo = null) {
  const el = $('#app-toast');
  el.textContent = text;
  if (undo) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'app-toast__undo', textContent: 'Undo' });
    b.addEventListener('click', () => { el.hidden = true; undo(); }, { once: true });
    el.append(b);
  }
  el.classList.toggle('is-bad', bad);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, bad || undo ? 6000 : 3000);
}

// The gate: the sign-in form until a member is signed in, then the app. Who's a member is the
// database's call (public.members, through is_member()); row-level security enforces it, this
// only decides what to show. `open(user)` runs each time a member arrives, `close()` when they
// sign out (so nothing of theirs is left in the page). An app that keeps a copy of its data on
// the phone passes `{ offline: true }`: then with no connection it opens for whoever was last
// signed in on this browser (the database can't be asked, and its token may have run out), with
// `user.offline` set, and shows what it kept. (Row-level security still decides what any change
// it sends later may touch.)
export function start(open = () => {}, close = () => {}, { offline = false } = {}) {
  const app = $('#app'), note = $('#gate-note');
  let current; // the address the page is showing things for (null: nobody; undefined: not asked yet)
  const show = (state) => {
    app.dataset.state = state;
    $('#app-gate').hidden = state !== 'out';
    $('#app-main').hidden = state !== 'in';
    $('#app-who').hidden = state !== 'in';
    const nav = $('[data-members]'); // the nav's Apps link (site.js shows it on the other pages)
    if (nav) nav.hidden = state !== 'in';
  };

  const kept = () => { // the person last signed in here, from supabase-js's own copy of the session
    try { return JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k))))?.user || null; } catch (e) { return null; }
  };
  const cut = (error) => !navigator.onLine || /fetch|network|load failed/i.test(error?.message || '');
  async function arrive(session) {
    if (!session && offline && !navigator.onLine && kept()) session = { user: { ...kept(), offline: true } };
    const email = session?.user?.email || null;
    if (email === current) return; // a refreshed token, not a new person
    current = email;
    if (!email) { close(); return show('out'); }
    const { data, error } = session.user.offline ? { error: { message: 'offline' } } : await db.rpc('is_member');
    if (current !== email) return; // someone else arrived while it was asking
    if (offline && error && (session.user.offline || cut(error))) {
      $('#app-email').textContent = email;
      show('in');
      return open({ ...session.user, offline: true });
    }
    if (error || data !== true) {
      current = null;
      if (!error) await db.auth.signOut();
      note.textContent = error ? "Couldn't reach the database. Try again in a minute." : `${email} isn't on the list.`;
      return show('out');
    }
    $('#app-email').textContent = email;
    show('in');
    await open(session.user);
  }

  // A sign-in link that's expired or been used (mail apps that preview links use them up) comes
  // back with the reason in the address; say so rather than showing a bare form.
  if (new URLSearchParams(location.hash.slice(1)).get('error')) {
    note.textContent = 'That sign-in link has expired or was already used. Send a new one.';
    history.replaceState(null, '', location.pathname + location.search);
  }

  // The first event carries the session kept in this browser (or the one in a sign-in link).
  // Supabase calls made inside the callback would wait on themselves, hence the timeout.
  db.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => arrive(session).catch((e) => { console.error(e); toast("Something went wrong. Reload the page.", true); }), 0);
  });

  $('#gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(new FormData(e.target).get('email')).trim().toLowerCase(), send = $('button', e.target);
    send.disabled = true; // a second request inside a minute is refused, and would read as a failure
    note.textContent = 'Sending…';
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname + location.search, shouldCreateUser: false }, // sign-ups are off; the query keeps the consent page's request
    });
    note.textContent = error
      ? "That didn't send. Only members can sign in; check the address."
      : `Check ${email} for a sign-in link, and open it on this device.`;
    send.disabled = false;
  });
  $('#app-signout').addEventListener('click', () => db.auth.signOut());
}

// A table. Every call says so (a toast) when it fails, and returns null or false. With trash,
// remove moves a row to the trash (deleted_at; restorable for 30 days, docs/apps.md) and list leaves
// the trash out.
export function rows(table, { trash = false } = {}) {
  const done = ({ data, error }, doing) => {
    if (!error) return data ?? true;
    console.error(error);
    toast(`${doing} didn't work: ${error.message}`, true);
    return null;
  };
  return {
    list: async (order = 'created_at') => { let r = db.from(table).select('*'); if (trash) r = r.is('deleted_at', null); return done(await r.order(order), 'Loading'); },
    add: async (values) => done(await db.from(table).insert(values).select(), 'Adding'), // rows in, rows out
    // asks for the row back: an update that matches nothing (removed on another phone) isn't an error
    set: async (id, patch) => {
      const changed = done(await db.from(table).update(patch).eq('id', id).select('id'), 'Saving');
      if (changed && !changed.length) toast("That didn't save: it's been removed somewhere else. Reload the page.", true);
      return !!changed && changed.length > 0;
    },
    remove: async (id) => done(await (trash ? db.from(table).update({ deleted_at: new Date().toISOString() }) : db.from(table).delete()).eq('id', id), 'Deleting') !== null,
  };
}

// Saves a field a moment after the typing stops, at once on leaving it, and when the page is
// hidden (a phone locked, another app opened) or left. One field's saves go out one at a time,
// in order, each with the latest text. The field's border says where it is (data-save: saving,
// saved, failed). `save(value)` answers true when it worked.
const pending = new Set(); // saves still waiting on their timer
const flush = () => [...pending].forEach((run) => run());
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
export function saver(el, save, wait = 800) {
  let timer = null, n = 0, queue = Promise.resolve();
  const run = () => {
    clearTimeout(timer);
    timer = null;
    pending.delete(run);
    const mine = ++n;
    queue = queue.then(async () => {
      if (mine !== n) return; // a newer save is queued behind this one, with the latest text
      const ok = await save(el.value);
      if (mine !== n || timer) return;
      el.dataset.save = ok ? 'saved' : 'failed';
      if (ok) setTimeout(() => { if (mine === n && !timer) delete el.dataset.save; }, 1200);
    });
  };
  el.addEventListener('input', () => { clearTimeout(timer); el.dataset.save = 'saving'; pending.add(run); timer = setTimeout(run, wait); });
  el.addEventListener('change', () => { if (timer) run(); });
}

// Runs `again` when someone comes back to the page after a minute or more away, so a tab left
// open doesn't show (and then save over) what the other person has changed since. Not while
// something is being edited.
export function fresh(again) {
  let left = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { left = Date.now(); return; }
    const editing = pending.size || $('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ($('#app').dataset.state === 'in' && left && Date.now() - left > 60000 && !editing) again();
  });
}

// A dialog that behaves like a sheet (docs/apps.md): on a phone it rises from the bottom with a
// grabber and a swipe down puts it away; anywhere, Esc or a tap outside it does too. Each of those,
// and its [data-close] buttons, go through one way out: `dialog.dismiss` (by default, close it),
// so a sheet that holds unsaved typing can ask first. Wired once per dialog.
// Opens a dialog holding focus itself rather than its first button (which Safari would draw a
// ring round, as if it had been tabbed to); Tab still goes straight into it, and VoiceOver reads
// its title
export function open(dialog) {
  dialog.tabIndex = -1;
  if (!dialog.open) dialog.showModal();
  dialog.focus({ preventScroll: true });
}
export function sheet(dialog, dismiss) {
  if (dismiss) dialog.dismiss = dismiss;
  if (dialog.dataset.sheet) return dialog;
  dialog.dataset.sheet = '1';
  dialog.dismiss ||= () => dialog.close('');
  const out = () => dialog.dismiss();
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return out();
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) out(); // the backdrop
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); out(); }); // Esc
  // the swipe: only from the top of the sheet's scroll, never from inside a field
  let y0 = null, dy = 0, t0 = 0;
  dialog.addEventListener('touchstart', (e) => {
    y0 = dialog.scrollTop <= 0 && !e.target.closest('input, textarea, select, .photo-strip, .cats') ? e.touches[0].clientY : null;
    dy = 0; t0 = Date.now();
  }, { passive: true });
  dialog.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) { dialog.style.transform = ''; return; }
    e.preventDefault();
    dialog.style.transition = 'none';
    dialog.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  dialog.addEventListener('touchend', () => {
    if (y0 == null) return;
    y0 = null;
    dialog.style.transition = '';
    dialog.style.transform = '';
    if (dy > 120 || (dy > 50 && dy / (Date.now() - t0) > 0.5)) out();
  });
  return dialog;
}

// Opens a <dialog> holding a <form method="dialog">; resolves with the form's values when it's
// submitted by its button (value "ok"), or null when it's closed any other way. Enter presses a
// form's first submit button, so the "ok" button is the only one: Cancel is a plain button with
// data-close. Cancel (or Esc, or a swipe) never throws away what was typed without asking:
// `dirty()` says whether there's anything to lose (by default, anything typed since it opened).
export function ask(dialog, { dirty } = {}) {
  const form = $('form', dialog);
  form.reset();
  dialog.returnValue = '';
  let touched = false;
  const mark = () => { touched = true; };
  form.addEventListener('input', mark);
  sheet(dialog, () => {
    if ((dirty ? dirty() : touched) && !confirm('Discard what you\'ve entered?')) return;
    dialog.close('');
  });
  open(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      form.removeEventListener('input', mark);
      resolve(dialog.returnValue === 'ok' ? Object.fromEntries(new FormData(form)) : null);
    }, { once: true });
  });
}

// For anyone who's asked for less motion
export const calm = matchMedia('(prefers-reduced-motion: reduce)');
// A tiny tap felt in the hand, where the phone can (Android; iPhones ignore it)
export const buzz = (ms = 8) => { try { if (!calm.matches) navigator.vibrate?.(ms); } catch (e) {} };

// A short burst of confetti in the theme's colours, from an element (or the top of the screen).
// Not for anyone who's asked for less motion.
export function celebrate(from = null) {
  if (calm.matches) return;
  const css = getComputedStyle($('#app') || document.documentElement), colors = ['--accent', '--ok', '--wet', '--mark', '--ink-3'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  const canvas = Object.assign(document.createElement('canvas'), { width: innerWidth, height: innerHeight });
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const r = from?.getBoundingClientRect(), x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : -20;
  const ctx = canvas.getContext('2d');
  const bits = Array.from({ length: r ? 70 : 120 }, (_, i) => {
    const a = r ? Math.random() * Math.PI * 2 : Math.PI / 2, v = r ? 3 + Math.random() * 7 : 4 + Math.random() * 5;
    return { x: r ? x : Math.random() * innerWidth, y: r ? y : -Math.random() * innerHeight, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (r ? 4 : 0), s: 5 + Math.random() * 7, c: colors[i % colors.length], spin: Math.random() * 6 };
  });
  const end = Date.now() + 2500;
  (function fall() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.x += b.vx; b.y += b.vy; b.vy += r ? 0.25 : 0; b.vx *= 0.99; b.spin += 0.1;
      ctx.fillStyle = b.c;
      ctx.fillRect(b.x, b.y, b.s, b.s * (0.4 + 0.3 * Math.abs(Math.sin(b.spin))));
    }
    if (Date.now() < end && bits.some((b) => b.y < canvas.height)) requestAnimationFrame(fall); else canvas.remove();
  })();
}

// Photos: one private bucket for every app, each app in its own folder, shown through signed
// links that last a week.
const BUCKET = 'photos', WEEK = 60 * 60 * 24 * 7, LONGEST = 1600, BIGGEST = 5 * 1024 * 1024;
// a canvas as a blob of `type`, or null when the browser can't write that type (it hands back a PNG)
const toBlob = (canvas, type, quality) => new Promise((r) => canvas.toBlob((b) => r(b && b.type === type ? b : null), type, quality));
export const photos = {
  // Stores a picture under `folder/` and returns its path. It's shrunk first to 1600px on its
  // long side (a phone photo goes from megabytes to a few hundred KB; the free plan has 1 GB).
  // `alpha` keeps a transparent background (a cut-out, as WebP); `longest` shrinks it further;
  // `copies` also stores the smaller copies (photo-sizes.js) so it shows fast from the start.
  async put(file, folder, { alpha = false, longest = LONGEST, copies = false } = {}) {
    let blob = file, ext = (/\.(\w+)$/.exec(file.name)?.[1] || 'jpg').toLowerCase(), img = null;
    const src = URL.createObjectURL(file);
    try {
      // through an <img>, which every browser turns the right way up (a phone's portrait photo)
      img = Object.assign(new Image(), { src });
      await img.decode();
      const k = Math.min(1, longest / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
      const ctx = canvas.getContext('2d');
      if (!alpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); } // under a transparent PNG
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const type = alpha ? 'image/webp' : 'image/jpeg';
      const small = await toBlob(canvas, type, 0.85);
      if (small) { blob = small; ext = alpha ? 'webp' : 'jpg'; }
    } catch (e) { /* a kind of picture the browser can't draw: store it as it is */ }
    if (blob.size > BIGGEST) { URL.revokeObjectURL(src); toast('That photo is too big (5 MB at most).', true); return null; }
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' });
    if (error) { URL.revokeObjectURL(src); console.error(error); toast(`The photo didn't upload: ${error.message}`, true); return null; }
    // the copies: WebP where the browser writes it, else JPEG on white (not for a cut-out, whose
    // transparency would be lost; the hourly job makes those). A copy that fails is made later.
    if (copies && img?.naturalWidth) {
      for (const px of Object.values(SIZES)) {
        const k = Math.min(1, px / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
        const ctx = canvas.getContext('2d');
        let small = await (ctx.drawImage(img, 0, 0, canvas.width, canvas.height), toBlob(canvas, 'image/webp', QUALITY));
        if (!small && !alpha) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); small = await toBlob(canvas, 'image/jpeg', QUALITY); }
        if (small) await db.storage.from(BUCKET).upload(copyPath(path, px), small, { contentType: small.type, upsert: true }).catch(() => {});
      }
    }
    URL.revokeObjectURL(src);
    return path;
  },
  // Signed links for many paths in one request: a Map of path → link. With `px` (a size from
  // photo-sizes.js), each path's link is to its copy that size, or to the file itself until the
  // copy is made: both are signed at once, and a copy that isn't there yet simply has no link.
  async urls(paths, px) {
    if (!paths.length) return new Map();
    const ask = px ? paths.flatMap((p) => [p, copyPath(p, px)]) : paths;
    const { data, error } = await db.storage.from(BUCKET).createSignedUrls(ask, WEEK);
    if (error) { console.error(error); return new Map(); }
    const got = new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    return new Map(paths.filter((p) => got.has(p)).map((p) => [p, (px && got.get(copyPath(p, px))) || got.get(p)]));
  },
  // Deletes pictures nothing points at any more. Quietly: a leftover file isn't worth a warning.
  async remove(...paths) {
    paths = paths.filter(Boolean).flatMap((p) => [p, ...copyPaths(p)]);
    if (paths.length) await db.storage.from(BUCKET).remove(paths).catch(() => {});
  },
};
