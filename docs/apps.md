# The private apps (`/apps`)

Small tools for life at home, on the site but only for members: Steve and Lexi today. The recipe
tracker was the first; the wardrobe is the second. They share one sign-in, one look and
one small kit, so a new app is a table, a page and a script, and nothing else.

## How it fits together

| Piece | What it does |
|---|---|
| `_data/apps.yml` | the list on `/apps` (`apps/index.html`): title, url, emoji, blurb |
| `_layouts/app.html` | the shell: the site's nav and themes, the heading, the sign-in form, and the page's content hidden until a member is signed in. It loads `apps.css` (through `head.html`) and the script named by `app:` |
| `assets/css/apps.css` | the parts apps are made of, all on the site's tokens: fields, the top block (`.app-hero`), toolbar (`.app-bar`), segmented filter (`.seg`), cards (`.items`, `.item`), pill, rating, dialog, toast |
| `assets/js/apps/lib/kit.js` | `db` (the Supabase client), `start(open, close, { offline })` (the gate; with `offline: true` it opens with no connection for whoever was last signed in on that browser, `user.offline` set), `rows(table)` (list, add, set, remove, with failures shown), `saver(field, save)` (save as you type, and when the page is hidden), `fresh(again)` (reload after a minute away, so a stale tab doesn't save over the other person's edits), `ask(dialog)` (a form in a dialog; Cancel is `type="button" data-close`, so Enter submits), `photos` (put, urls, remove), `toast(text, bad, undo)` (with `undo`, an Undo button that runs it) |
| `apps/offline.js` | the service worker for `/apps/` (registered by the wardrobe): network first, keeping a copy of each page, script and stylesheet as it passes, and answering from the copy with no connection; with none, Storage photo links are answered from the `wardrobe-photos` cache the app fills (keyed by file, without the signed link's token) |
| `assets/js/apps/<name>.js` | one app. `tools/build-js.mjs` bundles every file in this folder to `dist/apps/<name>.js`; what they share is split into one chunk |

Signing in is a link by email (Supabase magic link), sign-ups off. The session is kept in the
browser for the whole site, so signing in once covers every app, and the site's nav shows "Apps"
to someone signed in (`site.js`). Who's a member is the `members` table; every table's policy asks
`is_member()`, and the page asks it too, only to decide what to show. The pages are `noindex`.

## Adding an app (say, a wardrobe)

1. **A table**, in a new migration (`supabase/migrations/<timestamp>_<name>.sql`), written so a
   re-run is safe. Shared between members:

   ```sql
   create table if not exists public.clothes (
     id uuid primary key default gen_random_uuid(),
     name text not null,
     photo_path text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   alter table public.clothes enable row level security;
   drop policy if exists "members" on public.clothes;
   create policy "members" on public.clothes for all to authenticated
     using ((select public.is_member())) with check ((select public.is_member()));
   drop trigger if exists trg_clothes_updated_at on public.clothes;
   create trigger trg_clothes_updated_at before update on public.clothes
     for each row execute function public.set_updated_at();
   ```

   If each person should see only their own rows, add `owner uuid not null default auth.uid()`
   and make the policy `(select public.is_member()) and owner = (select auth.uid())`.
2. **A page**, `apps/<name>.html`, with `layout: app`, `app: <name>`, `title:` and `lede:` (the
   lede is what the sign-in form says the app is). Its content is the app's markup, built from the
   classes in `apps.css`; `apps/recipes.html` is the example.
3. **A script**, `assets/js/apps/<name>.js`: import from `./lib/kit.js`, and call
   `start(async () => { … load and draw … })`. Photos go in the shared private `photos` bucket,
   under `<name>/<row id>/` (`photos.put(file, folder)` shrinks them to 1600px first).
4. **A line** in `_data/apps.yml`.
5. **A test**: a fixture in `tools/fixtures/` and a few steps in `apps()` in `tools/smoke.mjs`,
   which runs the apps against a made-up Supabase.

Put something in the kit or `apps.css` only when a second app needs it.

Known limits, to deal with when an app meets them:

- **Photos are members-wide**, except the wardrobe's: the `photos` bucket's one policy asks
  `is_member()`, and for paths under `wardrobe/` also that the second folder is the person's own
  id (`wardrobe/<user id>/…`). Another per-person app needs the same clause for its folder.
- **Photos are freshly signed each visit**, so the browser never caches them. Fine for a few
  dozen at 1600px; the wardrobe stores its cut-outs at 1200px as WebP (`photos.put(file, folder,
  { alpha: true, longest: 1200 })`, 50 to 200 KB each), which holds up to a couple of hundred.
- **`rows().list()` has no paging**; the API returns at most 1,000 rows.
- Recipe photos from before Oct 2026 sit at the bucket's root (`<recipe id>/…`); new ones are
  under `recipes/`. Both work.

## The recipe tracker (`/apps/recipes`)

Table `recipes`. Up top, the one thing to act on: tonight's pick (the same one all day; "Another"
picks at random), with how many are cooked, the average rating, the streak and a progress bar.
Then search and Add; All / To cook / Cooked with their counts; and the order. The filter and order
are remembered on that phone (`localStorage` `recipes-view`).

A recipe still to cook is a small card: its name (a link to the recipe) and "Cooked it". Once
cooked it grows: the photo, the date, a rating out of 10 (the same star again clears it), notes
that save as you type, and "Add a photo". "Edit" opens the name, link, date, "Not cooked yet"
and remove (and, on one still to cook, its notes). Import, a pasted list of `Name | link` lines,
is a link under the list.

Design rules for the apps, from the Oct 2026 critique and accessibility pass:
- Show a control when there's something to do with it, not before (no rating on an uncooked
  recipe). The first phone screen should reach the list.
- Text is `--ink` or `--ink-2`; `--ink-3` is for borders and outlines only (in the light theme
  it's 3.7:1 on white, short of the 4.5:1 text needs). Field borders are `--ink-3`, not `--line`.
- State is never colour alone: stars are outlined or filled, a pressed filter is inverted.
- Tap targets are 44px tall; scrolling and confetti respect reduced motion.
- Not fixed, because it's the whole site's: white on the light theme's `--accent` (buttons) is
  3.9:1.

It lived at `/recipe_tracker/` as a standalone page until Oct 2026; that address redirects.
Gone with the old page: the Refresh button (it reloads by itself when you come back to it), the
Cmd+I, Cmd+N and R shortcuts, and the camera opening straight away for a photo (the phone now
offers the library too). The old page could also fetch an NYT Cooking collection through public CORS proxies; that was
dropped (third-party proxies, and no way to test it). If it's missed, the way to do it is an edge
function.

## The wardrobe (`/apps/wardrobe`)

Steve's clothes: private to him, not shared (table `wardrobe_items`, rows owned by `auth.uid()`;
photos under `photos/wardrobe/<user id>/`). ChatGPT reads and edits the same rows through the
wardrobe MCP server, signed in as him (below).

- **The model** (`supabase/migrations/20261005000100_wardrobe_products.sql`): an **owned item**
  (`wardrobe_items`, the same ids as ever; trips point at these) is a garment Steve has, one row
  per physical piece. It may belong to a **variant** (`wardrobe_variants`: one colour and size as
  sold, the maker's colour and size as printed, "38 Dark Brown" / "M", beside plain ones for
  search, plus SKU, barcode, retail price, measurements), which belongs to a **product**
  (`wardrobe_products`: brand, name, style number, material, origin, default fit, other codes).
  A thrifted or unbranded piece is just an item. The item keeps what's its own: category and
  subcategory, how it dresses (warmth, dressiness plus `dressiness_also`, seasons, style tags),
  condition, what he paid and when, notes; a product or variant fact set on it overrides that one
  piece. Every level has `sources`: per field, where the value came from (`user`,
  `garment_label`, `hang_tag`, `care_label`, `retailer_page`, `manufacturer_page`,
  `vision_inference`, `derived`), how sure (0 to 1), and the text as found. `wardrobe_photos` has
  every photo with its role (garment, tag, care_label, detail, other); the item's `photo_path` is
  the one shown. `wardrobe_closet` is the flat view (the item's own value, else the variant's,
  else the product's) that the app and `find_items` read. The first three items (one Uniqlo shirt
  in three colours, added before this) were regrouped by
  `20261005000200_wardrobe_uniqlo.sql`: one product, three variants, the same three ids, the old
  values kept in `sources.migrated_from`.
- **Where you are is in the address** (`#today`, `#closet`, `#trips`, `#trip/<id>`,
  `#trip/<id>/pack`, `#item/<id>` over whatever's underneath), so Back works everywhere and any
  view can be linked. With a trip on, or starting within two weeks, it opens on Today; otherwise
  on the tab last used.
- **The closet:** search and Add, category chips (All, then each category with something in it,
  with counts), and Filters (season, dressiness, "In the closet / Retired"; folded away on a
  phone). A grid of square tiles: the photo cut out on a soft tile, the name, brand and size.
  Remembered on that phone (`localStorage` `wardrobe-view`).
- **An item** (tap a tile, or an item anywhere): what it is first: the photo, category, name,
  brand, colour (as printed, if known), material and size, fit, style number, condition, the
  kind, seasons, warmth and dressiness (and where else it works), price and when it was bought,
  notes, then every photo with its role, one marked shown (tap one to say what it is, show it, or
  remove it), "Buy another" (the replacement link) and "Find another" (a Google Shopping search
  for brand, name and colour). "Edit" shows the fields; text saves as it's typed, the rest at
  once. Edits are for this piece only (on a piece with a product, it says so); changing the
  maker's facts for every colour and size is ChatGPT's (`update_item`, scope product or variant).
  "Add a photo" adds one (cut out), shown if there's no garment photo shown yet. Something just added opens on the fields. "Retire it" moves it out of the closet (kept,
  under Retired, with Undo); "Delete it" is for good, and only here, never from ChatGPT.
- **Adding:** a photo, or a store link (or both: the link is kept as where to buy another).
  - A photo is cut out of its background in the browser (`@imgly/background-removal`, run on
    demand; its model, about 40 MB, comes from imgly's CDN the first time and is then cached;
    about 15 s on a laptop). If it can't be cut out it's kept as taken. The library is AGPL-3.0,
    which this site, whose source is public, already meets.
  - A store link goes to the `wardrobe-link` edge function, which reads the page's JSON-LD or
    Open Graph tags (`supabase/functions/_shared/product.js`: name, brand, picture, price) and
    copies the picture into the person's folder, as them. Some shops (Patagonia, J.Crew) refuse
    anything that isn't a browser; then only the link is kept and the name is typed.
- Categories: tops, bottoms, outerwear, suits, shoes, accessories, workout, swim (a check in the
  table, and `CATS` in `wardrobe.js`).
- **Trips** (the Trips tab; table `trips`, private like the clothes): a trip is its legs (a
  place, looked up for its latitude and longitude, and dates), its days (the wardrobe items worn,
  what the day holds, a note) and its packing list (wardrobe items or plain labels, how many,
  packed or not), kept on the row as JSON. A trip shows each leg with its weather (a bar a day:
  its height the high, its blue the chance of rain; dashed for typical days), the planned days
  with their outfits, and how the packing's going. Trips are mostly made in ChatGPT; "New trip"
  and "Edit" here take a name, places and dates, and notes.
- **Today** (a tab only while a trip is on, or starts within two weeks): the trip's line, leg by
  leg, with the one you're on lit and the days left there; then a card for the day: the place,
  the high, the low and the chance of rain, a line of advice when the weather and the outfit
  disagree, and what you're wearing (the occasion, the items, the note). "Day before" and
  "Tomorrow" step through the trip. Below, the next five days (weather and a thumbnail of each
  outfit; tap one to see it on the card) and the packing. Before the trip, the card shows its
  first day. The advice (`advice()` in `wardrobe.js`) knows only what the items say: rain of 50%
  or more asks for something whose name, material or notes say rain, waterproof, shell, Gore-Tex,
  trench, mac or umbrella, and warns off suede; a low under 8° with nothing from outerwear or
  warm; a high of 26° or more with something warm.
- **Packing** (`#trip/<id>/pack`): "To pack" (what's left) or "All", how many are packed and how
  long until you leave, then a row a thing by category (other things last), each with its photo,
  how many, and a round tick. Ticking says so with Undo; × takes it off the list (with Undo).
  "Make the list from the planned outfits" (or "Add from the planned outfits") adds what the
  planned days wear that isn't on it yet.
- **With no connection** (a plane, a train abroad): every load keeps a copy on the phone
  (`localStorage` `wardrobe-copy:<user id>`: the rows and the photo links; `wardrobe-wx`: the last
  weather for each leg; the photos in the `wardrobe-photos` cache), and `apps/offline.js` keeps
  the page and its scripts. Offline, the app opens on that copy and says how old it is. Packing
  ticks work and wait in `wardrobe-queue`; they're sent (the whole list per trip, the last one
  wins) when the connection's back, before anything is loaded. Adding and editing wait for a
  connection, and say so.
- **Weather** comes from Open-Meteo (free, no key; `supabase/functions/_shared/weather.js`, which
  the MCP server runs and the app bundles): the forecast for the days it reaches (15), then for
  the rest the same dates over the last three years, the temperatures averaged and the chance of
  rain being how many of those years it rained. Leg summaries count the expected days of rain.

## ChatGPT and Claude: SJPJr, the MCP server

SJPJr (after the site's badge) is Steve's own things on this site, for ChatGPT and Claude: today
his wardrobe and trips, more later. `supabase/functions/mcp`, at
`https://<ref>.supabase.co/functions/v1/mcp`: MCP over Streamable HTTP, stateless (each POST gets
one JSON answer; no sessions, no stream). In plain JavaScript, so `tools/wardrobe-test.mjs` runs
it in Node against the real schema (below):

- `server.js`: the protocol, who the server is, the card's resource, and the rules;
- `areas/`: one file per area (`wardrobe.js`, `trips.js`), each `{ name, records, tools,
  status, instructions, call }`: its tools, the status lines ChatGPT shows while each runs, what
  the model is told about it, and the code;
- `kit.js`: what the areas share (the card's keys, tool hints, `Invalid` for a call's mistakes);
- `index.ts`: serves it, checks who's calling, and gives it the data as that person (the `ctx`
  object, listed at the top of `server.js`).

### The rules

The same for every area, kept in one place (`RULES` in `server.js`), checked when the server
starts (an area that breaks them doesn't load, and the test checks them too), told to the model in
its instructions, and said on every tool that writes:

1. Steve's own records (an area with `records: true`: the wardrobe, trips) can be read and changed
   from a chat. The site's content (drinks, books, what he's written) is read-only there: it
   changes in the repo.
2. Nothing is deleted from a chat: no tool deletes, and none is marked destructive. Deleting is
   Steve's, in the apps; retiring or clearing is the most a tool does.
3. Everything runs as the signed-in member, through row-level security, and stays on
   stevenpisani.com.

### Adding an area

1. `supabase/functions/mcp/areas/<area>.js`: its tools (each with a title, read-only or write
   hints, and a description written for the AI calling it), `status` for each, `instructions`
   (a sentence or two), `call`, and `records` (true only for Steve's own records).
2. A line in `AREAS` in `server.js`, and its words in `RULES` and the first instruction if it's
   records.
3. If it shows the card: `_meta: showsCard` on its tools, a `view` in its results, and
   `assets/js/mcp-app/views/<area>.js` with the view (added to `views`) and its styles (`css`),
   imported in `widget.js`.
4. Its data in `ctx` (`index.ts`, and `tools/wardrobe-db.mjs` for the tests), and its checks in
   `tools/wardrobe-test.mjs` (and the smoke test's card session for a view).
5. The tool list below, and the consent page's line (`apps/authorize.html`) if it's records.

- **Tools** (read-only marked so): `find_items` (start here; one entry per physical piece, flat:
  product and variant facts filled in; by words, category, season, dressiness, which matches where
  it mostly belongs or also works, and warmth), `get_item` (the piece whole: flat, product,
  variant, what's set on it alone, photos with their roles and ids, and every fact's source),
  `read_store_link`, `list_trips`, `get_trip`; and `ingest_item` (below), `add_item` (a quick item
  with no product), `add_photo` (with a role), `set_photo_role` (what a photo is, or which is
  shown), `update_item` (with a scope, below), `retire_item` (or back), `create_trip`,
  `update_trip`, `plan_days`, `set_packing` and `tick_packing` (the card's). No delete: that's
  only in the app. The tool descriptions are written for the AI calling them: which to start
  with, when to ingest rather than add, what's a fact and what's a judgement, how photos get
  roles, how duplicates are avoided.
- **ingest_item** files a garment at every level at once. The caller (ChatGPT) reads the photos or
  the shop page and passes `product` (brand and name needed; style number, material, origin,
  default fit, URL, other codes), `variant` (colour and size as printed, plain ones, SKU, barcode,
  retail price, measurements) and `item` (category needed; subcategory, warmth, dressiness and
  dressiness_also, seasons, style tags, condition, what was paid, when; a name only when there's
  no product), each with `sources` per field. The server finds or creates the product (brand +
  style number, punctuation and case aside; else brand + the exact name where style numbers don't
  disagree; never fuzzy), then the variant (SKU, else colour and size as printed), creates the
  owned item (`quantity` for identical pieces, one row each), stores the photos with their roles
  (`garment_photo` is the one shown; `tag_photo`, `care_label_photo`, `detail_photos` beside it),
  and returns the whole garment with `product_created`, `variant_created`, `owned_item_created`
  and warnings (no garment photo, facts without a source, a name-only match, the product found
  again saying something different, which it keeps). A product found again gets its blanks
  filled, never its values changed. Seasons are worked out from warmth when not given, and
  judgements with no source are marked `derived`. `dry_run` shows all that and writes nothing.
  `client_ref` (the caller's id for the garment) makes a retry return what was made; the same
  uploaded photo again does too. No brand (thrifted, old, tailored): leave product out.
- **update_item** says what it changes with `scope`: `item` (default: this piece; a product fact
  set here overrides it for this piece alone, and `get_item` lists the overrides), `variant` (this
  colour and size, every piece of it) or `product` (every colour and size), and answers how many
  garments that touched. A field from another level is refused, with the fields that are allowed.
- **Photos from the chat:** `ingest_item`, `add_item` and `add_photo` take photos Steve uploads in
  ChatGPT (`_meta["openai/fileParams"]`: ChatGPT passes `{ download_url, file_id }`, a short-lived
  link the server fetches and stores at once, up to 15 MB). Each is a row in `wardrobe_photos`
  with its role and the upload's `file_id`, so the same upload twice is one photo. A tag or label
  is never what's shown for a garment: when the photo shown stops being a garment photo, another
  garment photo takes its place, or none. ChatGPT sometimes drops a file; a missing photo is said
  out loud, to re-attach with `add_photo`. Whether ChatGPT passes a list of files
  (`detail_photos`) as well as single ones isn't confirmed; `add_photo` always works. Images
  ChatGPT generates itself can't be passed to a tool (they stay in the chat), which is why
  generated product shots and outfit pictures will be made on the server instead (next).
  ChatGPT can't see images from a connector (Oct 2026), so the photos are shown to Steve in the
  card (below), and the descriptions are what ChatGPT goes on.
- **Tests:** `tools/wardrobe-test.mjs` (in `npm test` and CI) runs every migration in PGlite
  (Postgres in WebAssembly, in Node) with stand-ins for what Supabase provides, seeds the first
  three Uniqlo items as they were and checks their migration, then calls every tool as a signed-in
  member through row-level security: new product, new colour, second piece, quantity, no brand,
  photos with roles, retries and duplicates, dry runs, sources, flat and whole reads, each scope of
  change, retiring, trips, and another member seeing none of it. Its data access is the same
  `ctx` as `index.ts`, on SQL instead of supabase-js.
- **The card** (MCP Apps, SEP-1865, which ChatGPT and Claude both render): `find_items`,
  `get_item`, `get_trip` and `ingest_item` point at one resource, `ui://sjpjr/card.html`
  (`_meta.ui.resourceUri`, and `openai/outputTemplate` for ChatGPT), and the chat shows it under
  the answer with the photos. It's one script (`assets/js/mcp-app/`, bundled to
  `dist/mcp-app.js`, about 25 KB, no libraries: it speaks the protocol's postMessage JSON-RPC
  itself): `card.js`, the shell (the bridge, the parts, the way between views, the shared look),
  and a file per area in `views/` that adds its views and styles; it draws whatever the result's
  `view` says. It follows both hosts' guidelines and
  Krug: two levels, a glance inline (at most two buttons, nothing the model will say anyway, no
  drilling down inside the chat) and the detail full screen; the same shirt in three colours is
  told apart by colour, not three cut-off copies of its name; a fact says where it came from only
  when it was guessed (any fact shows its source when tapped); rare tools appear when they're
  needed.
  - `closet` (`find_items`): a row of photos that scrolls sideways, then "See all". Full screen:
    every garment, with a filter by kind. Tapping a garment opens it full screen.
  - `garment` (`get_item`): the main photo, the others with a badge (Tag, Care, Detail), what it
    is, four facts (the ones Steve asked about first: `get_item`'s `focus`), the rest under "More
    details". Tap a photo to say what it is or make it the main one (`set_photo_role`); a photo
    whose role isn't known asks.
  - `ingest` (`ingest_item`): a dry run is a preview: what it is and whether it's new (a new
    garment, a new colour or size, another one), only the guessed facts up front, the facts read
    off a tag folded, one line of what's missing (the warnings meant for the model stay out), and
    "Add to wardrobe". After adding, the garment.
  - `trip` (`get_trip`): the legs, the next planned outfit as photos, packing so far; "Open trip"
    and "Packing list" go full screen, with Days (each outfit as photos; names on tap) and
    Packing (ticked with `tick_packing`, a tool only the card can call,
    `_meta.ui.visibility: ["app"]`; twins by colour, how often each is worn).

  When Steve opens a garment in the card, the card tells the model (`ui/update-model-context`),
  so "what goes with this?" in the chat knows what "this" is. Without full screen (a host that
  doesn't offer it), the same detail opens inline with a Back link.

  The server answers `resources/read` with the page and the script inlined (it fetches
  `dist/mcp-app.js` from the site, cached ten minutes; if that fails, the page loads it by URL), and
  the resource's CSP allows images from the site and the Supabase project (the signed photo links).
  The card takes its colours and fonts from the host's style variables, with the site's as
  fallback, and follows its light or dark theme. After the card changes, the site has to deploy
  before the function serves it; then refresh the connector (below). The smoke test (`npm test`,
  the "card in chat" session) runs it inside the official MCP Apps host bridge
  (`@modelcontextprotocol/ext-apps`, a dev dependency) with every tool call going to `server.js` on
  PGlite (`tools/wardrobe-db.mjs`, shared with the wardrobe test): full screen in and out, and
  that its taps change the database.
- **Signing in** is OAuth 2.1 with Supabase Auth as the authorization server (its OAuth server,
  beta). A call without a valid token gets a 401 whose `WWW-Authenticate` points at
  `…/functions/v1/mcp/.well-known/oauth-protected-resource` (RFC 9728), which names
  `https://<ref>.supabase.co/auth/v1` as the authorization server. ChatGPT registers itself there
  (dynamic client registration is on), sends you to the consent page, and gets a token for you.
  Every query then runs as you: `getUser` checks the token, `is_member()` must say yes, and the
  tables' row-level security does the rest. Deployed with `--no-verify-jwt` (the workflow's
  list), since the discovery request has no token and tokens are checked here.
- **The consent page** is `/apps/authorize` (`apps/authorize.html`, `assets/js/apps/authorize.js`;
  not listed on /apps): Auth sends you there with `?authorization_id=`; signed in as usual, it
  says which app is asking and where it'll send you back, and Allow or Don't allow answers it.
  Only ChatGPT's and Claude's own addresses can be allowed: `chatgpt.com`, `chat.openai.com`,
  `claude.ai` (Claude's callback is `https://claude.ai/api/mcp/auth_callback`) and `claude.com`
  (where Anthropic says it may move). Claude Code's localhost callbacks aren't allowed. Its address is
  `site_url` + `oauth_server_authorization_path` in `supabase/auth.json`, joined as text, which is
  why `site_url` is the bare `https://stevenpisani.com`.
- **As code:** `supabase/auth.json` turns the OAuth server on; `tools/supabase.mjs` also switches the
  project's JWT signing to an ES256 key once (the OAuth server can't sign ID tokens with the old
  shared secret), keeping the old secret trusted so the anon and service keys and existing
  sessions keep working. `wardrobe-link` is deployed with `--no-verify-jwt` too, and checks the
  caller itself, since tokens from the new key may not pass the gateway's old check.
- **Who it is:** `SERVER` in `server.js` (the `initialize` answer): "SJPJr", a line on what it
  does, its home (`websiteUrl`, the site) and its logo (`ICONS`: the site's SJPJr badge,
  `assets/images/sj-512.png`, `-180`, `-64`). Neither app reads the
  logo from the server yet (Oct 2026): ChatGPT shows the icon uploaded when the connector is
  created (and can't change it after), Claude a globe for every custom connector. Each tool also
  has the status lines ChatGPT shows while it runs (`STATUS`), and the card's resource tells
  ChatGPT's model what the card already shows (`openai/widgetDescription`), so the answer doesn't
  repeat it.
- **Links:** the photos' signed links are long and only the card needs them, so `photosApart`
  moves them out of what the model reads into the result's `_meta` (hosts give that to the card,
  not the model), leaving short references (`"hero_photo": "p1"`) that the card fills back in.
  Results stay small (both apps cap what a tool may return, and the model reads all of it):
  lists give per garment only what dressing and drawing need (`FLAT`; `get_item` has the rest),
  sources drop their dates, the same photo link is sent once, and a trip names each garment once
  (`trip.garments`) with its days and packing pointing at it by id, and its legs' weather as a
  summary. A trip with twenty planned days of five garments went from about 25 KB to 11 KB.
  Results give Steve links into the app instead: `stevenpisani.com/apps/wardrobe#item/<id>`,
  `#trip/<id>`, `#closet`.
- **Transport checks** (MCP 2025-11-25, in `index.ts`): a request from a browser page on another
  site (an `Origin` that isn't ChatGPT's, OpenAI's, Claude's, Anthropic's or this site's) gets a
  403; an `MCP-Protocol-Version` it doesn't speak, a 400; a 401 names the scopes; an unknown
  tool is a protocol error (-32602), and everything else that goes wrong is a result with
  `isError`, worded so the model can fix its call.
- **Its own address:** `https://mcp.stevenpisani.com`, once it's set up. `proxy/_worker.js` is a
  Cloudflare Pages worker that passes every request to the function as it came, adding
  `x-mcp-public-host`; `index.ts` then gives out that address (RFC 9728's `resource` has to be the
  URL the app used; the authorization server stays Supabase Auth, so sign-ins and tokens don't
  change). A browser opening it is sent to the app. `.github/workflows/mcp-proxy.yml` deploys it
  on a merge that changes it, creating the Pages project (`sjpjr-mcp`) and its domain if
  needed; free (Cloudflare's free plan: 100,000 requests a day). Setting it up is Steve's, once:
  1. A free Cloudflare account; its account id (the dashboard's URL, or Workers & Pages →
     overview) goes in the `CLOUDFLARE_ACCOUNT_ID` repo secret, and an API token with "Cloudflare
     Pages: Edit" (My Profile → API Tokens → Create token) in `CLOUDFLARE_API_TOKEN`.
  2. Run the "MCP address" workflow (Actions → MCP address → Run workflow).
  3. At Bluehost, Domains → DNS for stevenpisani.com → add a CNAME record: host `mcp`, points to
     the address the workflow's run names in its summary (`sjpjr-mcp.pages.dev`, unless
     Cloudflare had to pick another). Cloudflare checks it and issues the certificate (minutes to
     an hour); run the workflow again to see it say "active".
  4. Connect the apps again with the new URL (below); the old one keeps working meanwhile.
- **Connecting ChatGPT** (Steve, once): on the web, Settings → Security and login → turn on
  Developer mode; then Plugins (once called Connectors, then Apps) → + → name "SJPJr", icon
  `assets/images/sj-512.png` (only when creating it), URL `https://mcp.stevenpisani.com`
  (until that's set up, `https://dkaiavlnmtetqigxnkwb.supabase.co/functions/v1/mcp`),
  authentication OAuth → sign in → Allow. ChatGPT asks before each write; that approval lasts the
  conversation if you tell it to.
- **Connecting Claude** (Steve, once, on claude.ai or the desktop app, then it's on mobile too):
  Settings → Connectors → Add custom connector → name "SJPJr", the same URL → Connect → sign in
  → Allow. Claude registers itself with Supabase Auth like ChatGPT does. Claude can't pass a photo
  from the chat to a tool, so adding garments from photos is ChatGPT's (or the app's) for now.
- **After the tools change**, the apps keep the old list until told: in ChatGPT, Settings → Plugins
  → Wardrobe → Refresh, then a new chat; in Claude, Settings → Connectors → Wardrobe → disconnect
  and connect again, then a new chat (Claude caches the list, so it can take a while).
- Both hosts read the tool descriptions and annotations: each tool has a title and read-only or
  write hints, and every write says plainly that it changes only Steve's private wardrobe and
  sends and deletes nothing (ChatGPT's safety checks have blocked writes to custom connectors).
  The protocol versions it speaks are `PROTOCOLS` in `server.js`.
- **Known risk:** since late September 2026 some people report ChatGPT's safety checks blocking
  write calls to custom connectors before they reach the server (reads work; OpenAI hasn't said
  why). If writes never arrive, that's it: the function's logs show nothing for them.
- To revoke ChatGPT's access: delete the plugin in ChatGPT, or remove its grant from your account
  (Supabase Auth's OAuth grants).
