# Roadmap

What's next, what's waiting on Steve, and what's parked. Keep it current: when something ships,
move it to "Done lately" (and trim that list to the last few); when an idea comes up, add it here
rather than leaving it in a chat.

## Next up (ready to build, nothing needed from Steve)

0. **SJPJr, the MCP server, grows by area** (`docs/apps.md`, "Adding an area"). First the
   wardrobe and trips working end to end in ChatGPT (the card, packing for the Europe trip), then,
   in order: recipes (read and write: find, add, mark cooked, rate, notes; a card with photos), then
   the site's content, read-only (favorite drinks, books, profile, career, posts, lab). Ideas
   welcome for anything else Steve logs.

0. **The wardrobe** (`docs/apps.md`): the closet, ChatGPT through an MCP server, trips, and
   then Today, pack mode, offline, the item view and the in-chat card (closet, garment, ingest
   preview, trip board): done. Next, in order:
   - outfit pictures: the board (the real photos laid out, made on the server for nothing,
     `get_outfit_images` `purpose: "board"`) is done. Next, styled or on-body pictures made on the
     server with Google's Gemini image model (it takes the photos as references; about $0.04 a
     picture, Oct 2026) under a $5 a month cap in code, and catalog images (today ChatGPT makes
     them and adds them with `origin: catalog`) in `CATALOG_STYLE` the same way; Steve is setting
     up the key, as a `GEMINI_API_KEY` repo secret;
   - in-chat for ChatGPT and Claude alike (research, Oct 2026: both render MCP Apps, SEP-1865,
     `ui://` resources): a text description of each photo at ingest (`get_photo` and `get_photos`, the images themselves, are done); an upload link that doesn't
     depend on ChatGPT's fileParams (the only way Claude can take a photo, and ChatGPT mobile's
     fallback); checking Supabase's OAuth server for `iss` in redirects (RFC 9207), refresh-token
     rotation, and tokens bound to this server;
   - the capsule card ("16 pieces, 64 outfits", counting only what goes together) and a laundry
     planner (when each leg runs out of clean clothes);
   - a gap finder per leg (a formal dinner in Paris and nothing smart packed);
   - a wore-it log with cost per wear (the planned outfit counts as worn unless changed), and
     packed versus worn on the packing list;
   - Dress Me (shuffle an outfit, pin the pieces you like), a warning when the same thing is in
     too many photos, and Trip Wrapped at the end (most worn, never worn, a picture per city).

0. **The private apps, by the vision** (`docs/vision.md`: keep the evidence, record what happens
   passively, tools not features, one inbox, trust on a dial, measure before switching). In order:
   - events, "wore it today" first (one tap on Today's outfit; then visits, cooking, buying), which
     also gives cost per wear and packed versus worn;
   - one inbox for raw evidence, and visibility (private, shared, public) on every record;
   - **places v1:** Google Maps saved lists and starred places from a Takeout file dropped into a
     private import screen; every place private until approved in review; home, work, lodging, any
     trip hotel and anything near home can never be public; coordinates from the Places API (New)
     on the server (inside its free monthly caps, with a quota set), once Steve has the key; in the
     wardrobe, "Saved nearby" on Today and each leg, and "Add to this day"; on the public site, a
     map of the lists Steve marks public. v2: Google's Data Portability API if it reaches US
     accounts;
   - a dozen real tasks with known answers, run against SJPJr whenever the model changes;
   - passive sources, one at a time into the inbox: the office camera (a morning frame matched to
     the catalog, the frame deleted after), emailed grocery receipts, a monthly card export;
   - polish still open: repack before each move, a journal line per day, smarter search, a phone
     test checklist, and the recipes kept on the phone for opening with no connection.

1. **Read bottles on the planet.** Approved bottles (`bottles.approved`) wash up at the waterline
   for the next visitor to open and read, with the same unrolling letter as writing one
   (`note.js`). Today an approved bottle shows up nowhere. Small; finishes the bottle feature.
2. **Screen bottles automatically.** The bartender's model (Haiku) pre-screens new bottles so Steve
   only checks the borderline ones; approving stays a member's call. Pair with 1 as one PR. Mind
   the budget (docs/backend.md): a cap in code, a few cents a month.
3. **The Data Something lab** ([#24](https://github.com/stevepisani/stevepisani.github.io/issues/24)):
   - a SQL console in the browser (DuckDB-WASM) over the site's own data: page views
     (`pageviews_daily`), drinks, books, launches;
   - charts (Observable Plot, or Mosaic for big queries);
   - search the writing by meaning (Transformers.js embeddings, in the browser);
   - the site as a dbt-style lineage graph (drinks.yml → chalkboard → robot → your glass), an
     easter egg for data people.
   The page counter has been collecting since 30 Sep 2026, so there's real traffic to query.
4. **Hitchhiker's touches** (optional): the robot saying "Welcome to Milliways", a towel behind
   the bar, a Pan Galactic Gargle Blaster on the chalkboard.

## Waiting on Steve

- **A Google Maps key for places:** a Google Cloud project with the Places API (New) on, a key
  restricted to it, a daily quota, saved as a GitHub repo secret (steps when we start places).
- **For passive capture:** the office camera's make and model, which stores' grocery receipts come
  by email, and which card or bank to export.

- **A photoreal capture:** a Gaussian-splat scan of a real Philly spot (the Rodin Museum gates?)
  with Polycam or Scaniverse, exported as `.ply` or `.spz`; it'd be seen through the telescope or a
  doorway (Spark or gsplat.js).
- **Archive `stevepisani/my_website`** (Settings → General → Archive); it only holds a README.
- **Revoke the temporary Supabase token** from 30 Sep, if it hasn't expired.

## Parked on purpose

- **Apple Photos:** an iOS Shortcut ("Send to Wardrobe") that uploads picked photos to the inbox
  with a personal key; parked by Steve, Oct 2026.
- [TabbyStack/panthera#32](https://github.com/TabbyStack/panthera/issues/32): a weekly, high-level,
  client-free "what I'm working on" that updates `focus:` in `_data/profile.yml` (and so /about,
  the bartender and the GitHub README). It lives in Panthera because that's where transcripts may be
  read; it opens a PR here and merges it once the site's checks pass.

## Done lately

- Oct 2026: SJPJr as one app, tailored to whoever's signed in: its own shell (no site nav or
  footer; the badge opens Settings: theme, °F or °C, who's signed in, Sign out, the site), Today
  always first with a greeting by name and the next thing first (the journey, the outfit, the
  weather where you are, at home too), Recipes as a tab (`/apps` and `/apps/recipes` lead in),
  tabs per member (Steve all four, Lexi Recipes; `members.name` and `sections`, read by `me()`),
  the last email remembered at sign-in, pull to refresh, controls that don't select as text, and
  sessions that last months, as code.
- Oct 2026: show first, the text supports: the chalkboard (lean in, pick a drink, watch it made),
  the hammock (the stars first, a book easy to pick) and the telescope (look through it: the real
  moon this hour with its landing sites, today's sun, the ringed planet; it swings round to them).
  Then a pass on Krug and the HIG: glints on things you can use, Back steps out of every place,
  landing sites in the dark shown at full moon, swipes and ← → on every card, "Live · NASA", the
  bartender pointing at the telescope, chalk and page sounds, and a buzz on Android.
  Telescope ideas still open: focus it yourself (a brass knob), the ISS when it's over
  Philadelphia, and a postcard of what you saw.
- Oct 2026: the wardrobe as an app: installs full screen on an iPhone, signs in by the emailed
  code there, journeys as boarding cards (countdown, copy the reference, Add to Google Calendar), stays
  with a map, and a home-and-away line (local and home time, the exchange rate).
- Oct 2026: weather done properly (real conditions, Today's sky and hourly strip, Apple-style day
  lists, °F or °C), photos from small WebP copies, and the redesign on Apple's HIG and Krug.

- Oct 2026: images that reach ChatGPT: vision-sized copies so six fit in one answer, `get_outfit_images`
  (each garment's current photo, named by slot), and `test_image(s)` to check what arrives.
- Oct 2026: `get_photo` and `get_photos`: the model sees a garment's stored photo itself, not its
  description; `get_item` can add the photo shown.
- Oct 2026: trips in detail, for the five-week Europe trip: travelers, a packing list for everyone
  (by traveler, category, bag and status, each entry its own row), bags, transport, lodging,
  links, each day's activities, `get_trip` whole and `analyze_trip_packing` (facts by fixed
  rules); the app's Packing Board. Next there: laundry per leg or stay (today it's one for the
  trip, and the app doesn't show it yet), and links and laundry in the card.
- Oct 2026: a 30-day trash for garments, photos and trips, from a chat or the app (SJPJr can
  delete, list the trash and restore); a weekly job empties it. A trash view in the app is next.
- Oct 2026: the wardrobe (/apps/wardrobe): the closet with cut-out photos, ChatGPT through an MCP
  server (OAuth on the site's sign-in), trips with weather, outfits and packing; then Today, pack
  mode with Undo, opening with no connection, and an item view that shows what it is first.
- Oct 2026: the private apps at /apps: one sign-in, the site's look and themes, a shared kit; the
  recipe tracker rebuilt on it (it was a standalone page), with a browser test.

- Oct 2026: the Audible library, synced daily: /bookshelf by year finished, with samples; the
  listening sky over the hammock (finished books as stars, series as constellations, what's playing
  now as comets); the bartender knows what Steve's listening to. Then one library: paper and Audible
  merged with no telling them apart (`tools/library.mjs`), seven shelves the same on /bookshelf, in the
  sky and for the bartender; tap a shelf of stars to lean in and step through its books.
- Oct 2026: one esbuild bundle for the scripts, deploys through GitHub Actions, a smoke test in CI;
  Rapier physics (coconuts and glass floats you can kick, carry, throw and float); flagstones that
  never overlap; a walk-to ring that lies on the ground, clear of things.
- Sep 2026: fireflies (other visitors, live), the page counter, messages in bottles thrown into
  space; the AI bartender; Supabase as code; the profile README fed from the site; skipping
  stones, sound, the real moon and the ISS.
