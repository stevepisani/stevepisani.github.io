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

  /* ---- Where's Steve? (a Weasley clock) ---- */
  var clock = document.getElementById('clock');
  if (clock) {
    var rules = JSON.parse(clock.dataset.rules || '[]');
    var hands = JSON.parse(clock.dataset.hands || '[]');
    var hand = document.getElementById('clock-hand');
    var status = document.getElementById('clock-status');
    var timeEl = document.getElementById('clock-time');
    var labels = clock.querySelectorAll('.clock__label');

    function phillyNow() {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      var get = function (type) { return (parts.find(function (p) { return p.type === type; }) || {}).value; };
      var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return { day: days.indexOf(get('weekday')), hour: parseInt(get('hour'), 10) % 24, minute: get('minute') };
    }

    function pick(now) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        if (r.days.indexOf(now.day) !== -1 && now.hour >= r.hours[0] && now.hour < r.hours[1]) return r.hand;
      }
      return hands[0];
    }

    function render() {
      var now = phillyNow();
      var current = pick(now);
      var idx = Math.max(0, hands.indexOf(current));
      hand.style.transform = 'rotate(' + (idx * 360 / hands.length) + 'deg)';
      labels.forEach(function (l) { l.classList.toggle('is-active', l.dataset.hand === current); });
      status.textContent = current === 'Mortal peril' ? 'In mortal peril. Probably fine.' : 'Probably: ' + current.toLowerCase() + '.';
      var h12 = now.hour % 12 || 12;
      timeEl.textContent = h12 + ':' + now.minute + (now.hour < 12 ? ' am' : ' pm') + ' in Philadelphia';
    }

    render();
    setInterval(render, 60 * 1000);
  }

  /* ---- Hello, fellow view-source enjoyer ---- */
  if (window.console) {
    console.log('%cHey, you opened devtools. 👋', 'font: 600 16px sans-serif; color: #e0531f');
    console.log('This site is hand-rolled Jekyll + ~100 lines of JS. Source: https://github.com/stevepisani/stevepisani.github.io');
  }
})();
