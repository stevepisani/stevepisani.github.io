// Tells Steve about planets sent to be built (My Tiny Planet, docs/planets.md): the new rows in
// public.planet_requests become one GitHub issue assigned to him, then they're marked told. The
// issue says only how many and their ids, never what's in them: the repo and its Actions log are
// public. He (or Claude, through Supabase) reads the rest in the table. Run hourly by the Supabase
// workflow; prints counts only.
//
//   SUPABASE_ACCESS_TOKEN=... GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node tools/planet-requests.mjs
import { readFileSync } from 'node:fs';

const token = process.env.SUPABASE_ACCESS_TOKEN, gh = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
if (!token || !gh || !repo) { console.error('Set SUPABASE_ACCESS_TOKEN, GITHUB_TOKEN and GITHUB_REPOSITORY.'); process.exit(2); }
const ref = readFileSync(new URL('../_config.yml', import.meta.url), 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];

const query = async (sql) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`database query: HTTP ${res.status}`);
  return res.json();
};

const ids = (await query("select id from public.planet_requests where status = 'new' order by id")).map((r) => Number(r.id));
if (!ids.length) { console.log('No new planet requests.'); process.exit(0); }

const owner = repo.split('/')[0];
const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${gh}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: ids.length === 1 ? 'A planet was sent to be built' : `${ids.length} planets were sent to be built`,
    assignees: [owner],
    body: [
      `My Tiny Planet: ${ids.length === 1 ? 'someone has' : `${ids.length} people have`} sent a planet to be built (${ids.map((i) => `request ${i}`).join(', ')}).`,
      '',
      "What's in them is private, so it isn't here. Read them in Supabase:",
      '',
      '```sql',
      `select * from public.planet_requests where id in (${ids.join(', ')});`,
      '```',
      '',
      'Building one: `docs/planets.md`, "Building a friend\'s planet".',
    ].join('\n'),
  }),
});
if (!res.ok) throw new Error(`opening the issue: HTTP ${res.status}`);
await query(`update public.planet_requests set status = 'told' where status = 'new' and id in (${ids.join(', ')})`);
console.log(`Told Steve about ${ids.length} planet request(s).`);
