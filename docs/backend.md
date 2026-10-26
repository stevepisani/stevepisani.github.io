# The backend: Supabase, the bartender, deploys, secrets, money

Everything that isn't static files. There's one backend, a Supabase project (on the Tabby Stack organization's Pro plan), and
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
  ChatGPT and its consent page, the sign-in email's subject, a 6-digit code good for 15 minutes, and sessions that
  last: an hour's access token renewed by a refresh token that rotates, with no time limit and no
  inactivity limit, so a phone stays signed in until it signs out; `docs/apps.md`, "Staying
  signed in").
- `realtime.json`: Realtime's limits, the fireflies' cost cap. Presence goes to everyone on the
  planet, so its messages grow with the square of the crowd: at most 50 connected at once (the
  rest see no fireflies and try again later) and 2 presence updates a second across the project,
  so at most about 360,000 messages an hour (8.6 million a day, about $9 a day beyond Pro's
  included 5 million a month, only if it were full around the clock), and far fewer in practice (each visitor sends at most one
  update every 15 s). This is the site's cap: the organization's spend cap would also hold up the
  other projects in it, so it stays off. Only private channels are allowed (`private_only`), and
  the `planet` channel's rules (`realtime.messages`, in `20261021000100_hardening.sql`) let anyone
  in for presence and nothing else: a broadcast would go to everyone on the planet, each copy
  billed, and with public channels anyone holding the public key could send thousands a second.
- `templates/<name>.html`: Auth's emails, each the auth config's `mailer_templates_<name>_content`.
  `magic_link.html` is the sign-in email: the link and the code (`{{ .ConfirmationURL }}`,
  `{{ .Token }}`), the code being how the home-screen app signs in (`docs/apps.md`, "Signing in").
  Like `auth.json`, it reaches Supabase only when the Supabase workflow runs (on a merge to main
  that touches `supabase/`, or by hand), never with the site build; until then the email has only
  the link, and the code field has nothing to take.
- `functions/<name>/index.ts`: edge functions, Deno TypeScript. Type-check with
  `deno check --node-modules-dir=none supabase/functions/<name>/index.ts` (the flag keeps Deno from
  looking for the site's own `node_modules`).
- `tools/supabase.mjs` applies the migrations, the JWT signing keys (one ES256 key in use, the old
  secret still trusted), `auth.json`, the email templates and `realtime.json` through the Management API with
  `SUPABASE_ACCESS_TOKEN` (`--dry-run` previews).
- `.github/workflows/supabase.yml`: on a merge to main that touches `supabase/`, it applies them,
  copies the `ANTHROPIC_API_KEY` and `GOOGLE_MAPS_API_KEY` repo secrets into the project's function secrets, and deploys
  every function (Supabase CLI, `--use-api`, no Docker). To try a change before merging, run the
  workflow on your branch (Actions → Supabase → Run workflow). Every hour it also asks the API for
  something, because free projects pause after a week without requests, makes the smaller copies of
  new wardrobe photos, for the MCP server and for the app (`tools/photo-copies.mjs`, `docs/apps.md`,
  "Photo sizes"), and empties the
  wardrobe's trash (garments, photos, trips, and the days' events undone): what was deleted over 30 days ago goes for good, its photo files with it
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
| `members`, `is_member()`, `me()` | who may use the private bits (every policy asks `is_member()`), and to the app each one's name and sections (`me()`, their own row) | members |
| `recipes` | Recipes, a tab in SJPJr (`/apps/#recipes`; `docs/apps.md`) | members only |
| `wardrobe_items`, `wardrobe_variants`, `wardrobe_products`, `wardrobe_photos`, view `wardrobe_closet` | the wardrobe (in SJPJr, `/apps`): each owned garment, the colour and size it is, the garment as sold, its photos; the view resolves them flat (`docs/apps.md`) | each member their own rows; what's linked must be theirs too |
| `trips` | the wardrobe's trips | each member their own |
| `events` | what happened, a day at a time: what Steve wore and a line about the day (later visits, meals, buys), each with how it was known; only added to, the newest of a day standing, Undo to the trash (`docs/apps.md`, "Days") | each member their own; a day's trip must be theirs |
| `places`, view `public_places` | Places, a tab in SJPJr: what Steve saved in Google Maps, one record a place, each with its lists and the files it came from, waiting for review, private until shared or made public; `places_guard` marks what can never be public (home, work, labeled places, lodging, near home) and a check enforces it; `places_import()` adds and merges an import (`docs/apps.md`, "Places") | each member their own; other members read what's kept and shared or public; anyone reads `public_places` (kept, public, not sensitive: name, lists, a rounded location, stars) |
| `inbox` | raw evidence not yet filed, kept as it came: today, each Google Takeout imported, its files under `photos/inbox/<owner>/` | each member their own |
| `places_api_usage`, `places_api_take(n)` | the Places API's calls this month, capped at 1,000 | members take through the function; nobody reads the table |
| `photos` bucket | every private app's pictures and files, a folder per app (recipe photos from before Oct 2026 are at the root) | members; `wardrobe/` and `inbox/` each person's own folder |
| `bottles` | messages in bottles thrown on the planet | anyone inserts unapproved (at most 200 waiting); everyone reads approved ones; members approve |
| `pageviews`, `pageviews_daily(since)` | the cookieless page count: path, referring host, phone/tablet/desktop | anyone inserts (at most 300 a minute across the site; past that they're quietly not counted); members read rows; everyone reads daily totals |
| `planet_requests`, `planet_request_add()` | planets sent to be built by the Planets connector's `send_planet`: the spec, a note, how to reach them (`docs/planets.md`) | the connector adds (service role, at most 20 a day and 50 waiting); members read and update; the hourly workflow tells Steve |
| `bartender_usage`, `bartender_asks`, `bartender_take()`, `bartender_spent()` | the bartender's limits and token log | service role only |
| Realtime channel `planet` | presence for the fireflies (no table) | anyone, anonymous |

Approving a bottle is, for now, setting `approved = true` on its row (as a member).

### What a visitor can reach

Signed out, with the public key, someone can: insert a bottle (capped) and a page view (capped),
read approved bottles, the daily page totals and `public_places`, call `is_member()` (false), and
join the `planet` channel for presence. Nothing else: every other table has no grant to `anon` at
all (not only no policy), so a mistake in a policy can't open one. A signed-in account that isn't
in `members` sees nothing either (every policy asks `is_member()`), and sign-ups are off. The
functions that answer a visitor (`bartender`, `sky`) cap what they cost; the ones that act for a
member (`mcp`, `wardrobe-link`, `places-locate`) check the token and `is_member()` themselves, and
the two that fetch addresses they're given (a shop's page, a chat's upload) refuse private
addresses at every redirect. When adding a table, revoke it from `anon` unless the planet needs it.

## The wardrobe's functions

`supabase/functions/wardrobe-link`: reads a shop's product page for the wardrobe (name, brand,
picture, price; `_shared/product.js`), called with the member's own session, so the picture it
stores lands in their folder under their rules. `supabase/functions/mcp`: the wardrobe's MCP
server for ChatGPT, signed in through Supabase Auth's OAuth server (on in `auth.json`; the consent
page is `/apps/authorize`). Both are deployed with `--no-verify-jwt` and check the caller
themselves, with a supabase-js client made with the caller's token as `Authorization` (spelled
so: supabase-js adds its own `Authorization`, and a lowercase one alongside is sent as
"Bearer t, Bearer t", which Supabase Auth refuses with an HTML page). The MCP server logs why it
refused a token (the error, and the token's non-personal claims), and keeps the token's OAuth
client id as who recorded what a chat logs (`events.recorded_by`). It keeps the weather half an
hour per place and day, so a chat's get_today and get_trip ask Open-Meteo once. No running cost.
See `docs/apps.md`.

`supabase/functions/places-locate`: finds where the saved places with no coordinates are (a
saved list gives only a name and a link), 25 a call, by the Places API (New) Text Search with a
field mask of only `places.id,places.location,places.formattedAddress`, as the member (row-level
security applies), each batch taken from `places_api_take` first (1,000 a month; the key's own
daily quota is a backstop). With no `GOOGLE_MAPS_API_KEY` it answers `missing_key` and changes
nothing. Deployed with `--no-verify-jwt`, checking the caller itself like the others.

## The Planets connector (`supabase/functions/planets`)

MCP for anyone's ChatGPT or Claude to design a little planet and preview it in the chat
(`docs/planets.md`). No sign-in, nothing read or stored: `preview_planet` checks a spec and packs
it into a link to `/p/preview/`. Deployed with `--no-verify-jwt`; at
`https://mcp.stevenpisani.com/planets` through the proxy.

## The telescope's moon (`supabase/functions/sky`)

GET -> this hour's moon from NASA's Dial-A-Moon (its picture, how big and how lit it looks, its
libration and tilt; and the same for the nearest full moon, so a landing site in the dark can be shown in daylight), for the telescope on the homepage (`assets/js/world/eyepiece.js`). NASA's API
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
accounting runs after the reply has gone out (input logged as billed: a cache write 1.25 times, a
read a tenth). Limits, in the database: 4,000 replies a month (about $5 with the prompt cached) and
20 questions an hour per visitor, keyed by a daily-salted hash of the IP (the one Cloudflare saw,
`cf-connecting-ip`, since the first `x-forwarded-for` entry is whatever the caller wrote), never the
IP, and 1,000 replies in any 24 hours, so a day can't spend the month. It
declines to talk about clients and points people to email. When the model can't answer (no credit
left on the Anthropic account, an outage, or a limit reached) it sends back nothing, and the page answers from the same
facts on its own (`assets/js/world/barback.js`: who Steve is, a drink from the chalkboard, what he's
reading, his latest post, a project, his email; the menu for anything else), so the bar is never
closed. The suggested questions (`ask` in `_data/bar.yml`) are answered that way too, in the page,
so only what people type costs anything. Only with no connection and no `/bartender.json` does it
say the bar's closed for a moment. The prompt is cached (the same for everyone): a reply costs about
$0.001 while the cache is warm (5 minutes), against $0.004 sent whole. Haiku 4.5 caches only a
prompt of 4,096 tokens or more, so `bartender.json` lists 30 books a shelf, which keeps the brief at
about 4,700; trimming it below 4,096 would quietly quadruple the cost.

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
| Exchange rates (Today's home and away line) | none: the browser asks Frankfurter (free, no key) at most once a day | — |
| Supabase | `.github/workflows/supabase.yml` | merges touching `supabase/` |
| mcp.stevenpisani.com (the wardrobe MCP server's address, `proxy/`) | `.github/workflows/mcp-proxy.yml`: Cloudflare Pages | merges touching `proxy/`; skipped without the Cloudflare secrets |
| Audible library | `.github/workflows/audible.yml` (`tools/audible-sync.py`); commits `_data/audible.json` and starts the site workflow | daily |
| GitHub profile README | the `stevepisani/stevepisani` repo rebuilds its README daily from `https://stevenpisani.com/profile.json` (built from `_data/profile.yml`) | daily |

Pages is set to Source: GitHub Actions. The custom domain is in `CNAME`; don't remove it.

## Secrets (repo secrets in GitHub; never in the repo, never pasted into a chat)

- `SUPABASE_ACCESS_TOKEN`: the Supabase Management API, for `supabase.yml`.
- `ANTHROPIC_API_KEY`: copied into the bartender function's secrets on deploy. A monthly spend
  limit is also set in the Anthropic console, as a backstop to the cap in code.
- `GOOGLE_MAPS_API_KEY`: the Places API (New), for `places-locate`; copied into the function
  secrets on deploy. A Google Cloud key restricted to Places API (New), with a per-day quota of
  100 as a backstop to the cap in code (the steps are in `docs/roadmap.md`, "Waiting on Steve").
- `CLOUDFLARE_API_TOKEN` (Cloudflare Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`: the MCP server's
  address, for `mcp-proxy.yml` (`docs/apps.md`).
- `AUDIBLE_AUTH`: the Audible device registration, for `audible.yml` (above).
- `GITHUB_TOKEN` (automatic): the Jekyll build's GitHub metadata, and the Audible sync's commit.

## Money

The rule: the whole site costs no more than $20 a month. Today it's about $5 at most.

| Item | Cost |
|---|---|
| GitHub Pages and Actions | $0 |
| Supabase (the Tabby Stack organization's Pro plan, not counted here; Realtime: 5 million messages a month included, then $2.50 a million, held down by `realtime.json`) | $0 |
| The bartender (capped at 4,000 replies a month, prompt cached) | up to about $5 |
| Audible sync (a minute of Actions a day) | $0 |
| mcp.stevenpisani.com (Cloudflare Pages, free plan: 100,000 requests a day) | $0 |
| Places API (New), finding saved places (capped at 1,000 calls a month, inside Google's free monthly calls for Text Search) | $0 |
| The telescope's moon (an edge function call per visitor per hour, on the free plan's 500,000 a month) | $0 |
| The Planets connector (`docs/planets.md`: an edge function call per tool call, nothing stored, no AI of ours; requests over 256 KB refused) | $0 |
| Meshy models for the things on friends' planets (`tools/planet-models.mjs`, by the Planet models workflow: about 30 credits, so about $0.60, a model; at most 8 a planet and 24 a run, and only what's missing; Steve approved up to $5 a planet for the first ones) | about $5 a planet built |

Anything that adds a recurring cost needs its cap set in code and a line in this table.
