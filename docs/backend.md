# The backend: Supabase, the bartender, deploys, secrets, money

Everything that isn't static files. There's one backend, a Supabase project on the free plan, and
all of it is code in this repo: nothing is changed by hand in a dashboard.

## Supabase (`supabase/`)

The project: `dkaiavlnmtetqigxnkwb`. Its URL and public (anon) key are set once, in
`supabase:` in `_config.yml`; `_includes/head.html` writes them into `supabase-url` /
`supabase-key` meta tags, and everything in the browser reads them from there (`window.siteDb`
in `site.js`, `DB` in `world/main.js`, Liquid in `recipe_tracker/`). The anon key is public by
design: row-level security guards every table.

- `migrations/*.sql`: applied in name order, each once, recorded in
  `supabase_migrations.schema_migrations` as the Supabase CLI does. Write them idempotent
  (`create … if not exists`, `drop policy if exists` before `create policy`), so a re-run is safe.
  To change the schema, add a new migration; never edit one that has run.
- `auth.json`: sign-in settings (site URL, allowed redirects, sign-ups off).
- `functions/<name>/index.ts`: edge functions, Deno TypeScript. Type-check with
  `deno check --node-modules-dir=none supabase/functions/<name>/index.ts` (the flag keeps Deno from
  looking for the site's own `node_modules`).
- `tools/supabase.mjs` applies the migrations and `auth.json` through the Management API with
  `SUPABASE_ACCESS_TOKEN` (`--dry-run` previews).
- `.github/workflows/supabase.yml`: on a merge to main that touches `supabase/`, it applies them,
  copies the `ANTHROPIC_API_KEY` repo secret into the project's function secrets, and deploys
  every function (Supabase CLI, `--use-api`, no Docker). To try a change before merging, run the
  workflow on your branch (Actions → Supabase → Run workflow). Once a week it also asks the API for
  something, because free projects pause after a week without requests.

What's in the database:

| Thing | What it is | Who can do what |
|---|---|---|
| `members`, `is_member()` | who may use the private bits; every policy asks `is_member()` | members |
| `recipes`, `photos` bucket | the recipe tracker (`recipe_tracker/`) | members only |
| `bottles` | messages in bottles thrown on the planet | anyone inserts unapproved (at most 200 waiting); everyone reads approved ones; members approve |
| `pageviews`, `pageviews_daily(since)` | the cookieless page count: path, referring host, phone/tablet/desktop | anyone inserts; members read rows; everyone reads daily totals |
| `bartender_usage`, `bartender_asks`, `bartender_take()`, `bartender_spent()` | the bartender's limits and token log | service role only |
| Realtime channel `planet` | presence for the fireflies (no table) | anyone, anonymous |

Approving a bottle is, for now, setting `approved = true` on its row (as a member).

## The bartender (`supabase/functions/bartender`)

The robot answers questions at the bar. The browser posts the conversation (last 12 turns) with
`stream: true`; the function asks Claude Haiku 4.5 (`max_tokens` 160, told to stay under 40 words)
with a plain-prose brief built from `/bartender.json` (the site's `_data` as JSON: profile, career,
menu, drinks, posts, lab, books, the bartender's lines) and streams the reply back as plain text,
markdown markers dropped as they pass, so the first words show in well under a second. Without
`stream: true` it answers `{ reply }` whole, as before. On the way in, the rate-limit check and the
brief (fetched once an isolate, refreshed hourly in the background) run side by side; token
accounting runs after the reply has gone out. Limits, in the database: 1,000 replies a month (about
$5) and 20 questions an hour per visitor, keyed by a daily-salted hash of the IP, never the IP. It
declines to talk about clients and points people to email. When it can't answer, the page says the
bar's closed for a moment. No prompt caching: Haiku 4.5 caches only a prefix of 4,096 tokens or
more, and the brief sits right at that line, so it would come and go.

## Audible (`tools/audible-sync.py`)

Steve's Audible library, once a day (`.github/workflows/audible.yml`, 05:41 Philadelphia time, or
run it by hand): the books he's finished and the ones he's at least 5% into (`STARTED_AT` in the
script; one he owns but has barely opened stays private), minus `_data/audible_hide.yml`, written
to `_data/audible.json`. A book 95% or more through counts as finished whether or not he marked it
(`FINISHED_AT`); with no mark there's no finish date, so the bookshelf lists it under "Finished
earlier". One under 35% that he hasn't played in about six months (`STALE_BELOW`, `STALE_BEFORE`;
the last-played dates come from a second API call) is parked and stays private too. If the data
changed, the workflow commits it to main and starts the site workflow to publish it (its own push
wouldn't). From there it feeds /bookshelf, `/listening.json` (the stars over the hammock) and the
bartender.

Books read on paper are kept by hand in `_data/books.yml`. `_includes/books-read.html` matches them
against Audible at build time: the same title before any subtitle and, if the paper book names an
author, that surname among the Audible book's authors. A match is one book read both ways ("read on
paper too" on its card, one star); the rest are paper-only (the spines on /bookshelf, warm stars).

- **The API isn't public.** It's the one Audible's apps use, through the `audible` Python package
  (pinned in the workflow). If Amazon changes it, the sync fails and the site keeps the last good
  data; the job's log says why.
- **Auth:** the `AUDIBLE_AUTH` repo secret, the JSON auth file `audible quickstart` makes. It's a
  registered device (it shows in Amazon's device list as an Audible app), not a password: it
  refreshes its own access token, and deregistering that device turns the sync off. To make it, on
  Steve's own machine, once:

  ```bash
  pipx install audible-cli        # or: python3 -m pip install --user audible-cli
  audible quickstart              # US marketplace; log in through the browser; don't encrypt the file
  gh secret set AUDIBLE_AUTH --repo stevepisani/stevepisani.github.io < ~/.audible/audible.json
  ```

  (or paste the file into Settings → Secrets and variables → Actions → New repository secret).
  Then run the Audible workflow once (Actions → Audible → Run workflow).
- **Try the transform without an account:** `python tools/audible-sync.py --from tools/fixtures/audible-library.json`
  (a made-up API response; `tools/fixtures/listening.json` is its output, which the smoke test serves
  as `/listening.json`).

## Deploys

| What | How | When |
|---|---|---|
| The site | `.github/workflows/site.yml`: bundle (`npm run build`), Jekyll, link check, smoke test, then `actions/deploy-pages` | every push to main; PRs build and test only |
| Supabase | `.github/workflows/supabase.yml` | merges touching `supabase/` |
| Audible library | `.github/workflows/audible.yml` (`tools/audible-sync.py`); commits `_data/audible.json` and starts the site workflow | daily |
| GitHub profile README | the `stevepisani/stevepisani` repo rebuilds its README daily from `https://stevenpisani.com/profile.json` (built from `_data/profile.yml`) | daily |

Pages is set to Source: GitHub Actions. The custom domain is in `CNAME`; don't remove it.

## Secrets (repo secrets in GitHub; never in the repo, never pasted into a chat)

- `SUPABASE_ACCESS_TOKEN`: the Supabase Management API, for `supabase.yml`.
- `ANTHROPIC_API_KEY`: copied into the bartender function's secrets on deploy. A monthly spend
  limit is also set in the Anthropic console, as a backstop to the cap in code.
- `AUDIBLE_AUTH`: the Audible device registration, for `audible.yml` (above).
- `GITHUB_TOKEN` (automatic): the Jekyll build's GitHub metadata, and the Audible sync's commit.

## Money

The rule: the whole site costs no more than $20 a month. Today it's about $5 at most.

| Item | Cost |
|---|---|
| GitHub Pages and Actions | $0 |
| Supabase (free plan: 500 MB database, 200 concurrent Realtime connections, which is the fireflies' cap) | $0 |
| The bartender (capped at 1,000 replies a month) | up to about $5 |
| Audible sync (a minute of Actions a day) | $0 |

Anything that adds a recurring cost needs its cap set in code and a line in this table.
