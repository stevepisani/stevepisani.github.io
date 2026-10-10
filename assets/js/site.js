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

  // The private apps' settings sheet picks one by name (kit.js); null is auto
  window.siteTheme = { list: THEMES, get: function () { return root.dataset.theme || null; }, set: setTheme };

  if (btn) {
    btn.addEventListener('click', function () {
      var i = THEMES.indexOf(root.dataset.theme || null);
      setTheme(THEMES[(i + 1) % THEMES.length]);
    });
    // The lab links to #theme, so point at the button when someone arrives that way.
    if (location.hash === '#theme') btn.classList.add('is-pulsing');
  }

  /* ---- Page count ---- */
  // A book's Audible sample: any [data-sample] button plays its clip, one at a time; again to stop.
  // (window.playSample is the same thing for the planet's star cards.)
  var sample = null, sampleBtn = null;
  function playSample(url, btn) {
    var same = sample && sample.src === url && !sample.paused;
    if (sample) sample.pause();
    if (sampleBtn) sampleBtn.setAttribute('aria-pressed', 'false');
    if (same) { sample = sampleBtn = null; return false; }
    sample = new Audio(url);
    sampleBtn = btn || null;
    if (sampleBtn) sampleBtn.setAttribute('aria-pressed', 'true');
    sample.addEventListener('ended', function () { if (sampleBtn) sampleBtn.setAttribute('aria-pressed', 'false'); });
    sample.play().catch(function () {});
    return true;
  }
  window.playSample = playSample;
  window.stopSample = function () { if (sample) sample.pause(); if (sampleBtn) sampleBtn.setAttribute('aria-pressed', 'false'); sample = sampleBtn = null; };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-sample]');
    if (b) playSample(b.getAttribute('data-sample'), b);
  });

  // One row per page view in Supabase (public.pageviews): the path, the referring site's host if
  // it's another site, and the kind of screen. No cookies, no IP, nothing kept in the browser.
  // Skipped for Do Not Track / Global Privacy Control, automated browsers and local previews.
  function meta(name) { var m = document.querySelector('meta[name="' + name + '"]'); return m ? m.content : ''; }
  window.siteDb = { url: meta('supabase-url'), key: meta('supabase-key') };
  // The private apps (/apps) are in the nav only for someone signed in to them on this browser
  // (the session supabase-js keeps; signing out removes it).
  try {
    var apps = document.querySelector('[data-members]'), ref = /\/\/([^.]+)\./.exec(window.siteDb.url);
    if (apps && ref && localStorage.getItem('sb-' + ref[1] + '-auth-token')) apps.hidden = false;
  } catch (e) {}
  (function count() {
    var db = window.siteDb, n = navigator;
    if (!db.url || !db.key || n.webdriver || n.doNotTrack === '1' || n.globalPrivacyControl) return;
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) return;
    var ref = null;
    try { var r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) ref = r.host.slice(0, 100); } catch (e) {}
    var w = Math.min(screen.width, innerWidth || screen.width);
    var body = JSON.stringify({ path: location.pathname.slice(0, 200), referrer: ref, screen: w < 700 ? 'phone' : w < 1100 ? 'tablet' : 'desktop' });
    try {
      fetch(db.url + '/rest/v1/pageviews', { method: 'POST', keepalive: true, body: body,
        headers: { 'content-type': 'application/json', apikey: db.key, authorization: 'Bearer ' + db.key, prefer: 'return=minimal' } }).catch(function () {});
    } catch (e) {}
  })();

  /* ---- Rocket launches (Launch Library 2) ---- */
  // The next few launches anywhere, for the launch console on the homepage (its screen, the
  // terminal you lean in to, and the panel) and the classic page's card. Free API, 15 requests
  // an hour per IP, so the list is cached in localStorage for an hour and every caller shares
  // one request. A launch within the hour asks once more, for its own page (the stream links),
  // cached ten minutes.
  var LAUNCH_API = 'https://ll.thespacedevs.com/2.3.0/launches/';
  var HOUR = 60 * 60 * 1000;
  var launchList;
  try { localStorage.removeItem('next-launch'); } catch (e) {} // the old cache, before this one
  // fetch `url`, keep only `shape(data)` (what the site uses, not the whole response) for `maxAge`
  var cachedJson = function (key, maxAge, url, shape) {
    try {
      var c = JSON.parse(localStorage.getItem(key));
      if (c && Date.now() - c.at < maxAge) return Promise.resolve(c.data);
    } catch (e) {}
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      data = shape(data);
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) {}
      return data;
    });
  };
  // one launch, as the site uses it
  var launchOf = function (l) {
    var title = String(l.name || '').split(' | ');
    var pad = l.pad || {}, img = l.image || {}, st = l.status || {}, m = l.mission || {};
    return {
      id: l.id,
      name: l.name,
      rocket: (l.rocket && l.rocket.configuration && l.rocket.configuration.full_name) || title[0],
      mission: title[1] || m.name || title[0],
      provider: l.launch_service_provider && l.launch_service_provider.name,
      pad: pad.location && pad.location.name,
      lat: +pad.latitude, lon: +pad.longitude,
      net: l.net,
      precision: l.net_precision && l.net_precision.abbrev, // SEC, MIN, HR, DAY, MONTH: how sure the time is
      status: st.abbrev || 'TBD', // Go, TBC, TBD, Hold, In Flight, Success, Failure
      statusName: st.name || '',
      about: String(m.description || '').split(/\r?\n/)[0],
      orbit: m.orbit && m.orbit.name,
      image: img.thumbnail_url || img.image_url || '', // the small one: it's shown small, or dimmed under text
      imageCredit: [img.credit, img.license && img.license.name].filter(Boolean).join(', '),
      live: !!l.webcast_live,
    };
  };
  // The next launches: up to five still to come (or gone up in the last hour), soonest first.
  window.launches = function () {
    if (launchList) return launchList;
    launchList = cachedJson('launches', HOUR, LAUNCH_API + 'upcoming/?limit=8&mode=normal', function (data) { return (data.results || []).map(launchOf); }).then(function (all) {
      var soon = Date.now() - HOUR;
      var list = all.filter(function (l) { return new Date(l.net) > soon; }).slice(0, 5);
      if (!list.length) throw new Error('no upcoming launches');
      return list;
    });
    launchList.catch(function () { launchList = null; });
    return launchList;
  };
  window.nextLaunch = function () { return window.launches().then(function (list) { return list[0]; }); };
  // Where to watch one live: its own page's stream links (only asked for within the hour).
  window.launchStreams = function (id) {
    return cachedJson('launch-streams', 10 * 60 * 1000, LAUNCH_API + encodeURIComponent(id) + '/?mode=detailed', function (l) {
      return { id: id, streams: (l.vid_urls || []).filter(function (v) { return /^https:\/\//.test(v.url); })
        .sort(function (a, b) { return (a.priority || 99) - (b.priority || 99); }).slice(0, 3)
        .map(function (v) { return { url: v.url, title: v.title || v.publisher && v.publisher.name || 'Stream', live: !!v.live }; }) };
    }).then(function (c) {
      if (c.id !== id) { try { localStorage.removeItem('launch-streams'); } catch (e) {} return window.launchStreams(id); } // another launch's: ask for this one
      return c.streams;
    });
  };
  // A calendar entry for one (an .ics file): the hour from lift-off, saved by the browser.
  window.launchCalendar = function (l) {
    var stamp = function (d) { return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); };
    var esc = function (t) { return String(t || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); };
    var start = new Date(l.net);
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//stevenpisani.com//launch control//EN', 'BEGIN:VEVENT',
      'UID:launch-' + l.id + '@stevenpisani.com', 'DTSTAMP:' + stamp(Date.now()), 'DTSTART:' + stamp(start), 'DTEND:' + stamp(start.getTime() + HOUR),
      'SUMMARY:' + esc('Launch: ' + l.name), 'LOCATION:' + esc(l.pad),
      'DESCRIPTION:' + esc([l.rocket + (l.provider ? ' · ' + l.provider : ''), l.about, 'Times can slip: check closer to the day.'].filter(Boolean).join('\n')),
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(l.name + ' in 30 minutes'), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = (l.mission || 'launch').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() + '.ics';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  };

  window.tMinus = function (net) {
    var ms = new Date(net) - Date.now();
    var sign = ms < 0 ? 'T+ ' : 'T- ';
    ms = Math.abs(ms);
    var d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return sign + (d ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
  };

  // Fill any [data-launch] block (the next one): children with data-launch-name / -meta / -clock,
  // and its own photo behind them when it has one.
  // (The homepage's panels are templates: main.js fills them as they open.)
  window.fillLaunch = function (el) {
    var q = function (k) { return el.querySelector('[data-launch-' + k + ']'); };
    if (!window.fetch) return;
    window.nextLaunch().then(function (l) {
      q('name').textContent = l.name;
      q('meta').textContent = [l.provider, l.pad].filter(Boolean).join(' · ');
      if (l.image) el.style.setProperty('--launch-img', 'url("' + l.image.replace(/"/g, '%22') + '")');
      var tick = function () { if (!el.isConnected) return clearInterval(iv); q('clock').textContent = window.tMinus(l.net); };
      var iv = setInterval(tick, 1000);
      tick();
    }).catch(function () {
      q('name').textContent = 'Ad astra.';
    });
  };
  document.querySelectorAll('[data-launch]').forEach(window.fillLaunch);

  // Fill any [data-launches] list: a row per launch to come (photo, status, name, where, the
  // countdown, and "Remind me", which saves it to your calendar).
  var STATUS = { Go: 'go', TBC: 'tbd', TBD: 'tbd', Hold: 'hold', 'In Flight': 'go', Success: 'go', Failure: 'hold', 'Partial Failure': 'hold' };
  window.launchStatus = function (l) { return STATUS[l.status] || 'tbd'; };
  window.fillLaunches = function (el) {
    if (!window.fetch) return;
    window.launches().then(function (list) {
      var clocks = [];
      el.replaceChildren.apply(el, list.map(function (l) {
        var li = document.createElement('li'), h = function (tag, cls, text) { var x = document.createElement(tag); x.className = cls; if (text) x.textContent = text; return x; };
        li.className = 'launch-row';
        var pic = h('span', 'launch-row__pic');
        if (l.image) pic.style.backgroundImage = 'url("' + l.image.replace(/"/g, '%22') + '")';
        var body = h('span', 'launch-row__body');
        var top = h('span', 'launch-row__top');
        top.append(h('span', 'launch-row__status is-' + window.launchStatus(l), l.status), h('span', 'launch-row__clock'));
        body.append(top, h('strong', 'launch-row__name', l.mission), h('span', 'launch-row__meta', [l.rocket, l.provider].filter(Boolean).join(' · ')), h('span', 'launch-row__meta', l.pad || ''));
        var remind = h('button', 'launch-row__remind', 'Remind me');
        remind.type = 'button';
        remind.addEventListener('click', function () { window.launchCalendar(l); });
        body.append(remind);
        li.append(pic, body);
        clocks.push([top.lastChild, l.net]);
        return li;
      }));
      var tick = function () { if (!el.isConnected) return clearInterval(iv); clocks.forEach(function (c) { c[0].textContent = window.tMinus(c[1]); }); };
      var iv = setInterval(tick, 1000);
      tick();
    }).catch(function () {
      el.replaceChildren(Object.assign(document.createElement('li'), { className: 'launch-row__none', textContent: 'No word from the manifest just now. Try again later.' }));
    });
  };
  document.querySelectorAll('[data-launches]').forEach(window.fillLaunches);

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


  /* ---- Hello, fellow view-source enjoyer ---- */
  if (window.console) {
    console.log('%cHey, you opened devtools. 👋', 'font: 600 16px sans-serif; color: #e0531f');
    console.log('This site is hand-rolled Jekyll + ~100 lines of JS. Source: https://github.com/stevepisani/stevepisani.github.io');
  }
})();
