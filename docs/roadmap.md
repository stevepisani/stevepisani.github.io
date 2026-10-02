# Roadmap

What's next, what's waiting on Steve, and what's parked. Keep it current: when something ships,
move it to "Done lately" (and trim that list to the last few); when an idea comes up, add it here
rather than leaving it in a chat.

## Next up (ready to build, nothing needed from Steve)

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

- **The Audible secret:** run `audible quickstart` once and add the file as the `AUDIBLE_AUTH` repo
  secret (docs/backend.md, "Audible"), then run the Audible workflow. Until then the bookshelf shows
  only the old shelf and the sky over the hammock has no book stars.
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

- Oct 2026: the Audible library, synced daily: /bookshelf by year finished, with samples; the
  listening sky over the hammock (finished books as stars, series as constellations, what's playing
  now as comets); the bartender knows what Steve's listening to.
- Oct 2026: one esbuild bundle for the scripts, deploys through GitHub Actions, a smoke test in CI;
  Rapier physics (coconuts and glass floats you can kick, carry, throw and float); flagstones that
  never overlap; a walk-to ring that lies on the ground, clear of things.
- Sep 2026: fireflies (other visitors, live), the page counter, messages in bottles thrown into
  space; the AI bartender; Supabase as code; the profile README fed from the site; skipping
  stones, sound, the real moon and the ISS.
