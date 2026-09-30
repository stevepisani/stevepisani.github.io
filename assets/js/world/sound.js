// Sound, made in the browser: no audio files. Web Audio synthesises everything, and three.js
// PositionalAudio puts each source where it is on the planet, so it gets louder as you walk up:
//   the bar      a quiet exotica loop (vibraphone chords, upright bass, bongos, the odd bird
//                call, after Martin Denny), and the robot's shaker, ice and pours
//   the fire     a low rumble and crackles
//   the lagoon   water lapping
//   the hammock  its ropes creaking when you get in or out
//   everywhere   crickets
// Off until the visitor turns it on (browsers only start audio from a click or key), then
// remembered (localStorage `world-sound`); paused while the tab is hidden.
import * as THREE from 'three';

const KEY = 'world-sound';

export function createSound({ scene, camera, spots }) {
  let ctx = null, listener = null, on = false, timer = 0;
  const inputs = {};   // name -> GainNode that feeds a positional source
  let nextBeat = 0, beat = 0, nextBird = 0, nextCrackle = 0, nextCricket = 0;
  let noiseWhite, noiseBrown;

  const remembered = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const remember = (v) => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} };

  function buffers() {
    const len = ctx.sampleRate * 2;
    noiseWhite = ctx.createBuffer(1, len, ctx.sampleRate);
    noiseBrown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = noiseWhite.getChannelData(0), b = noiseBrown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02; // brown: integrated white
      b[i] = last * 3.5;
    }
  }
  const noiseSource = (buf, loop = true) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; };

  // A source at a place: its input (a GainNode) feeds a PositionalAudio there.
  function place(name, pos, { ref = 3, max = 60, rolloff = 1.3, gain = 1 } = {}) {
    const a = new THREE.PositionalAudio(listener);
    a.setRefDistance(ref); a.setMaxDistance(max); a.setRolloffFactor(rolloff); a.setDistanceModel('inverse');
    a.position.copy(pos);
    scene.add(a);
    const g = ctx.createGain();
    g.gain.value = gain;
    a.setNodeSource(g);
    inputs[name] = g;
    return g;
  }

  function start() {
    listener = new THREE.AudioListener();
    camera.add(listener);
    ctx = listener.context;
    listener.setMasterVolume(0.8);
    buffers();
    // everywhere: crickets (not positional)
    const everywhere = new THREE.Audio(listener);
    const eg = ctx.createGain();
    eg.gain.value = 0.5;
    everywhere.setNodeSource(eg);
    inputs.everywhere = eg;
    place('bar', spots.bar, { ref: 3.5, max: 80, rolloff: 1.1 });
    place('fire', spots.fire, { ref: 1.5, max: 30, rolloff: 1.6 });
    place('lagoon', spots.lagoon, { ref: 2, max: 30, rolloff: 1.5 });
    place('hammock', spots.hammock, { ref: 1.5, max: 20, rolloff: 1.5 });

    // the fire's low rumble
    { const s = noiseSource(noiseBrown), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 320; g.gain.value = 0.5;
      s.connect(f).connect(g).connect(inputs.fire); s.start(); }
    // the lagoon: low noise swelling and falling like small waves on the shore
    { const s = noiseSource(noiseBrown), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 650; g.gain.value = 0.22;
      for (const [hz, depth] of [[0.17, 0.12], [0.11, 0.08]]) {
        const lfo = ctx.createOscillator(), d = ctx.createGain();
        lfo.frequency.value = hz; d.gain.value = depth;
        lfo.connect(d).connect(g.gain); lfo.start();
      }
      s.connect(f).connect(g).connect(inputs.lagoon); s.start(); }
    const t = ctx.currentTime + 0.1;
    nextBeat = t; nextBird = t + 6; nextCrackle = t; nextCricket = t;
    timer = setInterval(schedule, 100);
    document.addEventListener('visibilitychange', onVisible);
  }
  const onVisible = () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (on) ctx.resume(); };

  /* ---------- Voices ---------- */
  const env = (g, t, peak, attack, decay) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  };
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function vibe(n, t, v = 0.12) { // a vibraphone: bright bar, fast motor tremolo
    const out = ctx.createGain(), trem = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 5.2; depth.gain.value = 0.35; trem.gain.value = 0.75;
    lfo.connect(depth).connect(trem.gain);
    for (const [mult, amp] of [[1, 1], [4, 0.18], [10, 0.04]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = midi(n) * mult;
      env(g, t, v * amp, 0.005, mult === 1 ? 2.4 : 0.4);
      o.connect(g).connect(trem);
      o.start(t); o.stop(t + 2.6);
    }
    trem.connect(out).connect(inputs.bar);
    lfo.start(t); lfo.stop(t + 2.6);
  }
  function bass(n, t) { // soft upright bass
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = midi(n);
    f.type = 'lowpass'; f.frequency.value = 500;
    env(g, t, 0.22, 0.01, 0.7);
    o.connect(f).connect(g).connect(inputs.bar);
    o.start(t); o.stop(t + 0.8);
  }
  function bongo(hi, t, v = 0.16) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const f0 = hi ? 560 : 400;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.09);
    env(g, t, v, 0.002, 0.12);
    o.connect(g).connect(inputs.bar);
    o.start(t); o.stop(t + 0.16);
  }
  function bird(t) { // a tropical bird call, whistled
    const o = ctx.createOscillator(), g = ctx.createGain(), fm = ctx.createOscillator(), fmg = ctx.createGain();
    const n = 3 + Math.floor(Math.random() * 3), base = 2200 + Math.random() * 900;
    fm.frequency.value = 28; fmg.gain.value = 180;
    fm.connect(fmg).connect(o.frequency);
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.16;
      o.frequency.setValueAtTime(base, s);
      o.frequency.exponentialRampToValueAtTime(base * (i % 2 ? 1.35 : 1.6), s + 0.1);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.13);
    }
    o.connect(g).connect(inputs.bar);
    o.start(t); fm.start(t); o.stop(t + n * 0.16 + 0.1); fm.stop(t + n * 0.16 + 0.1);
  }
  function burst(input, t, { dur = 0.03, type = 'highpass', hz = 1800, q = 0.7, v = 0.2 } = {}) {
    const s = noiseSource(noiseWhite, false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.value = hz; f.Q.value = q;
    env(g, t, v, 0.002, dur);
    s.connect(f).connect(g).connect(input);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function chirp(t) { // a cricket: three quick pulses of a high tone
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 4400 + Math.random() * 500;
    g.gain.value = 0;
    for (let i = 0; i < 3; i++) { g.gain.setValueAtTime(0.012, t + i * 0.035); g.gain.setValueAtTime(0, t + i * 0.035 + 0.02); }
    o.connect(g).connect(inputs.everywhere);
    o.start(t); o.stop(t + 0.15);
  }

  // Dm9 · G13 · Cmaj9 · A7(b9), two bars each, as rolled vibraphone chords over a walking bass
  const CHORDS = [[50, [65, 69, 72, 76]], [55, [65, 69, 71, 76]], [48, [64, 67, 71, 74]], [45, [61, 64, 67, 70]]];
  const EIGHTH = 60 / 76 / 2;
  function schedule() {
    if (!ctx || !on) return;
    const ahead = ctx.currentTime + 0.35;
    while (nextBeat < ahead) {
      const bar = Math.floor(beat / 8), [root, notes] = CHORDS[Math.floor(bar / 2) % CHORDS.length], i = beat % 8;
      if (i === 0) notes.forEach((n, k) => vibe(n, nextBeat + k * 0.035, 0.08));             // rolled chord
      if (i === 3 || i === 6) vibe(notes[(beat + bar) % notes.length] + 12, nextBeat, 0.06); // a few notes on top
      if (i === 0 || i === 4) bass(i === 0 ? root : root + 7, nextBeat);
      if ([0, 3, 5, 6].includes(i)) bongo(i % 3 !== 0, nextBeat, i === 0 ? 0.14 : 0.09);
      nextBeat += EIGHTH; beat++;
    }
    while (nextBird < ahead) { bird(nextBird); nextBird += 12 + Math.random() * 14; }
    while (nextCrackle < ahead) { burst(inputs.fire, nextCrackle, { dur: 0.01 + Math.random() * 0.04, v: 0.1 + Math.random() * 0.4 }); nextCrackle += 0.04 + Math.random() * 0.35; }
    while (nextCricket < ahead) { chirp(nextCricket); nextCricket += Math.random() < 0.7 ? 0.5 : 1.4; }
  }

  /* ---------- Things that happen ---------- */
  let pourNode = null;
  const fx = {
    shake(seconds = 1) { // ice rattling in a tin
      const t = ctx.currentTime;
      for (let k = 0; k * 0.11 < seconds; k++) burst(inputs.bar, t + k * 0.11, { type: 'bandpass', hz: 2600 + (k % 2) * 900, q: 1.2, dur: 0.07, v: 0.35 });
    },
    clink() { // ice into a glass
      const t = ctx.currentTime;
      [2900, 3900, 5200].forEach((hz, k) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = hz; env(g, t + k * 0.06, 0.05, 0.002, 0.3);
        o.connect(g).connect(inputs.bar); o.start(t + k * 0.06); o.stop(t + k * 0.06 + 0.35);
      });
    },
    pour(flowing) { // a thin stream into a glass
      if (flowing && !pourNode) {
        const s = noiseSource(noiseWhite), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.5;
        g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.08);
        s.connect(f).connect(g).connect(inputs.bar); s.start();
        pourNode = { s, g };
      } else if (!flowing && pourNode) {
        const { s, g } = pourNode;
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04); s.stop(ctx.currentTime + 0.3);
        pourNode = null;
      }
    },
    whoosh() { // a stone leaving your hand
      burst(inputs.lagoon, ctx.currentTime, { type: 'bandpass', hz: 900, q: 0.8, dur: 0.18, v: 0.12 });
    },
    skip(n = 1) { // a stone touching the water: a light, bright tick, softer each time
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(650, t + 0.06);
      env(g, t, 0.16 / Math.sqrt(n), 0.002, 0.08);
      o.connect(g).connect(inputs.lagoon); o.start(t); o.stop(t + 0.12);
      burst(inputs.lagoon, t, { hz: 3000, dur: 0.05, v: 0.12 / Math.sqrt(n) });
    },
    plop() { // sinking
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.18);
      env(g, t, 0.3, 0.004, 0.2);
      o.connect(g).connect(inputs.lagoon); o.start(t); o.stop(t + 0.25);
      burst(inputs.lagoon, t, { type: 'lowpass', hz: 900, dur: 0.25, v: 0.2 });
    },
    clack() { // on the sand and pebbles of the far shore
      const t = ctx.currentTime;
      burst(inputs.lagoon, t, { type: 'bandpass', hz: 2200, q: 3, dur: 0.03, v: 0.3 });
      burst(inputs.lagoon, t + 0.07, { type: 'bandpass', hz: 2600, q: 3, dur: 0.025, v: 0.15 });
    },
    creak() { // rope taking weight round a palm
      const t = ctx.currentTime;
      for (let k = 0; k < 2; k++) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), s = t + k * 0.45;
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(80, s); o.frequency.linearRampToValueAtTime(115, s + 0.35);
        f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 9;
        env(g, s, 0.25, 0.05, 0.35);
        o.connect(f).connect(g).connect(inputs.hammock); o.start(s); o.stop(s + 0.45);
      }
    },
  };

  const button = document.getElementById('sound-btn');
  let first = null;
  function set(v, { save = true } = {}) {
    if (first) { removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); first = null; }
    on = v;
    if (save) remember(v);
    button.setAttribute('aria-pressed', String(v));
    button.setAttribute('aria-label', v ? 'Sound on' : 'Sound off');
    if (!v) { if (ctx) ctx.suspend(); return; }
    if (!ctx) start();
    ctx.resume();
  }
  button.hidden = false;
  button.addEventListener('click', () => set(!on));
  // remembered as on: it starts with the first click or key (browsers won't start audio before)
  if (remembered()) {
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', 'Sound on');
    first = (e) => { if (e.target.closest && e.target.closest('#sound-btn')) return; set(true, { save: false }); };
    addEventListener('pointerdown', first, true);
    addEventListener('keydown', first, true);
  }

  return {
    /** Something happened: 'shake' (seconds), 'clink', 'pour' (flowing), 'creak'. Silent while off. */
    play(name, ...args) { if (on && ctx && fx[name]) fx[name](...args); },
    get on() { return on; },
    set,
  };
}
