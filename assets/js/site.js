// stevenpisani.com — the only script on the site. No framework, no build step.
(function () {
  var root = document.documentElement;

  /* ---- Theme: auto → light → dark → terminal → auto ---- */
  var THEMES = [null, 'light', 'dark', 'terminal'];
  var btn = document.getElementById('theme');

  function setTheme(t) {
    if (t) root.dataset.theme = t; else delete root.dataset.theme;
    try { t ? localStorage.setItem('theme', t) : localStorage.removeItem('theme'); } catch (e) {}
    if (btn) btn.setAttribute('aria-label', 'Change theme (current: ' + (t || 'auto') + ')');
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var i = THEMES.indexOf(root.dataset.theme || null);
      setTheme(THEMES[(i + 1) % THEMES.length]);
    });
    // The lab links to #theme, so point at the button when someone arrives that way.
    if (location.hash === '#theme') btn.classList.add('is-pulsing');
  }

  /* ---- Next rocket launch (Launch Library 2) ---- */
  // Shared by the homepage card and the bar's telescope. Free API, 15 req/hr/IP,
  // so the response is cached in localStorage for an hour.
  var LAUNCH_API = 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=5&mode=normal';
  var HOUR = 60 * 60 * 1000;
  var launchPromise;

  window.nextLaunch = function () {
    if (launchPromise) return launchPromise;
    var cached = null;
    try {
      var c = JSON.parse(localStorage.getItem('next-launch'));
      if (c && Date.now() - c.at < HOUR) cached = c.data;
    } catch (e) {}
    launchPromise = (cached ? Promise.resolve(cached) : fetch(LAUNCH_API).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      try { localStorage.setItem('next-launch', JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
      return data;
    })).then(function (data) {
      var soon = Date.now() - HOUR;
      var next = (data.results || []).filter(function (l) { return new Date(l.net) > soon; })[0];
      if (!next) throw new Error('no upcoming launches');
      return {
        name: next.name,
        net: next.net,
        provider: next.launch_service_provider && next.launch_service_provider.name,
        pad: next.pad && next.pad.location && next.pad.location.name
      };
    });
    launchPromise.catch(function () { launchPromise = null; });
    return launchPromise;
  };

  window.tMinus = function (net) {
    var ms = new Date(net) - Date.now();
    var sign = ms < 0 ? 'T+ ' : 'T- ';
    ms = Math.abs(ms);
    var d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return sign + (d ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
  };

  // Fill any [data-launch] block: children with data-launch-name / -meta / -clock.
  document.querySelectorAll('[data-launch]').forEach(function (el) {
    var q = function (k) { return el.querySelector('[data-launch-' + k + ']'); };
    if (!window.fetch) return;
    window.nextLaunch().then(function (l) {
      q('name').textContent = l.name;
      q('meta').textContent = [l.provider, l.pad].filter(Boolean).join(' · ');
      var tick = function () { q('clock').textContent = window.tMinus(l.net); };
      tick();
      setInterval(tick, 1000);
    }).catch(function () {
      q('name').textContent = 'Ad astra.';
    });
  });

  /* ---- The sky tonight: the real moon, and where the ISS is right now ---- */
  // The moon's age from a known new moon (6 Jan 2000, 18:14 UTC) and the synodic month: good
  // to half a day, no API. The homepage's moon is lit to match.
  window.moonTonight = function (date) {
    var SYNODIC = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
    var age = ((((date || new Date()) - ref) / 864e5) % SYNODIC + SYNODIC) % SYNODIC;
    var k = age / SYNODIC; // 0 new, 0.5 full
    var names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    return { age: age, phase: k, lit: (1 - Math.cos(2 * Math.PI * k)) / 2, waxing: k < 0.5, name: names[Math.round(k * 8) % 8] };
  };

  // The ISS, live (wheretheiss.at: no key, about one request a second allowed; we ask every 5 s).
  var PHILLY = [39.9526, -75.1652];
  var kmBetween = function (a, b) { // haversine, over the ground
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };
  window.issNow = function () {
    return fetch('https://api.wheretheiss.at/v1/satellites/25544').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      return { lat: d.latitude, lon: d.longitude, km: d.altitude, kmh: d.velocity, sunlit: d.visibility === 'daylight', fromPhilly: kmBetween(PHILLY, [d.latitude, d.longitude]) };
    });
  };

  // Fill a [data-sky] block: children with data-sky-moon / -moon-meta / -iss / -iss-meta.
  window.fillSky = function (el) {
    var q = function (k) { return el.querySelector('[data-sky-' + k + ']'); };
    var m = window.moonTonight();
    q('moon').textContent = m.name;
    q('moon-meta').textContent = Math.round(m.lit * 100) + '% lit · ' + Math.round(m.age) + ' days old';
    if (!window.fetch) return;
    var n = function (v) { return Math.round(v).toLocaleString('en-US'); };
    var deg = function (v, pos, neg) { return Math.abs(v).toFixed(1) + '° ' + (v >= 0 ? pos : neg); };
    var tick = function () {
      if (!el.isConnected) return clearInterval(iv);
      window.issNow().then(function (s) {
        q('iss').textContent = deg(s.lat, 'N', 'S') + ', ' + deg(s.lon, 'E', 'W');
        q('iss-meta').textContent = n(s.km) + ' km up · ' + n(s.kmh) + ' km/h · ' + n(s.fromPhilly) + ' km from Philadelphia' + (s.sunlit ? ' · in sunlight' : ' · in Earth\u2019s shadow');
      }).catch(function () { q('iss').textContent = 'Out of sight for a moment'; });
    };
    var iv = setInterval(tick, 5000);
    tick();
  };
  document.querySelectorAll('[data-sky]').forEach(window.fillSky);

  /* ---- Hello, fellow view-source enjoyer ---- */
  if (window.console) {
    console.log('%cHey, you opened devtools. 👋', 'font: 600 16px sans-serif; color: #e0531f');
    console.log('This site is hand-rolled Jekyll + ~100 lines of JS. Source: https://github.com/stevepisani/stevepisani.github.io');
  }
})();
