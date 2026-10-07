// The telescope's live views (main.js lookThroughScope): through the eyepiece, the moon is the
// real one, this hour, from NASA (supabase/functions/sky asks Dial-A-Moon for it), and the sun is
// the real one today, through a solar filter (SDO's white-light picture, via SOHO). Each is a
// picture laid exactly over the body the planet's sky draws, turned so the moon's lit side faces
// this planet's sun, and the moon carries rings where people landed (_data/moon.yml), placed by
// its real libration and tilt. Nothing is fetched until someone looks through the telescope;
// without a connection the eyepiece shows the sky as drawn.
import * as THREE from 'three';

// Dial-A-Moon's pictures are 730 px, celestial north up; the moon's radius in them is this many
// px per arcsecond of its diameter (measured on three of them, at new, quarter and full)
const MOON_PX = 0.1757, MOON_SIZE = 730;
// SDO's white-light sun (sunspots), about 70 KB, updated through the day: where its disc is
const SUN = { url: 'https://soho.nascom.nasa.gov/data/realtime/hmi_igr/512/latest.jpg', size: 512, cx: 255.5, cy: 256, r: 237 };
const RAD = Math.PI / 180;

/** Where a spot on the moon is in Dial-A-Moon's picture: x right, y up, in moon radii. */
export function moonSpot(lat, lon, m) {
  const la = lat * RAD, lo = lon * RAD, l0 = m.subearth.lon * RAD, b0 = m.subearth.lat * RAD, P = m.posangle * RAD;
  const x = Math.cos(la) * Math.sin(lo - l0);
  const y = Math.cos(b0) * Math.sin(la) - Math.sin(b0) * Math.cos(la) * Math.cos(lo - l0);
  const z = Math.sin(b0) * Math.sin(la) + Math.cos(b0) * Math.cos(la) * Math.cos(lo - l0); // toward us
  return { x: x * Math.cos(P) - y * Math.sin(P), y: x * Math.sin(P) + y * Math.cos(P), z };
}
/** Is a spot on the moon in daylight? */
function sunlit(lat, lon, m) {
  const a = [lat * RAD, lon * RAD], s = [m.subsolar.lat * RAD, m.subsolar.lon * RAD];
  return Math.sin(a[0]) * Math.sin(s[0]) + Math.cos(a[0]) * Math.cos(s[0]) * Math.cos(a[1] - s[1]) > 0;
}

export function createEyepiece({ layer, db, sites = [], sunDir, onSite }) {
  let moon = null, loading = null, status = 'idle'; // the live moon: idle | loading | live | failed
  const disc = document.createElement('div');
  disc.className = 'eyepiece__disc';
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  disc.append(img);
  layer.append(disc);
  const marks = sites.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'eyepiece__mark';
    b.setAttribute('aria-label', `${s.name}, ${s.when}`);
    b.hidden = true;
    b.addEventListener('click', () => onSite(i));
    layer.append(b);
    return b;
  });
  const label = document.createElement('span');
  label.className = 'eyepiece__label';
  label.hidden = true;
  layer.append(label);
  let shown = null; // which picture is in the <img>: 'moon' | 'full' | 'sun'

  /** Ask for this hour's moon (kept in the browser for the hour). */
  function load() {
    if (moon || loading) return loading;
    const hour = new Date().toISOString().slice(0, 13);
    try { const k = JSON.parse(localStorage.getItem('world-moon') || 'null'); if (k && k.hour === hour) { moon = k.moon; status = 'live'; return null; } } catch (e) {}
    status = 'loading';
    loading = fetch(`${db.url}/functions/v1/sky`, { headers: { apikey: db.key, authorization: `Bearer ${db.key}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.moon && d.moon.image) {
          moon = d.moon;
          status = 'live';
          try { localStorage.setItem('world-moon', JSON.stringify({ hour, moon })); } catch (e) {}
        }
      })
      .catch(() => {})
      .finally(() => { loading = null; if (!moon) status = 'failed'; });
    return loading;
  }
  function show(which) {
    if (shown === which) return;
    shown = which;
    if (which === 'moon' && moon) img.src = moon.image;
    else if (which === 'full' && moon && moon.full) img.src = moon.full.image;
    else if (which === 'sun') img.src = SUN.url;
    else img.removeAttribute('src');
  }

  const _c = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  return {
    load,
    get moon() { return moon; },
    get status() { return status; },
    /** The picture in the eyepiece now: none | loading | shown | failed. */
    get picture() { return !shown || !img.getAttribute('src') ? 'none' : !img.complete ? 'loading' : img.naturalWidth ? 'shown' : 'failed'; },
    /** The sites in daylight tonight (once the real moon's in). */
    lit(i) { const s = sites[i]; return !!(moon && s && sunlit(s.lat, s.lon, moon)); },
    /** A site in the dark tonight is looked at closely on the nearest full moon: when that is. */
    daylight(i) { const s = sites[i]; return moon && moon.full && s && !sunlit(s.lat, s.lon, moon) ? moon.full.time : null; },
    /**
     * Each frame at the eyepiece: lay the picture over `body` ({ id, dir, across, dist }) as the
     * camera sees it, faded by `k` (0..1); `site` is the one looked at closely, or -1. Returns
     * where each site's ring is (for aiming at one), or null.
     */
    update(camera, rect, body, k, site = -1) {
      // a landing site that's in the dark tonight: the nearest full moon's picture instead, in daylight
      const dark = site >= 0 && this.daylight(site);
      const id = body && (body.id === 'moon' && moon ? (dark ? 'full' : 'moon') : body.id === 'sun' ? 'sun' : null);
      const m = id === 'full' ? moon.full : moon;
      show(id);
      const on = !!id && img.complete && img.naturalWidth > 0 && k > 0; // shown once it's in
      layer.style.opacity = on ? Math.min(1, k * 1.4).toFixed(3) : '0';
      if (!on) { for (const b of marks) b.hidden = true; label.hidden = true; return null; }
      // the body's centre and radius on screen
      camera.updateMatrixWorld();
      _c.copy(camera.position).addScaledVector(body.dir, body.dist).project(camera);
      const cx = (_c.x + 1) / 2 * rect.width, cy = (1 - _c.y) / 2 * rect.height;
      const R = Math.tan(body.across / 2) / Math.tan(camera.fov * RAD / 2) * rect.height / 2;
      // turn the moon so its lit side faces this planet's sun, as seen from here
      let turn = 0;
      if (id === 'moon' || id === 'full') { // (the full moon's turned the same way, so north stays put)
        _s.copy(sunDir).transformDirection(_m.copy(camera.matrixWorldInverse));
        const ss = moonSpot(moon.subsolar.lat, moon.subsolar.lon, moon);
        turn = Math.atan2(_s.y, _s.x) - Math.atan2(ss.y, ss.x); // counter-clockwise, y up
      }
      const P = id !== 'sun' ? { size: MOON_SIZE, cx: MOON_SIZE / 2, cy: MOON_SIZE / 2, r: m.diameter * MOON_PX } : SUN;
      const scale = R / P.r;
      disc.style.width = disc.style.height = `${(2 * R).toFixed(1)}px`;
      disc.style.transform = `translate(${(cx - R).toFixed(1)}px, ${(cy - R).toFixed(1)}px)`;
      img.style.width = `${(P.size * scale).toFixed(1)}px`;
      img.style.transformOrigin = `${(P.cx * scale).toFixed(1)}px ${(P.cy * scale).toFixed(1)}px`;
      img.style.transform = `translate(${(R - P.cx * scale).toFixed(1)}px, ${(R - P.cy * scale).toFixed(1)}px) rotate(${(-turn / RAD).toFixed(2)}deg)`;
      if (id === 'sun') { for (const b of marks) b.hidden = true; label.hidden = true; return null; }
      const cos = Math.cos(turn), sin = Math.sin(turn);
      label.hidden = true;
      return sites.map((s, i) => {
        const p = moonSpot(s.lat, s.lon, m);
        const x = cx + R * (p.x * cos - p.y * sin), y = cy - R * (p.x * sin + p.y * cos);
        const b = marks[i];
        b.hidden = p.z < 0.15; // round the limb: not where you could pick it out
        b.classList.toggle('is-dark', id === 'moon' && !sunlit(s.lat, s.lon, moon));
        b.classList.toggle('is-open', i === site);
        b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        if (i === site && !b.hidden) { // its name beside it, so you know which ring you're on
          if (label.textContent !== s.name) label.textContent = s.name;
          label.hidden = false;
          label.style.transform = `translate(${(x + 18).toFixed(1)}px, ${(y - 9).toFixed(1)}px)`;
        }
        return { x, y };
      });
    },
    hide() { show(null); layer.style.opacity = '0'; label.hidden = true; for (const b of marks) b.hidden = true; },
  };
}
