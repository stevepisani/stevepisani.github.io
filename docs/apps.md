# The private apps (`/apps`)

Small tools for life at home, on the site but only for members: Steve and Lexi today. The recipe
tracker was the first; the wardrobe is the second. They share one sign-in, one look and
one small kit, so a new app is a table, a page and a script, and nothing else.

## How it fits together

| Piece | What it does |
|---|---|
| `_data/apps.yml` | the list on `/apps` (`apps/index.html`): title, url, emoji, blurb |
| `_layouts/app.html` | the shell: the site's nav and themes, the heading, the sign-in form, and the page's content hidden until a member is signed in. It loads `apps.css` (through `head.html`, with `viewport-fit=cover` so a phone's safe areas are the app's to keep clear) and the script named by `app:`. An app may set the heading (`#app-title`) to say where you are and show `#app-back`, the way back up |
| `assets/css/apps.css` | the parts apps are made of, all on the site's tokens: fields, the top block (`.app-hero`), toolbar (`.app-bar`), segmented filter (`.seg`), cards (`.items`, `.item`), pill, rating, sheets (`.app-dialog` with its `.dialog-bar`), toast; then the wardrobe's own parts |
| `assets/js/apps/lib/kit.js` | `db` (the Supabase client), `start(open, close, { offline })` (the gate; with `offline: true` it opens with no connection for whoever was last signed in on that browser, `user.offline` set), `rows(table)` (list, add, set, remove, with failures shown), `saver(field, save)` (save as you type, and when the page is hidden), `fresh(again)` (reload after a minute away, so a stale tab doesn't save over the other person's edits), `sheet(dialog, dismiss)` (a dialog that behaves as a sheet: Esc, a tap outside it, a swipe down on a phone and its `[data-close]` buttons all go through `dismiss`), `ask(dialog, { dirty })` (a form in a sheet; Cancel is `type="button" data-close`, so Enter submits; Cancel, Esc or a swipe asks before throwing away anything typed), `photos` (put, urls, remove), `toast(text, bad, undo)` (with `undo`, an Undo button that runs it), `celebrate(from)` (a burst of confetti in the theme's colours), `buzz()` (a tap felt in the hand, where the phone can), `calm` (reduced motion asked for) |
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
- **Photo sizes** (`assets/js/apps/lib/photo-sizes.js`): the stored file is often far too big to
  show (a catalog image is a 1254 px PNG of 2 to 2.6 MB; 47 tiles were about 100 MB, slow on a
  phone and a fiftieth of the free plan's 5 GB a month of downloads each time the closet opened).
  So every wardrobe photo has two WebP copies beside it, transparency kept: `<path>.w512` (about
  25 to 70 KB) for tiles, flat-lays and thumbnails, and `<path>.w1080` (about 100 to 250 KB) for
  the photo in a garment's sheet, both sharp on a 3x screen. `photos.urls(paths, px)` signs each
  path with its copy in one request and gives the copy's link, or the file's until the copy is
  made. The sheet shows the small copy at once and swaps in the large one when it's loaded.
  Copies come from three places: the app makes them when it uploads (`photos.put(…, { copies:
  true })`; WebP where the browser writes it, else JPEG, and not at all for a cut-out in a browser
  without WebP), `tools/photo-copies.mjs` makes any missing every hour (photos added through
  ChatGPT, older ones), and the trash and `photos.remove` delete them with the photo. Resizing on
  the fly (Supabase image transformations) needs the Pro plan, $25 a month, so it's not used.
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

And from the Oct 2026 redesign (Apple's HIG and Krug, for one user on an iPhone first):
- Every dialog is a sheet: a bar on top with the way out on the left (Cancel, or nothing when
  everything already saved), what it is in the middle, the main button on the right. On a phone it
  rises from the bottom with a grabber, and a swipe down, Esc or a tap outside puts it away; none
  of those throws away typing without asking.
- The content is the clothes: photos sit on the studio (`--studio`, the pale grey the catalog
  photos are shot on, the same in every theme and dimmed at night), so a photo and its tile are one
  surface. A garment with no photo shows a line drawing of its kind, not a letter.
- On a phone the site's bar scrolls away on app pages, tabs sit at the bottom in thumb reach (icons
  and labels, for sections, never actions), and the title settles into a bar at the top as you
  scroll. Wider, the tabs sit beside the title.
- Motion says where things went (deeper slides in from the right, an item grows out of the photo
  tapped); with reduced motion it doesn't move. Loading shows the shape of what's coming, not a
  spinner.

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
  every photo with its role (garment, tag, care_label, detail, other) and where it came from
  (`origin`): `own` (Steve's photo of his piece, evidence of what he has), `reference` (a shop's
  or maker's picture, with `source_url`: something to make a catalog image from) or `catalog` (the
  wardrobe's own image, with `made_from`: the photos it was made from). Catalog images are what
  make the closet read as one set across brands: one style for all of them (`CATALOG_STYLE` in
  `areas/wardrobe.js`: the garment alone, front on, flat or on an invisible mannequin, centred, on
  plain light grey #F2F2F2, even light, true colour, no model, props or added text). The item's
  `photo_path` is the one shown, and one rule picks it: the photo asked for, else the best garment
  photo there is, catalog before Steve's own before a reference (a reference is only a stand-in),
  keeping the one shown unless something outranks it. A new catalog image is shown at once. Every
  photo is kept. `wardrobe_closet` is the flat view (the item's own value, else the variant's,
  else the product's) that the app and `find_items` read. The first three items (one Uniqlo shirt
  in three colours, added before this) were regrouped by
  `20261005000200_wardrobe_uniqlo.sql`: one product, three variants, the same three ids, the old
  values kept in `sources.migrated_from`.
- **Where you are is in the address** (`#today`, `#closet`, `#trips`, `#trip/<id>`,
  `#trip/<id>/pack`, `#item/<id>` over whatever's underneath), so Back works everywhere and any
  view can be linked. With a trip on, or starting within two weeks, it opens on Today; otherwise
  on the tab last used. The heading says where you are (Closet, Trips, the trip's name,
  Packing), with the way back up above it ("‹ Trips"); on a phone both settle into a bar at the
  top as you scroll, and the tabs (Today, Closet, Trips, with icons) sit at the bottom. Each view
  keeps its scroll, so coming back lands where you were; the tab you're on, tapped again, goes to
  the top. Going in to a trip or its packing slides in from the right; an item grows out of the
  photo tapped (View Transitions, where the browser has them; reduced motion, none).
- **The closet:** search and Add, category chips (All, then each category with something in it,
  with counts), a dot for each colour there is (from the colour's words: "Dark Brown" is brown;
  `CLOTH` in `wardrobe.js` has the words and the cloth colours, the same in every theme), and More
  filters (season, dressiness, "In the closet / Retired"; folded away on a phone unless one's
  set). A grid of square tiles: the photo on the studio ground, the name, brand and size; with no
  photo, a line drawing of its kind. While it loads, grey tiles in its shape. Nothing matching
  says so, with "Show everything". Remembered on that phone (`localStorage` `wardrobe-view`).
- **An item** (tap a tile, or an item anywhere), in a sheet with Edit on the left and Done on the
  right: what it is first: the photo, category, name,
  brand, colour (as printed, if known), material and size, fit, style number, condition, the
  kind, seasons, warmth and dressiness (and where else it works), price and when it was bought,
  notes, then every photo with its role, one marked shown (tap one to say what it is, show it, or
  remove it), "Buy another" (the replacement link) and "Find another" (a Google Shopping search
  for brand, name and colour). "Edit" shows the fields; text saves as it's typed, the rest at
  once, and the bar says so ("Saving…", "Saved"); Done goes back to what it is. Closing it any
  way (Done, Esc, a tap outside, a swipe down) saves what's being typed. Edits are for this piece only (on a piece with a product, it says so); changing the
  maker's facts for every colour and size is ChatGPT's (`update_item`, scope product or variant).
  "Add a photo" adds one (cut out), shown if there's no garment photo shown yet. Something just added opens on the fields. "Retire it" moves it out of the closet (kept,
  under Retired, with Undo); "Delete it" is for good, and only here, never from ChatGPT.
- **Adding:** a photo, or a store link (or both: the link is kept as where to buy another). The
  sheet asks for the photo first, as a big place to tap; the photo fills it, shimmering while it's
  cut out. Cancel with something entered asks first.
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
- **Trips** (the Trips tab; table `trips` and its parts, private like the clothes; "Trips in
  detail" below has the model): a trip is its legs (a place, looked up for its latitude and
  longitude, and dates), who's going, its days (activities, the wardrobe items worn, a summary, a
  note), and its own rows for packing, bags, transport, lodging and links. A trip shows each leg with its weather (day by day, "Weather" below), the planned days
  with their outfits, and how the packing's going. Trips are mostly made in ChatGPT; "New trip"
  and "Edit" here take a name, places and dates, and notes.
- **Today** (a tab only while a trip is on, or starts within two weeks; its heading is the trip's
  name): the trip's line, leg by leg, with the one you're on lit, a dot where you are in it and the
  days left there; then a morning card for the day: the place and its weather on a sky ("Weather" below), the
  advice in one box when the weather and the outfit disagree, and what you're wearing laid flat (below), the occasion, the plan and the
  note. "Day before" and "Tomorrow" step through the trip, and so does a swipe across the card.
  Below, the next five days (weather and the outfit small; tap one to see it on the card) and the
  packing, as a ring that fills. Before the trip, the card shows its
  first day. The advice (`advice()` in `wardrobe.js`) knows only what the items say and what the
  weather does: rain of 50% or more (saying from when, when the hours show it: "Rain likely from
  about 2 PM (70%)") asks for something whose name, material or notes say rain, waterproof, shell,
  Gore-Tex, trench, mac or umbrella, and warns off suede; with nothing from outerwear or warm, an
  evening plan (from 5 PM) when it'll be under 12° then ("Dinner at Buca Mario at 20:00: about
  11°"), or else a night under 8°; a high of 26° or more with something warm.
- **An outfit laid flat** (`flatlay()` in `wardrobe.js`): its photos on one studio ground, like a
  lookbook page, top to toe (outerwear and tops, trousers, shoes, the rest): one alone, two
  staggered, three with the first big, four two and two, more three a row. Each piece opens the
  garment; the names are under it; a garment gone since is a dashed outline. Pure CSS from the
  photos the app already has (the MCP server's "board" image isn't used here).
- **The trip page** (its heading the trip's name) starts with the dates, who's going (a face and
  a name each) and Edit, then Packing as a card with a ring, the places with their weather, and
  the days, each a card with its weather, plan and outfit laid flat (today's outlined). Wider, the
  days are on the left and the rest beside them. It adds, when there are any: Who's going, Getting there (transport in date and
  time order, times as given, never converted: an arrival on another day says its date), Staying
  (lodging) and Links; each day shows its activities under its summary, in time order (Today's
  card too).
- **The Packing Board** (`#trip/<id>/pack`, headed Packing, "‹ <trip>" above): a suitcase that
  fills as things are packed, how many are and how long until you leave; the status as a row of
  chips with counts (To pack, the
  default: everything not packed; Need, To buy, Ready, Packed, All), how many are packed and how
  long until you leave, then whose (Everyone, each traveler, Shared: "shared" or nobody's), a
  category and a bag (the filters kept per trip in `wardrobe-pack`). Rows by category (Clothes,
  Shoes, Baby, Toiletries, Medicine, Electronics, Documents, Work, Accessories, Gear, Misc): a
  garment with its photo, brand and colour, the days it's planned and its bag; anything else with
  whose it is. One tap on the status moves it on (needed → ready → packed; to buy → ready), with
  Undo; the status reads as a word and a ring, not colour alone. A tap to Packed lands a tick (and, with To pack showing, the row folds away);
  a bag finished, or everything, gets a small burst of confetti and says so (reduced motion: no
  movement; a buzz where the phone can). Tapping the row opens it: status,
  whose, bag, how many, essential, notes, "Take it off the list" (the entry only, with Undo), and
  the garment. Each change is one PATCH of that entry's row, never the whole list. "Add from the
  planned outfits" adds the planned garments not on the list (Steve's, if the trip has a "steve");
  the add form takes a label, whose and a category.
- **With no connection** (a plane, a train abroad): every load keeps a copy on the phone
  (`localStorage` `wardrobe-copy:<user id>`: the rows, the trips' parts and the photo links; `wardrobe-wx`: the last
  weather for each leg, with today's and tomorrow's hours; the photos in the `wardrobe-photos` cache), and `apps/offline.js` keeps
  the page and its scripts. Offline, the app opens on that copy and a line under the tabs says how old it is and how many
  packing changes are waiting. Packing
  changes work and wait in `wardrobe-packing-queue`, by entry (the patches merged); they're sent,
  one PATCH an entry, when the connection's back, before anything is loaded, and a toast says how
  many went. Adding, taking off
  and editing a trip wait for a connection, and say so.
- **Weather** comes from Open-Meteo (free, no key; `supabase/functions/_shared/weather.js`, which
  the MCP server runs and the app bundles): the forecast for the days it reaches (15), then for
  the rest the same dates over the last three years, the temperatures averaged and the chance of
  rain being how many of those years it rained. Leg summaries count the expected days of rain.
  A forecast day also has its WMO weather code (`conditionOf()` says it in words: "Light rain"),
  feels-like, rain in mm, sunrise and sunset (local times there), UV and wind; a typical day has
  only what was usual, never a condition. The app asks `legWeather(leg, today, { hourly: true })`
  and gets each hour of today and tomorrow too, in the same one request a leg; the MCP server
  never asks, so its answers stay as short as they were. The app draws it all with
  `assets/js/apps/lib/sky.js`, on Apple Weather's patterns:
  - **The sky drawings**: one per kind of sky in the page's sprite (`#i-sun`, `#i-moon`,
    `#i-sun-cloud-s` mostly clear, `#i-sun-cloud` partly cloudy and their moon versions at night,
    `#i-cloud`, `#i-fog`, `#i-drizzle`, `#i-rain`, `#i-heavy-rain`, `#i-showers`, `#i-snow`,
    `#i-sleet`, `#i-thunder`; `#i-typical`, a thermometer, for a typical day; `#i-sunrise`,
    `#i-sunset`, `#i-wind`), in the line style, the sun, moon, rain and snow in their own colours
    (`--sun`, `--moon`, `--wet`, `--snow` on `.app`, per theme; all green in terminal).
  - **Today's sky** (`.sky-panel`, the top of the card): the place, the temperature now there
    (the hour at the place's own clock) with its sky in words, high and low, feels-like when it's
    3° or more off; one or two sentences on the day ("Rain from about 2 PM, heaviest at 4 PM. Cool
    evening, down to 48°."; late in the day, the night ahead); UV when 6 or more and wind from 30
    km/h, only then; and the next 24 hours as a strip that scrolls sideways (Now, each hour's sky,
    its chance of rain from 20%, its temperature on a line coloured by temperature, the sunrise
    and sunset in their places). Its background is the sky there: clear, partly cloudy, cloudy,
    fog, rain, snow or storm, by day, at golden hour or by night, each a gradient dark enough for
    white text (4.5:1 at its lightest), with clouds drifting, rain or snow falling or stars
    twinkling, faintly, only without reduced motion. A typical day, or none, gets the page's own
    colours and "Typical, not a forecast". Another day shows its high, its sky and its sentence.
  - **Day by day** (each leg on the trip page): weekday, sky, chance of rain from 20%, low, a bar
    from low to high on the whole trip's one scale, filled by temperature (`HEAT` in `sky.js`:
    deep blue below 0°, light blue to 15°, green to 20°, yellow to 25°, orange to 30°, red above;
    data colours, like the clothes', the same in every theme but terminal), high. Today has a dot
    where it is now; typical days come after a line saying what they are, faint and dashed. A leg
    shows ten days and "All 31 days". Each row is one sentence for VoiceOver. The day cards and
    "Next few days" use the same drawings: sky, high / low, rain from 20%.
  - **°F or °C**: an American browser (en-US) gets °F, the rest °C; a tap on any temperature
    switches every one, and it's kept (`localStorage` `wardrobe-units`). Everything is stored in
    °C and turned into °F only when shown; wind follows (mph or km/h). The MCP server stays °C.
  - **Offline**, the last weather each leg had (`wardrobe-wx`) includes its hours, so the sky,
    the sentence and the strip are still there.

## ChatGPT and Claude: SJPJr, the MCP server

SJPJr (after the site's badge) is Steve's own things on this site, for ChatGPT and Claude: today
his wardrobe and trips, more later. `supabase/functions/mcp`, at
`https://<ref>.supabase.co/functions/v1/mcp`: MCP over Streamable HTTP, stateless (each POST gets
one JSON answer; no sessions, no stream). In plain JavaScript, so `tools/wardrobe-test.mjs` runs
it in Node against the real schema (below):

- `server.js`: the protocol, who the server is, the card's resource, and the rules;
- `areas/`: one file per area (`wardrobe.js`; `trips.js`, `packing.js` and `trip-parts.js`,
  sharing `trip-kit.js`; `trash.js`), each `{ name, records, tools, status, instructions, call }`:
  its tools, the status lines ChatGPT shows while each runs, what the model is told about it, and
  the code;
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
2. Deleting a garment, photo or trip moves it to the trash, from a chat as from the app: hidden
   everywhere, restorable for 30 days, then gone for good (below). `TRASH` in `server.js` lists
   the only tools that do (`delete_item`, `delete_photo`, `delete_trip`). A trip's own entries (a
   packing entry, bag, journey, stay or link) are removed outright, one at a time, by the tools in
   `REMOVES`, and never what they point at (a garment, the entries in a bag). The server won't
   load any other tool that deletes or removes.
3. Everything runs as the signed-in member, through row-level security, and stays on
   stevenpisani.com.

### The trash

A garment, photo or trip deleted, from a chat or the app, isn't gone at once: its `deleted_at` is
set (`supabase/migrations/20261005000400_trash.sql`), and everything that lists them leaves it out
(the `wardrobe_closet` view, and each query on photos and trips). `list_trash` shows what's there
with the day each goes for good, and `restore` brings any of it back as it was (a photo is shown
again if it's the best one). A garment's photos stay with it, and a trip that planned it shows it
as no longer in the wardrobe until it's restored.

After 30 days (`TRASH_DAYS` in `kit.js`) the weekly Supabase job runs `tools/empty-trash.mjs`:
`public.empty_trash()` deletes the rows for good and names the photo files nothing uses any more,
and the script removes those from Storage. Only that job can run it (no member, even if granted).
The app has no trash view yet: restoring is from a chat.

### Trips in detail

Made for a five-week trip with a toddler (`supabase/migrations/20261005000500_trip_details.sql`).
SJPJr keeps the facts, checks them and works out what follows from them by fixed rules; the model
suggests (outfits, what to bring) from those and the weather. Nothing here is booked, looked up or
sent.

- **On the trip row:** `legs` (as before: places and dates, for the weather); `travelers`
  (`[{ id, key, name, type }]`, type adult, child, infant or other; the key, "steve", is what
  packing and bags point at, and "shared" means everyone); `laundry` (`{ available,
  frequency_days, notes }`); `days`, each `{ date, occasion, activities, items, note }`, where
  `activities` are the structured plan (`{ id, title, type, start_time, end_time, location,
  notes }`, several a day) and `occasion` stays the one-line summary.
- **Rows of their own**, each with a stable id, private to the owner (row-level security checks
  the trip is theirs), going to the trash and back with the trip: `trip_packing` (a wardrobe
  `item_id`, never copied, or a `label`; `traveler_key`, `category`, `qty`, `status` needed,
  to_buy, ready or packed, `bag_id`, `essential`, `notes`), `trip_bags` (a `key` unique on the
  trip, label, type, whose), `trip_transport` (type, date, from and to with optional codes,
  departure and arrival times as given: ISO 8601 with the place's UTC offset when known, local
  time without one, never a time zone made up; carrier, number, confirmation, booking link),
  `trip_lodging` (name, place, address, check-in and check-out) and `trip_resources` (links:
  insurance, tickets, bookings). A packing entry's bag is a bag of the same trip (a foreign key on
  both); removing a bag leaves its entries, out of any bag. A packing entry's garment has no
  foreign key, on purpose: a garment deleted later stays named on the trip, marked gone.
- **Kinds** (categories, bag and transport types, activities, link types) are lists in
  `trip-kit.js`, checked by the server, not the database: a new one is a word added there.
- **The packing kept on the trip until now** became entries in the migration, in order: a ticked
  one packed, the rest needed; a garment clothing, shoes or accessories by its category, anything
  else misc; nobody's and in no bag.
- **Tools:** `create_trip` and `update_trip` own the trip's own fields (name, notes, legs,
  travelers, laundry); `plan_days` sets days whole; packing has `add_packing_items` (appends; the
  same thing for the same traveler is updated, not added twice), `update_packing_item`,
  `set_packing_status` and `move_packing_items` (several at once), `remove_packing_item`, and
  `set_packing` (replaces the whole list, for imports; older calls with only item_id or label and
  qty still work, and what's matched keeps its id and status). Bags, transport, lodging and links
  each have `add_` (several at once), `update_` (only what's given) and `remove_` tools
  (`trip-parts.js` makes them alike).
- **`get_trip`** is the whole trip in one call: the trip, travelers, legs with the weather,
  lodging and transport in the order they happen, links, bags with how many entries each, days
  with place, weather, activities, outfit and whether it's a travel day, and the packing with a
  count. Garments come once, in `garments`, marked `retired` or `missing` when they've gone since.
- **`analyze_trip_packing`** is separate, so `get_trip` stays predictable: counts by status,
  traveler, category and bag; the wardrobe (planned and listed, planned but not packed, listed
  but never planned, planned on several days); the days (with no plan, with activities but no
  outfit, travel and work days, nights with no lodging); and warnings, each a code and a sentence:
  a planned garment not on the list, an essential not packed, a garment retired or deleted since,
  an entry or bag for someone not on the trip, transport outside the trip (a flight the day
  before the first leg is inside it), lodging outside the trip or overlapping. No advice: "bring a
  rain jacket" is the model's to say.
- **Tests:** `tools/trips-test.mjs` (in `npm test` and CI) runs the real trip end to end (London
  then Florence, Steve, Lexi and Dominic, BA184 and BA3279, St James House, eight bags), every
  tool, older calls unchanged, references (a bag of another trip, someone else's trip), removing
  and deleting.

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
  `get_photo` and `get_photos` (the photos themselves, below), `read_store_link`, `list_trips`, `get_trip`; and `ingest_item` (below), `add_item` (a quick item
  with no product), `add_photo` (with a role), `set_photo_role` (what a photo is, or which is
  shown), `update_item` (with a scope, below), `retire_item` (or back), `create_trip`,
  `update_trip`, `plan_days`, `analyze_trip_packing` (read-only), the packing and trip-part tools
  ("Trips in detail" above); `delete_item`,
  `delete_photo` and `delete_trip` (each to the trash), `list_trash` (read-only) and `restore`. The tool descriptions are written for the AI calling them: which to start
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
  (`garment_photo`, `tag_photo`, `care_label_photo`, `detail_photos` as Steve's own;
  `catalog_photo`, the wardrobe's own image, shown when it's there, else the garment photo),
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
  - `trip` (`get_trip`): the legs and who's going, the next day (its outfit as photos, or its
    activities), packing so far; "Open trip" and "Packing list" go full screen, with Days (each
    day's activities and outfit as photos; names on tap) and Packing (Everyone, each traveler or
    Shared; ticked with `set_packing_status`, unticking goes back to where it was; twins by
    colour, bag and status, how often each is worn).

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
  `assets/images/sj-512.png`, `-256` (7 KB, for apps that want a small icon), `-180`, `-64`).
  Neither app reads the
  logo from the server yet (Oct 2026): ChatGPT shows the icon uploaded when the connector is
  created (and can't change it after), Claude a globe for every custom connector. Each tool also
  has the status lines ChatGPT shows while it runs (`STATUS`), and the card's resource tells
  ChatGPT's model what the card already shows (`openai/widgetDescription`), so the answer doesn't
  repeat it.
- **Photos by id:** what the model reads names photos by their own id: an item's
  `hero_photo_id` (the one shown) is the photo `get_item` lists with `hero: true`, the same in
  `find_items`, `get_item`, `get_trip` and every write's answer. Their signed links (long, and
  different on every call) go only in the result's `_meta.photos`, by photo id, which hosts give
  the card and not the model (`kit.js`, `sign`); the card puts them in place. `add_photo` takes an
  upload (`photo`) or a link (`url`: a picture, or a product page whose main picture is taken; the
  page is noted on the product, or the garment, where nothing's noted yet), with its `role`,
  `origin` and, for a catalog image, `made_from` and `shows` (the subcategory and colour it shows:
  one of another kind than the garment is refused before anything is kept, a different colour is
  said); `set_photo_role` corrects either; `delete_photo` moves any photo to the trash, a wrong catalog
  image included (the card has a two-tap Delete on every photo; the next best is shown).
- **Seeing a photo:** the model reads ids and facts, never pixels, unless it asks. These return
  each photo as MCP image content (`type: "image"`, plain base64, its MIME type read from the
  file's first bytes), numbered in the order asked, with its facts beside it (photo_id, item_id,
  role, origin, hero, made_from, purpose), never described or redrawn on the server:
  - `get_photo` (one; `purpose` original, the default: the stored file unchanged);
  - `get_photos` (up to six; `purpose` vision by default);
  - `get_outfit_images` (up to six garments, each with a slot: the server looks up each one's
    current hero photo, and each image comes back named by its slot as `reference_key`, with
    item_id, photo_id and hero; one short line an image, nothing to read in its place). The way
    to look at an outfit, and the images to picture it from;
  - `get_item` with `include_images: true` (the photo shown, as stored).
  What can't be sent (no photo, not found, too big) is listed with why; the rest still come.
- **The outfit as one picture:** `get_outfit_images` with `purpose: "board"` sends one JPEG, made
  on the server (`board` in `images.js`): each garment's photo (its vision copy), resized and
  placed, never redrawn, so it costs nothing and can't get a garment wrong. 1200 px wide, a grid
  read left to right, top to bottom, in the order asked: one garment fills it, up to four sit two
  a row, five or six three a row, and a short last row is centred. It sits on the photos' own
  background (the median of their corners, so the catalog images' pale grey runs edge to edge;
  white when the corners disagree or are see-through). Beside it, each garment's `position` and
  where it landed (`x`, `y`, `width`, `height`); a garment with no photo, not found, or a file
  that can't be read is left off and said, and with nothing to lay out it's refused. About 0.5 s
  for four (the vision copies are usually made already). It needs ImageScript on the server; if
  that won't load, it says to use `vision` instead.
- **For an image generator:** `get_outfit_images` with `purpose: "generation"` sends no images.
  For each garment, in the order and slots asked, it gives the same photo `vision` showed as a
  link to the stored file, unchanged and full size, on SJPJr's own address
  (`https://mcp.stevenpisani.com/photo/<token>`), with its `mime_type`, `width` and `height` (read
  from the file's header) and `expires_at`. The token is the photo's id and an expiry 15 minutes
  on (`LINK_MINUTES`), signed with HMAC-SHA256 under the server's service key, so it can't be
  guessed or altered and names no file. The server answers a link (`servePhoto` in `images.js`,
  wired in `index.ts` before any sign-in, since a link carries none) with the file as its type,
  `private, max-age` only while it lasts, and 404 for anything altered, expired or deleted since.
  So: look with `vision`, then hand the generator exactly those photos with `generation`.
- **Sizes, and why** (`images.js`): ChatGPT carries an answer over gRPC, which fails past about
  4 MB: one 2.6 MB catalog PNG (3.5 MB as base64) got through, two failed. So an answer's images
  share a budget of 3.8 M base64 characters, and `purpose` picks the size: `original` (the stored
  file), `vision` (a JPEG on white up to 1024 px, stepping down in quality, then to 768 px, until
  it's under 400 KB, so six always fit) or `thumbnail` (256 px, under 60 KB). The copies are made
  once, with ImageScript (in Node, the npm build pinned in `package.json`; on the server, its
  Deno build, 1.3.0 from deno.land in `index.ts`, since the npm one loads native code the edge
  runtime refuses: "unsupported arch/platform"; the two make the same bytes), and kept beside the file in Storage
  (`<path>.vision.jpg`, `.thumbnail.jpg`, beside the app's own `.w512` and `.w1080`, "Photo
  sizes"); the stored file is never changed, and emptying the
  trash takes the copies too. The Supabase workflow makes them after each deploy and hourly
  (`tools/photo-copies.mjs`), so the server rarely has to (a function gets about 2 s of CPU); if
  it can't load ImageScript, it sends the stored file instead.
- **Checking delivery:** `test_image` (one 103-byte PNG, red left, blue right) and `test_images`
  (`count` 1 to 6, `size` small 64 px or vision 768 px: red, blue, green, yellow, a checkerboard,
  a white circle on black, in that order, PNGs written in `images.js` with nothing else
  involved) are for asking a host what it actually received; the answer key is in
  structuredContent, not the text. Claude sees tool images; ChatGPT does, one at a time and in
  small sets (Oct 2026). Every answer with images is logged (the tool, its content types, each
  image's type and size, and each photo's file, size and purpose; never the image), read with the
  Supabase workflow's "logs".
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
- **Its own address:** `https://mcp.stevenpisani.com` (live since Oct 2026).
  `proxy/_worker.js` is a
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
  `assets/images/sj-256.png` (ChatGPT takes 10 KB at most; only when creating it), URL
  `https://mcp.stevenpisani.com`
  (`https://dkaiavlnmtetqigxnkwb.supabase.co/functions/v1/mcp` works too),
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
