// Launch control's terminal: what the console's screen says when you lean in to it (main.js
// lays it exactly over the screen and the desk), the next launches one at a time. ‹ › step
// through them; "Remind me" saves one to your calendar (site.js launchCalendar); "Watch live"
// opens its stream once it's within the hour (site.js launchStreams); "Engine test" flips the
// red button's guard up and "Fire" presses it (main.js runs the test). A line scrolls along the
// bottom: what the mission is, then a famous launch from this time of year (_data/launch_history.yml).
// Keyboards get a prompt too (help lists what it knows); the buttons stay the way in.
// No three.js here: main.js owns the view, places.js the console itself.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The famous launch nearest today's date in any year: { text, same } (same: it's today's date). */
export function launchOnThisDay(history = [], now = new Date()) {
  if (!history.length) return null;
  const today = Date.UTC(2001, now.getMonth(), now.getDate()); // a year without a 29 February
  let best = null, bestGap = Infinity;
  for (const h of history) {
    const [y, m, d] = String(h.date).split('-').map(Number);
    let gap = Math.abs(Date.UTC(2001, m - 1, Math.min(d, 28 + (m === 2 ? 0 : 3))) - today) / 864e5;
    gap = Math.min(gap, 365 - gap); // round the year's end
    if (gap < bestGap) { best = { ...h, y, m, d }; bestGap = gap; }
  }
  const same = bestGap < 0.5;
  return { same, text: `${same ? `On this day in ${best.y}` : `On ${best.d} ${MONTHS[best.m - 1]} ${best.y}`}: ${best.name}. ${best.line}` };
}

export function createTerminal({ el, history = [], reduce = false, sound = { play() {} }, onLeave = () => {}, onTest = () => {}, onPick = () => {} }) {
  const $ = (id) => el.querySelector('#term-' + id);
  const screen = $('screen'), name = $('name'), status = $('status'), count = $('count'), rocket = $('rocket'), pad = $('pad'), when = $('when'), clock = $('clock');
  const pic = $('pic'), ticker = $('ticker'), out = $('out'), form = $('form'), input = $('input');
  const prev = $('prev'), next = $('next'), remind = $('remind'), watch = $('watch'), test = $('test');
  let list = [], i = 0, armedAt = 0, testing = false, failed = false, streamsFor = null;
  const local = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  function say(text) { out.textContent = text; }
  function current() { return list[i]; }

  function render() {
    const l = current();
    if (!l) {
      name.textContent = failed ? 'No word from the manifest' : 'Checking the manifest…';
      status.textContent = count.textContent = rocket.textContent = pad.textContent = when.textContent = clock.textContent = '';
      pic.style.backgroundImage = '';
      setTicker(failed ? 'The launch schedule is out of reach just now. Try again later.' : '');
      prev.disabled = next.disabled = remind.disabled = true;
      watch.hidden = true;
      return;
    }
    const kind = window.launchStatus ? window.launchStatus(l) : 'tbd';
    status.textContent = `● ${l.status.toUpperCase()}`;
    status.className = `terminal__status is-${kind}`;
    status.title = l.statusName;
    count.textContent = `${i + 1} / ${list.length}`;
    name.textContent = l.mission;
    rocket.textContent = [l.rocket, l.provider].filter(Boolean).join(' · ');
    pad.textContent = l.pad || '';
    // how sure the time is: to the second or minute, give it; to the hour or day, say so
    const sure = !l.precision || l.precision === 'SEC' || l.precision === 'MIN';
    when.textContent = sure ? `${local.format(new Date(l.net))} your time` : `No earlier than ${day.format(new Date(l.net))}`;
    pic.style.backgroundImage = l.image ? `url("${l.image.replace(/"/g, '%22')}")` : '';
    pic.title = l.imageCredit ? `Photo: ${l.imageCredit}` : '';
    prev.disabled = next.disabled = list.length < 2;
    remind.disabled = false;
    const h = launchOnThisDay(history);
    setTicker([l.about, h && h.text].filter(Boolean).join('   ·   '));
    tick();
    streamsFor = null;
    watchLink();
  }
  function setTicker(text) {
    const span = ticker.firstElementChild;
    if (span.textContent === text) return;
    span.textContent = text;
    // about as fast as you'd read it (reduced motion: it wraps instead, and doesn't move)
    span.style.animationDuration = `${Math.max(12, text.length / 9)}s`;
  }
  // "Watch live": only within the hour, when its page has a stream to give
  function watchLink() {
    const l = current();
    const soon = l && new Date(l.net) - Date.now() < 3600e3 && new Date(l.net) - Date.now() > -3600e3;
    if (!soon) { watch.hidden = true; return; }
    if (streamsFor === l.id) return;
    streamsFor = l.id;
    (window.launchStreams ? window.launchStreams(l.id) : Promise.reject()).then((streams) => {
      if (current() !== l || !streams.length) return;
      watch.href = streams[0].url;
      watch.textContent = l.live || streams[0].live ? 'Watch live ●' : 'Watch live';
      watch.hidden = false;
    }).catch(() => { watch.hidden = true; });
  }

  /** Once a second (and on render): the countdown, and "Watch live" when its hour comes. */
  function tick() {
    const l = current();
    if (!l) return;
    const ms = new Date(l.net) - Date.now();
    clock.textContent = ms <= 0 && ms > -600e3 ? `LIFTOFF  ${window.tMinus(l.net)}` : window.tMinus(l.net);
    clock.classList.toggle('is-soon', ms > 0 && ms < 3600e3);
    if (ms < 3600e3) watchLink();
    // a guard left up falls shut after a while
    if (armedAt && Date.now() - armedAt > 15000 && !testing) disarm('The guard fell shut.');
  }

  function step(d) {
    if (list.length < 2 || testing) return;
    i = (i + d + list.length) % list.length;
    sound.play('relay');
    say('');
    render();
    onPick(current());
  }
  function select(n) {
    if (!list[n] || testing) return false;
    i = n;
    sound.play('relay');
    render();
    onPick(current());
    return true;
  }
  function saveIt() {
    const l = current();
    if (!l || !window.launchCalendar) return;
    window.launchCalendar(l);
    say(`Saved: ${l.mission}. Your calendar will remind you half an hour before.`);
  }
  function arm() {
    if (testing) return;
    armedAt = Date.now();
    test.textContent = 'Fire';
    test.classList.add('is-armed');
    sound.play('guard');
    say('Guard up. Fire runs the engines for a few seconds. The rocket stays put.');
    onTest('arm');
  }
  function disarm(text = '') {
    armedAt = 0;
    test.textContent = 'Engine test';
    test.classList.remove('is-armed');
    if (text) say(text);
    onTest('disarm');
  }
  function fire() {
    if (testing) return;
    if (!armedAt) return arm();
    testing = true;
    armedAt = 0;
    el.classList.add('is-testing');
    test.textContent = 'Engine test';
    test.classList.remove('is-armed');
    say('Ignition.');
    onTest('fire');
  }
  /** main.js, once the test's over and you're back at the screen. */
  function tested() {
    testing = false;
    el.classList.remove('is-testing');
    say('Engines off. All good.');
  }

  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  remind.addEventListener('click', saveIt);
  test.addEventListener('click', () => (armedAt ? fire() : arm()));

  // the prompt: a few words it understands
  const HELP = 'next · back · 1-5 · remind · watch · test · fire · about · history · exit';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.trim(), w = raw.toLowerCase().split(/\s+/)[0] || '';
    input.value = '';
    if (!w) return;
    if (/^\d+$/.test(w)) { if (!select(+w - 1)) say(`There are ${list.length} launches here.`); return; }
    const l = current();
    const cmd = {
      help: () => say(HELP), '?': () => say(HELP),
      next: () => step(1), n: () => step(1), back: () => step(-1), prev: () => step(-1), b: () => step(-1),
      remind: saveIt, save: saveIt,
      watch: () => { if (!watch.hidden) { window.open(watch.href, '_blank', 'noopener'); say('Opening the stream.'); } else say('No stream yet. It turns up in the last hour.'); },
      live: () => cmd.watch(),
      test: () => (armedAt ? say('Armed. Type fire.') : arm()), arm: () => cmd.test(),
      fire: () => (armedAt ? fire() : say('Arm it first: type test.')),
      about: () => say(l ? l.about || 'No word on the mission yet.' : ''),
      history: () => { const h = launchOnThisDay(history); say(h ? h.text : ''); },
      clear: () => say(''),
      exit: onLeave, quit: onLeave, bye: onLeave, leave: onLeave,
      hello: () => say('Hello. Type help.'), hi: () => say('Hello. Type help.'),
    }[w];
    if (cmd) cmd(); else say(`${raw.slice(0, 24)}: not a command here. Type help.`);
  });

  return {
    el,
    screen,
    /** The launches to show (site.js launches()), or null if they couldn't be had. */
    set(launches) {
      failed = !launches;
      list = launches || [];
      i = Math.min(i, Math.max(0, list.length - 1));
      render();
    },
    open() {
      el.hidden = false;
      el.classList.toggle('is-still', reduce);
      say('');
      render();
    },
    close() {
      if (armedAt) disarm();
      el.hidden = true;
      if (document.activeElement === input) input.blur();
    },
    focusPrompt() { input.focus({ preventScroll: true }); },
    get typing() { return document.activeElement === input && input.value !== ''; },
    tick,
    step,
    select,
    remind: saveIt,
    arm,
    fire,
    tested,
    get current() { return current(); },
    get index() { return i; },
    get count() { return list.length; },
    get armed() { return !!armedAt; },
    get testing() { return testing; },
    get output() { return out.textContent; },
  };
}
