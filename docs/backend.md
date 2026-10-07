# The backend: Supabase, the bartender, deploys, secrets, money

Everything that isn't static files. There's one backend, a Supabase project on the free plan, and
all of it is code in this repo: nothing is changed by hand in a dashboard.

## Supabase (`supabase/`)

The project: `dkaiavlnmtetqigxnkwb`. Its URL and public (anon) key are set once, in
`supabase:` in `_config.yml`; `_includes/head.html` writes them into `supabase-url` /
`supabase-key` meta tags, and everything in the browser reads them from there (`window.siteDb`
in `site.js`, `DB` in `world/main.js`, `db` in `apps/lib/kit.js`). The anon key is public by
design: row-level security guards every table.

- `migrations/*.sql`: applied in name order, each once, recorded in
  `supabase_migrations.schema_migrations` as the Supabase CLI does. Write them idempotent
  (`create … if not exists`, `drop policy if exists` before `create policy`), so a re-run is safe.
  To change the schema, add a new migration; never edit one that has run.
- `auth.json`: sign-in settings (site URL, allowed redirects, sign-ups off, the OAuth server for
  ChatGPT and its consent page).
- `functions/<name>/index.ts`: edge functions, Deno TypeScript. Type-check with
  `deno check --node-modules-dir=none supabase/functions/<name>/index.ts` (the flag keeps Deno from
  looking for the site's own `node_modules`).
- `tools/supabase.mjs` applies the migrations, the JWT signing keys (one ES256 key in use, the old
  secret still trusted) and `auth.json` through the Management API with
  `SUPABASE_ACCESS_TOKEN` (`--dry-run` previews).
- `.github/workflows/supabase.yml`: on a merge to main that touches `supabase/`, it applies them,
  copies the `ANTHROPIC_API_KEY` repo secret into the project's function secrets, and deploys
  every function (Supabase CLI, `--use-api`, no Docker). To try a change before merging, run the
  workflow on your branch (Actions → Supabase → Run workflow). Every hour it also asks the API for
  something, because free projects pause after a week without requests, makes the smaller copies of
  new wardrobe photos, for the MCP server and for the app (`tools/photo-copies.mjs`, `docs/apps.md`,
  "Photo sizes"), and empties the
  wardrobe's trash: what was deleted over 30 days ago goes for good, its photo files with it
  (`tools/empty-trash.mjs`; `docs/apps.md`, "The trash"). It prints counts only.
- **When a function misbehaves, read its logs:** Actions → Supabase → Run workflow with "logs"
  ticked. `tools/supabase-logs.mjs` prints the last 3 hours of edge function requests (time,
  method, path, status) and what the functions logged, through the Management API's `logs`
  endpoint (one `logs` table, ClickHouse SQL). It changes nothing. It prints paths only, never
  query strings, headers or bodies, because the Actions log is public; keep anything personal out
  of `console` calls in the functions for the same reason. The logs arrive a minute or two late.

What's in the database:

| Thing | What it is | Who can do what |
|---|---|---|
| `members`, `is_member()` | who may use the private bits; every policy asks `is_member()` | members |
| `recipes` | the recipe tracker (`/apps/recipes`; `docs/apps.md`) | members only |
| `wardrobe_items`, `wardrobe_variants`, `wardrobe_products`, `wardrobe_photos`, view `wardrobe_closet` | the wardrobe (`/apps/wardrobe`): each owned garment, the colour and size it is, the garment as sold, its photos; the view resolves them flat (`docs/apps.md`) | each member their own rows; what's linked must be theirs too |
| `trips` | the wardrobe's trips | each member their own |
| `photos` bucket | every private app's pictures, a folder per app (recipe photos from before Oct 2026 are at the root) | members only |
| `bottles` | messages in bottles thrown on the planet | anyone inserts unapproved (at most 200 waiting); everyone reads approved ones; members approve |
| `pageviews`, `pageviews_daily(since)` | the cookieless page count: path, referring host, phone/tablet/desktop | anyone inserts; members read rows; everyone reads daily totals |
| `bartender_usage`, `bartender_asks`, `bartender_take()`, `bartender_spent()` | the bartender's limits and token log | service role only |
| Realtime channel `planet` | presence for the fireflies (no table) | anyone, anonymous |

Approving a bottle is, for now, setting `approved = true` on its row (as a member).

## The wardrobe's functions

`supabase/functions/wardrobe-link`: reads a shop's product page for the wardrobe (name, brand,
picture, price; `_shared/product.js`), called with the member's own session, so the picture it
stores lands in their folder under their rules. `supabase/functions/mcp`: the wardrobe's MCP
server for ChatGPT, signed in through Supabase Auth's OAuth server (on in `auth.json`; the consent
page is `/apps/authorize`). Both are deployed with `--no-verify-jwt` and check the caller
themselves, with a supabase-js client made with the caller's token as `Authorization` (spelled
so: supabase-js adds its own `Authorization`, and a lowercase one alongside is sent as
"Bearer t, Bearer t", which Supabase Auth refuses with an HTML page). The MCP server logs why it
refused a token (the error, and the token's non-personal claims). No running cost. See `docs/apps.md`.

## The telescope's moon (`supabase/functions/sky`)

GET -> this hour's moon from NASA's Dial-A-Moon (its picture, how big and how lit it looks, its
libration and tilt), for the telescope on the homepage (`assets/js/world/eyepiece.js`). NASA's API
only answers browsers on its own sites, so the function asks for it. It's kept for the hour, in the
function and (`cache-control`) in the browser, so a visitor costs one call an hour at most. Called
with the public key, like the bartender (JWT checked by the gateway). No running cost. The sun's
picture (SDO, via SOHO) and the moon's picture itself load straight from NASA in the page.

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
wouldn't). `tools/library.mjs` then merges it with Steve's shelves (`_data/books.yml`) into one list
of books, `_data/library.json`, at `npm run build`: a book is a book however he read it. A listed title
that's also on Audible (the same title before any subtitle and, if the shelf names an author, that
surname among the Audible authors) is one book, with Audible's cover and date, on the listed shelf; an
unlisted Audible book goes on the shelf whose `genres` has its genre, else the `"*"` one (the build
says which genres it didn't know). That feeds /bookshelf, `/library.json` (the stars over the hammock)
and the bartender.

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
  (a made-up API response; `tools/fixtures/listening.json` is its output, which the smoke test merges
  with `tools/fixtures/books.yml` and serves as `/library.json`).

## Deploys

| What | How | When |
|---|---|---|
| The site | `.github/workflows/site.yml`: bundle (`npm run build`), Jekyll, link check, smoke test, then `actions/deploy-pages` | every push to main; PRs build and test only |
| Supabase | `.github/workflows/supabase.yml` | merges touching `supabase/` |
| mcp.stevenpisani.com (the wardrobe MCP server's address, `proxy/`) | `.github/workflows/mcp-proxy.yml`: Cloudflare Pages | merges touching `proxy/`; skipped without the Cloudflare secrets |
| Audible library | `.github/workflows/audible.yml` (`tools/audible-sync.py`); commits `_data/audible.json` and starts the site workflow | daily |
| GitHub profile README | the `stevepisani/stevepisani` repo rebuilds its README daily from `https://stevenpisani.com/profile.json` (built from `_data/profile.yml`) | daily |

Pages is set to Source: GitHub Actions. The custom domain is in `CNAME`; don't remove it.

## Secrets (repo secrets in GitHub; never in the repo, never pasted into a chat)

- `SUPABASE_ACCESS_TOKEN`: the Supabase Management API, for `supabase.yml`.
- `ANTHROPIC_API_KEY`: copied into the bartender function's secrets on deploy. A monthly spend
  limit is also set in the Anthropic console, as a backstop to the cap in code.
- `CLOUDFLARE_API_TOKEN` (Cloudflare Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`: the MCP server's
  address, for `mcp-proxy.yml` (`docs/apps.md`).
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
| mcp.stevenpisani.com (Cloudflare Pages, free plan: 100,000 requests a day) | $0 |
| The telescope's moon (an edge function call per visitor per hour, on the free plan's 500,000 a month) | $0 |

Anything that adds a recurring cost needs its cap set in code and a line in this table.
