// The house answers: when the bartender can't reach the model (no credit left, an outage, or no
// connection), he still answers the usual questions from what the site knows: /bartender.json,
// the same facts the AI is given. A line or two, in his voice, then the menu for the rest. One
// small file fetched the first time it's needed; nothing else, and no cost.
let facts = null;
const first = (s) => String(s || '').split(/(?<=\.)\s/)[0];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const title = (s) => String(s).replace(/\s*\(\/[^)]*\)$/, '');
const named = (s) => String(s).split(':')[0];

// first match wins, so the specific asks come before "what does he do"
const RULES = [
  [/\b(reach|contact|email|e-mail|hire|touch|linkedin|talk to)\b/i, (d) => `Email him: ${d.steve.email}. Contact on the menu has the rest.`],
  [/\b(order|drink|cocktail|recommend|thirsty|rum|tiki|chalkboard|make me)\b/i, (d) => {
    const x = pick(d.drinks);
    return `Try the ${x.name}${x.origin ? `, from ${x.origin.split(',')[0]}` : ''}. It's on the chalkboard; tap it and I'll make you one.`;
  }],
  [/\b(read|reading|book|books|audible|listen)/i, (d) => (d.reading_now && d.reading_now.length
    ? `Right now: ${d.reading_now.slice(0, 2).join(' and ')}. The stars over the hammock are the rest.`
    : "The stars over the hammock are every book he's read.")],
  [/\b(write|writing|wrote|blog|post|article)/i, (d) => (d.writing.length ? `His latest: "${title(d.writing[0])}". Writing on the menu has the rest.` : 'Writing on the menu has his posts.')],
  [/\b(project|projects|build|built|made|lab|tool|side)\b/i, (d) => (d.lab.length ? `Try the ${named(d.lab[0])}. Projects on the menu has the rest.` : 'Projects on the menu has what he builds.')],
  [/\b(who|what|does|do|work|job|steve|he)\b/i, (d) => `${d.steve.headline} ${first(d.steve.what)}`],
];

/** An answer to `q` from the site's own facts (always something). */
export async function houseAnswer(q) {
  facts = facts || fetch('/bartender.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const d = await facts;
  if (!d) { facts = null; return ''; }
  for (const [re, say] of RULES) if (re.test(q)) return say(d);
  return `That one's beyond me tonight. The menu has the rest: ${d.menu.slice(0, 4).map(named).join(', ')}.`;
}
