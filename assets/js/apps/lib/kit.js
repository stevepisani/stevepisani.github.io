// What every private app at /apps is built on (docs/apps.md): the Supabase client, the
// members-only gate, a table with its failures said out loud, saving as you type, photos, and a
// form in a dialog. An app is a page with `layout: app` and a script beside this folder that
// calls start().
import { createClient } from '@supabase/supabase-js';

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

// Opens a <dialog> holding a <form method="dialog">; resolves with the form's values when it's
// submitted by its button (value "ok"), or null when it's closed any other way. Enter presses a
// form's first submit button, so the "ok" button is the only one: Cancel is a plain button with
// data-close.
export function ask(dialog) {
  const form = $('form', dialog);
  form.reset();
  dialog.returnValue = '';
  dialog.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => dialog.close(''); });
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok' ? Object.fromEntries(new FormData(form)) : null), { once: true });
  });
}

// Photos: one private bucket for every app, each app in its own folder, shown through signed
// links that last a week.
const BUCKET = 'photos', WEEK = 60 * 60 * 24 * 7, LONGEST = 1600, BIGGEST = 5 * 1024 * 1024;
export const photos = {
  // Stores a picture under `folder/` and returns its path. It's shrunk first to 1600px on its
  // long side (a phone photo goes from megabytes to a few hundred KB; the free plan has 1 GB).
  // `alpha` keeps a transparent background (a cut-out, as WebP); `longest` shrinks it further.
  async put(file, folder, { alpha = false, longest = LONGEST } = {}) {
    let blob = file, ext = (/\.(\w+)$/.exec(file.name)?.[1] || 'jpg').toLowerCase();
    const src = URL.createObjectURL(file);
    try {
      // through an <img>, which every browser turns the right way up (a phone's portrait photo)
      const img = Object.assign(new Image(), { src });
      await img.decode();
      const k = Math.min(1, longest / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
      const ctx = canvas.getContext('2d');
      if (!alpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); } // under a transparent PNG
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const type = alpha ? 'image/webp' : 'image/jpeg';
      const small = await new Promise((r) => canvas.toBlob(r, type, 0.85));
      if (small && small.type === type) { blob = small; ext = alpha ? 'webp' : 'jpg'; }
    } catch (e) { /* a kind of picture the browser can't draw: store it as it is */ }
    URL.revokeObjectURL(src);
    if (blob.size > BIGGEST) { toast('That photo is too big (5 MB at most).', true); return null; }
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' });
    if (error) { console.error(error); toast(`The photo didn't upload: ${error.message}`, true); return null; }
    return path;
  },
  // Signed links for many paths in one request: a Map of path → link.
  async urls(paths) {
    if (!paths.length) return new Map();
    const { data, error } = await db.storage.from(BUCKET).createSignedUrls(paths, WEEK);
    if (error) { console.error(error); return new Map(); }
    return new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  },
  // Deletes pictures nothing points at any more. Quietly: a leftover file isn't worth a warning.
  async remove(...paths) {
    paths = paths.filter(Boolean);
    if (paths.length) await db.storage.from(BUCKET).remove(paths).catch(() => {});
  },
};
