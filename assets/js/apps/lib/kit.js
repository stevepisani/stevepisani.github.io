// What every private app at /apps is built on (docs/apps.md): the Supabase client, the
// members-only gate, a table with its failures said out loud, saving as you type, photos, and a
// form in a dialog. An app is a page with `layout: app` and a script beside this folder that
// calls start().
import { createClient } from '@supabase/supabase-js';

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content || '';
export const db = createClient(meta('supabase-url'), meta('supabase-key'));
export const $ = (sel, el = document) => el.querySelector(sel);

// One line at the bottom of the screen, gone in a few seconds (longer when it's bad news).
let toastTimer;
export function toast(text, bad = false) {
  const el = $('#app-toast');
  el.textContent = text;
  el.classList.toggle('is-bad', bad);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, bad ? 6000 : 3000);
}

// The gate: the sign-in form until a member is signed in, then the app. Who's a member is the
// database's call (public.members, through is_member()); row-level security enforces it, this
// only decides what to show. `open(user)` runs each time a member arrives.
export function start(open = () => {}) {
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

  async function arrive(session) {
    const email = session?.user?.email || null;
    if (email === current) return; // a refreshed token, not a new person
    current = email;
    if (!email) return show('out');
    const { data, error } = await db.rpc('is_member');
    if (current !== email) return; // someone else arrived while it was asking
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

  // The first event carries the session kept in this browser (or the one in a sign-in link).
  // Supabase calls made inside the callback would wait on themselves, hence the timeout.
  db.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => arrive(session).catch((e) => { console.error(e); toast("Something went wrong. Reload the page.", true); }), 0);
  });

  $('#gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(new FormData(e.target).get('email')).trim().toLowerCase();
    note.textContent = 'Sending…';
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false }, // sign-ups are off
    });
    note.textContent = error
      ? "That didn't send. Only members can sign in; check the address."
      : `Check ${email} for a sign-in link, and open it on this device.`;
  });
  $('#app-signout').addEventListener('click', () => db.auth.signOut());
}

// A table. Every call says so (a toast) when it fails, and returns null or false.
export function rows(table) {
  const done = ({ data, error }, doing) => {
    if (!error) return data ?? true;
    console.error(error);
    toast(`${doing} didn't work: ${error.message}`, true);
    return null;
  };
  return {
    list: async (order = 'created_at') => done(await db.from(table).select('*').order(order), 'Loading'),
    add: async (values) => done(await db.from(table).insert(values).select(), 'Adding'), // rows in, rows out
    set: async (id, patch) => done(await db.from(table).update(patch).eq('id', id), 'Saving') !== null,
    remove: async (id) => done(await db.from(table).delete().eq('id', id), 'Removing') !== null,
  };
}

// Saves a field a moment after the typing stops, or at once on leaving it. The field's border
// says where it is (data-save: saving, saved, failed). `save(value)` answers true when it worked.
export function saver(el, save, wait = 800) {
  let timer = null, n = 0;
  const run = async () => {
    timer = null;
    const mine = ++n;
    const ok = await save(el.value);
    if (mine !== n) return; // a newer save is on its way
    el.dataset.save = ok ? 'saved' : 'failed';
    if (ok) setTimeout(() => { if (mine === n && !timer) delete el.dataset.save; }, 1200);
  };
  el.addEventListener('input', () => { clearTimeout(timer); el.dataset.save = 'saving'; timer = setTimeout(run, wait); });
  el.addEventListener('change', () => { if (timer) { clearTimeout(timer); run(); } });
}

// Opens a <dialog> holding a <form method="dialog">; resolves with the form's values when it's
// submitted by a button whose value is "ok", or null when it's closed any other way.
export function ask(dialog) {
  const form = $('form', dialog);
  form.reset();
  dialog.returnValue = '';
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
  async put(file, folder) {
    let blob = file, ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, LONGEST / Math.max(bmp.width, bmp.height));
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // under a transparent PNG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const small = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (small) { blob = small; ext = 'jpg'; }
    } catch (e) { /* a kind of picture the browser can't draw: store it as it is */ }
    if (blob.size > BIGGEST) { toast('That photo is too big (5 MB at most).', true); return null; }
    const path = `${folder}/${Date.now()}.${ext}`;
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
