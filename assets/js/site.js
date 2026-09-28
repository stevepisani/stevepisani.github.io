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
  var launch = document.getElementById('launch');
  if (launch && window.fetch) {
    var CACHE_KEY = 'next-launch', HOUR = 60 * 60 * 1000;
    var nameEl = document.getElementById('launch-name');
    var metaEl = document.getElementById('launch-meta');
    var clockEl = document.getElementById('launch-clock');

    function cached() {
      try {
        var c = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (c && Date.now() - c.at < HOUR) return Promise.resolve(c.data);
      } catch (e) {}
      return null;
    }

    function tminus(net) {
      var ms = new Date(net) - Date.now();
      var sign = ms < 0 ? 'T+ ' : 'T- ';
      ms = Math.abs(ms);
      var d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
      var pad = function (n) { return String(n).padStart(2, '0'); };
      return sign + (d ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
    }

    (cached() || fetch(launch.dataset.api).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
      return data;
    })).then(function (data) {
      var soon = Date.now() - HOUR;
      var next = (data.results || []).filter(function (l) { return new Date(l.net) > soon; })[0];
      if (!next) throw new Error('no upcoming launches');
      var provider = next.launch_service_provider && next.launch_service_provider.name;
      var pad = next.pad && next.pad.location && next.pad.location.name;
      nameEl.textContent = next.name;
      metaEl.textContent = [provider, pad].filter(Boolean).join(' · ');
      var tick = function () { clockEl.textContent = tminus(next.net); };
      tick();
      setInterval(tick, 1000);
    }).catch(function () {
      nameEl.textContent = 'Ad astra.';
    });
  }

  /* ---- Hello, fellow view-source enjoyer ---- */
  if (window.console) {
    console.log('%cHey, you opened devtools. 👋', 'font: 600 16px sans-serif; color: #e0531f');
    console.log('This site is hand-rolled Jekyll + ~100 lines of JS. Source: https://github.com/stevepisani/stevepisani.github.io');
  }
})();
