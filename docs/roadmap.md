# Roadmap

What's next, what's waiting on Steve, and what's parked. Keep it current: when something ships,
move it to "Done lately" (and trim that list to the last few); when an idea comes up, add it here
rather than leaving it in a chat.

## Next up (ready to build, nothing needed from Steve)

0. **The inbox, next** (`docs/vision.md`, rule 4): one place for everything not yet filed, kept
   raw (photos, links, screenshots, receipts, files), each with where it came from; processed now,
   overnight in a batch, or later by a better model, and turned into records and events (the days'
   record is in: `events`, `docs/apps.md`, "Days"), with Steve reviewing what the model isn't sure
   of. Places' Takeout file is the first thing it takes, so it comes before them.

0. **Places, from Google Maps, after the inbox: the next shared piece, for SJPJr and the planet alike.** Steve's
   Google Maps saved lists and starred places, from a Takeout file dropped into a private import
   screen; every place private until approved in review; home, work, lodging, any trip hotel and
   anything near home can never be public; coordinates from the Places API (New) on the server
   (inside its free monthly caps, with a quota set). In SJPJr: "Saved nearby" on Today and each
   leg of a trip, and "Add to this day". On the site: the lists Steve marks public, on a map and
   on the planet: on Earth, in the sky (`sky.js` `earthPoint(lat, lon)` puts a place on the globe; how they look there is to be designed). v2: Google's Data Portability API if
   it reaches US accounts. Starts once the key is in (Waiting on Steve).

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
   - Dress Me (shuffle an outfit, pin the pieces you like), a warning when the same thing is in
     too many photos, and Trip Wrapped at the end (most worn, never worn, a picture per city).

0. **The private apps, by the vision** (`docs/vision.md`: keep the evidence, record what happens
   passively, tools not features, one inbox, trust on a dial, measure before switching). In order:
   - more kinds of event: visits, cooking, buying (the table takes them as they are; "wore" and
     "journal" are in);
   - one inbox for raw evidence (first in this list, above), and visibility (private, shared,
     public) on every record;
   - places (first in this list, above);
   - a dozen real tasks with known answers, run against SJPJr whenever the model changes;
   - passive sources, one at a time into the inbox: the office camera (a morning frame matched to
     the catalog, the frame deleted after), emailed grocery receipts, a monthly card export;
   - polish still open: repack before each move, smarter search, a phone test checklist, the
     recipes kept on the phone for opening with no connection, and a "today" view in SJPJr's card.

## Waiting on Steve

- **A Google Maps key for places (next up):** a Google Cloud project with the Places API (New)
  on, a key restricted to it, a daily quota, saved as a GitHub repo secret (the exact steps when
  we start).
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

- Oct 2026: a record of each day (vision rule 2): one `events` table, only added to, each row with
  how it was known; on Today, "Wore it" logs the planned outfit in one tap (Undo, Change, or pick
  the pieces at home) and a line about the day saves as you leave it, offline too; each past day
  of a trip says what was worn and its line, the packing how many days each garment's been worn
  ("Not worn yet" where it hasn't), and a garment what it's cost a wear. In SJPJr, `get_today`
  (a day in one call, by the leg's own clock), `log_day` and `get_history`. A planned outfit
  counts only once it's logged.
- Oct 2026: the campfire trail crosses the cutaway on a bridge with a glass floor, and the planet
  is hollow below it (a glowing core, turning rings, a shell lit like a city); the telescope: stand
  behind it, bend to the eyepiece, dark, then the view; Earth in it with cities pinned and their
  time now, in place of a sentence.
- Oct 2026: Earth in the sky in place of the ringed planet, turned to the real hour (day where
  the sun's up, the cities lit at night), the way places will show on the planet; and a cutaway
  by the campfire trail: the planet is a machine, a catwalk out over its gears and glowing core.
- Oct 2026: the planet, tidied and quicker: one sun the moon and both planets go round, nothing
  floating (campfire props, the bar's torches), no text selection; the bartender face to face
  with no zoom on phones and a few things to ask; tap the bar from anywhere and you're walked
  round to it; a neon hoop that flickers into being on the second coconut, with fireworks. Then a
  speed pass: still meshes merged (less than half the draw calls), the models fetched alongside
  the script, and the physics engine started when the browser's idle. The planet's other open
  ideas (reading bottles, screening them, the Data Something lab, Hitchhiker's touches, more for
  the telescope) were dropped, Oct 2026.

- Oct 2026: SJPJr as one app at /apps, tailored to whoever's signed in: its own shell (no site nav or
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
