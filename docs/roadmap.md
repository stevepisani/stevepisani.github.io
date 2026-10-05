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
   - catalog images made on the server (today ChatGPT makes them and adds them with
     `origin: catalog`), in `CATALOG_STYLE`, from the references and Steve's photos; outfit pictures
     (flat, or on Steve) the same way; made on the server with
     OpenAI's image API under a $10 a month cap, and a widget that shows them; needs an
     `OPENAI_API_KEY` repo secret from Steve;
   - in-chat for ChatGPT and Claude alike (research, Oct 2026: both render MCP Apps, SEP-1865,
     `ui://` resources): a text description of each photo at ingest plus a read-only `view_photo`
     returning a small image (Claude sees it; ChatGPT gets the text); an upload link that doesn't
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

0. **Sign in to the apps with a code.** The emailed link opens in the phone's browser, so an app
   saved to the home screen (which keeps its own storage on iOS) never gets signed in. Put the
   six-digit code in the email (`mailer_templates_magic_link_content` in `supabase/auth.json`) and
   a field for it on the gate (`verifyOtp` in `kit.js`); then add a web app manifest so /apps
   installs properly.

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

- **A photoreal capture:** a Gaussian-splat scan of a real Philly spot (the Rodin Museum gates?)
  with Polycam or Scaniverse, exported as `.ply` or `.spz`; it'd be seen through the telescope or a
  doorway (Spark or gsplat.js).
- **Archive `stevepisani/my_website`** (Settings → General → Archive); it only holds a README.
- **Revoke the temporary Supabase token** from 30 Sep, if it hasn't expired.

## Parked on purpose

- [TabbyStack/panthera#32](https://github.com/TabbyStack/panthera/issues/32): a weekly, high-level,
  client-free "what I'm working on" that updates `focus:` in `_data/profile.yml` (and so /about,
  the bartender and the GitHub README). It lives in Panthera because that's where transcripts may be
  read; it opens a PR here and merges it once the site's checks pass.

## Done lately

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
