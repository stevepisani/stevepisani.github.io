// Fireflies: everyone else on the planet right now, each a firefly drifting a little above where
// they are. Supabase Realtime presence over a plain WebSocket (the Phoenix protocol, no client
// library): you join the `planet` channel under a random key made fresh for this page, and
// track where you are (a direction on the planet, rounded, and nothing else) when you've moved.
// At most 200 are drawn, one Points object, so a crowd costs the same as a few.
import * as THREE from 'three';
import { surfaceRadius } from './planet.js';

const MAX = 200;
const TOPIC = 'realtime:planet';
const HEARTBEAT = 25000, MIN_TRACK_GAP = 4000, MIN_MOVE = 0.06; // ~1.2 m of planet at radius 20

function spriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.12, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.22)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFireflies(scene, { url, key }) {
  const positions = new Float32Array(MAX * 3), colors = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setDrawRange(0, 0);
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.13, map: spriteTexture(), vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);
  const GLOW = new THREE.Color(0xe4f76a).multiplyScalar(3.2); // warm yellow-green, bright enough to bloom

  const me = Math.random().toString(36).slice(2, 10);
  const others = new Map(); // key -> { to: Vector3 (dir), at: Vector3 (world), phase }
  let ws = null, ref = 0, joined = false, beat = 0, retry = 1000;
  let mine = null, lastSent = null, lastSentAt = 0;

  const send = (topic, event, payload) => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref), join_ref: '1' }));
  };
  const put = (k, metas) => {
    if (k === me) return;
    const m = metas && metas[metas.length - 1];
    const p = m && Array.isArray(m.p) && m.p.length === 3 ? new THREE.Vector3(...m.p.map(Number)) : null;
    if (!p || !(p.lengthSq() > 0.5)) return;
    p.normalize();
    const o = others.get(k);
    if (o) o.to.copy(p);
    else others.set(k, { to: p, at: null, phase: Math.random() * Math.PI * 2 });
  };

  function connect() {
    if (ws || document.hidden) return;
    try {
      ws = new WebSocket(`${url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${key}&vsn=1.0.0`);
    } catch (e) { return; }
    ws.onopen = () => {
      retry = 1000;
      send(TOPIC, 'phx_join', { config: { broadcast: { self: false }, presence: { key: me }, postgres_changes: [] }, access_token: key });
      clearInterval(beat);
      beat = setInterval(() => send('phoenix', 'heartbeat', {}), HEARTBEAT);
    };
    ws.onmessage = (msg) => {
      let d;
      try { d = JSON.parse(msg.data); } catch (e) { return; }
      if (d.topic !== TOPIC) return;
      if (d.event === 'phx_reply' && d.ref === '1' && d.payload && d.payload.status === 'ok') { joined = true; lastSent = null; track(true); }
      else if (d.event === 'presence_state') { for (const [k, v] of Object.entries(d.payload || {})) put(k, v.metas); }
      else if (d.event === 'presence_diff') {
        for (const [k, v] of Object.entries((d.payload && d.payload.joins) || {})) put(k, v.metas);
        for (const k of Object.keys((d.payload && d.payload.leaves) || {})) others.delete(k);
      }
    };
    ws.onclose = () => {
      clearInterval(beat);
      if (joined) others.clear(); // everyone we knew about was on that connection
      ws = null; joined = false;
      if (!document.hidden) setTimeout(connect, (retry = Math.min(retry * 2, 60000)));
    };
    ws.onerror = () => {};
  }
  // Nobody's there while the tab is hidden: leave, and come back when it's visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (ws) ws.close(); }
    else connect();
  });

  function track(force) {
    if (!joined || !mine) return;
    const now = performance.now();
    if (!force && (now - lastSentAt < MIN_TRACK_GAP || (lastSent && lastSent.angleTo(mine) < MIN_MOVE))) return;
    lastSent = mine.clone();
    lastSentAt = now;
    send(TOPIC, 'presence', { type: 'presence', event: 'track', payload: { p: mine.toArray().map((v) => Math.round(v * 100) / 100) } });
  }

  connect();
  const _v = new THREE.Vector3();
  return {
    /** Where you are (any point on or above the planet); sent when you've moved enough. */
    setSelf(position) {
      (mine ||= new THREE.Vector3()).copy(position).normalize();
      track(false);
    },
    update(t, dt, still) {
      let i = 0;
      for (const o of others.values()) {
        if (i >= MAX) break;
        const r = surfaceRadius(o.to) + 1.25;
        _v.copy(o.to).multiplyScalar(r);
        if (!o.at) o.at = _v.clone();
        else o.at.lerp(_v, Math.min(1, dt * 0.8)); // drift over, don't jump
        const bob = still ? 0 : Math.sin(t * 1.3 + o.phase) * 0.12;
        const up = _v.copy(o.at).normalize();
        positions[i * 3] = o.at.x + up.x * bob;
        positions[i * 3 + 1] = o.at.y + up.y * bob;
        positions[i * 3 + 2] = o.at.z + up.z * bob;
        const k = still ? 1 : 0.55 + 0.45 * Math.max(0, Math.sin(t * 2.1 + o.phase * 3)); // the slow blink
        colors[i * 3] = GLOW.r * k; colors[i * 3 + 1] = GLOW.g * k; colors[i * 3 + 2] = GLOW.b * k;
        i++;
      }
      geo.setDrawRange(0, i);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    get count() { return Math.min(others.size, MAX); },
    /** For tests: someone at `dir` ([x, y, z]), as if they'd joined. */
    fake(k, dir) { put(k, [{ p: dir }]); },
    get connected() { return joined; },
  };
}
