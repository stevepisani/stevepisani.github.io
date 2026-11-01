# Roadmap

What's next, what's waiting on Steve, and what's parked. Keep it current: when something ships,
move it to "Done lately" (and trim that list to the last few); when an idea comes up, add it here
rather than leaving it in a chat.

## Next up (ready to build, nothing needed from Steve)

0. **My Tiny Planet: planets for other people** ([Linear P-PRO-40](https://linear.app/tabby-stack/project/my-tiny-planet-1d0a488cfd88),
   [the plan](https://claude.ai/artifact/RF8tba5SpbNpawXT7b3ADk)). Anyone gets a little planet of
   their own, from what they love. The current draft also refines scene atmosphere with
   warm practical lights, a legible approach, irregular shores and shared water craft; visual
   acceptance stays on PRO-2293. Evaluate shared improvements on unrelated held-out interviews
   before further owner-example polishing; tropical dressing and atmosphere are conditional,
   and the current two-layout library does not prove general first-reveal quality. The draft now
   includes role/bounds/visibility-based openings, day/dusk/cloud treatments, optional details
   after usable-world responses, and a frozen four-interview development review through
   `planet-live --interviews`. A separate `planet-first-shot` runner now freezes the actual kit/instructions before intake, preserves raw initial outputs (including invalid ones), budgets two separate corrections, and uses the existing rendered preflight for actual arrival/action/edit evidence. Its synthetic same-session trials do not establish unseen input quality; an isolated designing host and independent interviews remain necessary. This is engine evidence, not held-out model quality or owner acceptance. The next craft pass
   adds recognizable stock fallbacks, explicit curved-ground support feet and ground surface
   treatments; the next draft adds a woodland painting/birdwatching kit, a required normalized CC0 birch, explicit rain, tropical depth layers and an offline rendered preflight. It captures real arrivals, actions, visible additions and fixed-camera asset comparisons; it is not a production visual-selection worker. Hero finishing, owner acceptance, physical-phone/embedded checks and independent fresh-input quality remain open. Steve, Oct 25 2026, after trying it in ChatGPT: every planet is
   unique to its person, and the only thing shared with his is the planet's size (no bar, sign,
   telescope, rocket or campfire); the first ten are built by hand, in a way that doesn't scale; a
   library of shared places comes only if it takes off. Done: the spec and its checks
   (`supabase/functions/_shared/planet.js`, `tools/planet-test.mjs`), Steve's planet read from one,
   the Planets connector at `mcp.stevenpisani.com/planets` with its card in the chat (walkable on
   a computer and in a phone's app), `/planets/` (how a friend adds it), and a friend's planet as
   its own small world (`assets/js/planets/`, `docs/planets.md`): bare until built, its own
   ground under the stars, with a launch screen you can already look round, and the intake
   (Steve chose it, Oct 25): `send_planet` saves a planet its person is happy with to a private,
   capped table, and an hourly issue tells Steve. Tested live end to end from a cloud session (Oct 26:
   `tools/planet-live.mjs`, three made-up planets previewed, walked and sent as tests). Their AI now builds it in the chat (Steve chose
   this Oct 26, aiming to wow): `look.ground`, `look.sky` and `things` made of simple shapes,
   each tied to what they love; tap one to walk up and see it. Better models (Steve, Oct 26:
   "a much better job with the modeling"; [the research](https://claude.ai/artifact/4yDa6BYwqp7gJv7dWRHGGH)):
   step 1, the look, is done (shadows, bloom, reflections, ambient occlusion on computers, ground
   patches); step 2, richer shapes, is in (lathe, extrude, tube, rounded boxes, repeat, mirror), and step 3: the kit's craft guide says how to model with them, and the live test's Inês and Dev are rebuilt with them as the worked examples; and step 4, look and fix: the preview notes what a careful eye
   would fix, and the card sends their AI pictures of the planet as drawn. Steve, after those: "still very very poor. let's try just using meshy". So a thing
   can now be described in words (`model`), and the Planet models workflow makes a real Meshy model from them that takes the shapes' place
   (`docs/planets.md`, "Real models"); Sam, Inês and Dev are the first (Steve approved up to $10 a planet for the first 10 friends, Oct 27). Every model is in one house style, storybook miniature (Steve chose it Oct 27 from samples), drawn as a picture first. A planet is a few real little places joined by paths: a thing can be set `near` another, placed by code ([the plan](https://claude.ai/artifact/ERoYTRvyBR11PCJagYQtRM)). Things you can use: a bench to sit on, a light to switch (`use`). Stock things, made once in the house style for every planet (a bench, a chair, a lamp post, a fence and five more; Steve approved about $6, Oct 27). Next from the plan: models made while the chat waits.
   The card now hears that its page is loading before the 3D bundle arrives, so a slow preview
   survives the 12-second blocked-frame check; a page that never draws falls back after 60 seconds.
   Semantic gathering/lookout scenes now compile into placed things and connected routes.
   `prepare_planet` separates schema and geometry checks from the user-visible preview, with a
   bounded correction pass and no claimed screenshot inspection or asset generation. The first
   reveal should immediately offer one specific personal addition. Visual quality on unseen
   input still needs the fresh-input benchmark and actual rendered acceptance.
   The next prototype follows [the art-direction brief](planet-art-direction.md): complete
   activity-based assemblies, shared tactile craft, visible companion/telescope responses,
   actual desktop/portrait evidence and a safe versioned reference cache. Accepted assets
   support first reveal; capped models can now arrive while the chat continues (PR #150), but
   delayed replacements cannot rescue an inadequate opening. Measured quality/latency remain open. Then: try it in Claude and ChatGPT
   and see what the models make; then each friend's planet finished by hand at `/p/<slug>/`
   (`docs/planets.md`, "Building a friend's planet"). Untested on a real phone and in ChatGPT's phone app.

0. **A place to step into on friends' planets, made by Marble?** The Art Museum door (Oct 27,
   `docs/world.md`, "A made place") was the test. What it showed: Marble makes a walkable splat
   world in about 5 minutes for $1.28 to $2.48 (8 MB at 500k splats), and it needs a picture: from
   words alone it invents the building. So for a friend it would be one place, from their own photo
   or the storybook picture we already make, behind a door on their planet. Not decided: Steve to
   walk the museum first. Genie 4 (Oct 27) can't do this: no public API, and it streams video
   rather than giving 3D we can keep.

0. **The inbox, more of it** (`docs/vision.md`, rule 4): the table is in (`public.inbox`, each
   file kept as it came under `photos/inbox/<owner>/`), and a Google Takeout is its first source.
   Next: photos, links, screenshots and receipts dropped in the same way, processed now, overnight
   in a batch, or later by a better model, into records and events, with Steve reviewing what the
   model isn't sure of.

0. **Places on the site, and on the planet.** The places are in SJPJr (`docs/apps.md`, "Places");
   what Steve marks "The site" is already readable by anyone through the `public_places` view
   (name, lists, a 4-decimal location, his stars; never the address, notes or reviews). Next: a
   map of them on the site, and on the planet: on Earth, in the sky (`sky.js` `earthPoint(lat,
   lon)` puts a place on the globe; how they look there is to be designed). Then the inbox's other
   sources, and v2: Google's Data Portability API if it reaches US accounts.

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
   - the inbox's other sources (first in this list, above), and visibility (private, shared,
     public) on every record (places have it);
   - a dozen real tasks with known answers, run against SJPJr whenever the model changes;
   - passive sources, one at a time into the inbox: the office camera (a morning frame matched to
     the catalog, the frame deleted after), emailed grocery receipts, a monthly card export;
   - polish still open: repack before each move, smarter search, a phone test checklist, the
     recipes kept on the phone for opening with no connection, and a "today" view in SJPJr's card.

## Waiting on Steve

- **Personal details out of the public repo's history** (Steve chose this Oct 30 2026; the audit:
  https://claude.ai/artifact/2UYqMXj1DdJGV1SvKjVpiy). The current files are clean: tests use a
  made-up trip and family, and members' emails come from the `MEMBERS` secret. Left: one history
  rewrite at a quiet moment with no PRs open (the 2020 résumé, members' emails, the trip details),
  then Steve asks GitHub Support (github.com/contact, "Remove sensitive data") to purge old PR refs.

- **My Tiny Planet's second planet:** who gets the first planet that isn't Steve's, and what they're into (Linear PRO-2300).
- **A Google Maps key for places:** only needed for places a Takeout gives no coordinates for
  (saved lists, like "Want to go"). In the Google Cloud console (console.cloud.google.com): make
  a project, turn on billing (Google asks for it even inside the free calls), then APIs & Services,
  Library, "Places API (New)", Enable; Credentials, Create credentials, API key; edit the key,
  under API restrictions pick "Restrict key" and only Places API (New); under Quotas for Places
  API (New), set the per-day limit to 100. Then in GitHub, this repo's Settings, Secrets and
  variables, Actions, New repository secret: `GOOGLE_MAPS_API_KEY`. The next merge that touches
  `supabase/` copies it in (or run the Supabase workflow by hand). The code stops at 1,000 calls
  a month.
- **A second Takeout, for the saved lists:** the first export had no `Saved/` folder (Want to
  go, Favorites, his own lists). At takeout.google.com pick only "Saved", export, and choose the
  zip in the Places tab; what's already there is merged, not doubled.
- **For passive capture:** the office camera's make and model, which stores' grocery receipts come
  by email, and which card or bank to export.

- **Your own captures for the door:** a Gaussian-splat scan of the backyard or a Philly park (or
  a real tiki bar, with the owner's okay) with Polycam or Scaniverse, exported as `.ply` or
  `.spz`. Or just a few photos of a place: Marble makes the world (`tools/models/marble.json`,
  about $1.28 to $2.48 each, from the credits on platform.worldlabs.ai). A new place is an entry in `realplaces.js`, a file in `assets/splats/` and a panorama
  (`tools/portal-view.mjs`); `docs/world.md` has the steps. Credit Polycam on what's shown.
- **From the security audit (Oct 2026), in the Supabase dashboard:** upgrade Postgres (Project
  Settings, Infrastructure: the advisor says 17.4.1.074 has security fixes waiting; a few minutes
  of downtime, so not on launch day), and delete the leftover OAuth client "smoke check (delete
  me)" (Authentication, OAuth Apps). Neither can be done as code.
- **Archive `stevepisani/my_website`** (Settings → General → Archive); it only holds a README.
- **Revoke the temporary Supabase token** from 30 Sep, if it hasn't expired.

## Parked on purpose

- **A full Content-Security-Policy and frame headers.** GitHub Pages sends no headers of the
  site's own, so the site has the part a `<meta>` can carry (`_includes/head.html`) and
  `/apps/authorize` refuses to work in a frame. A full policy (scripts, connections) would need a
  proxy in front (Cloudflare) and a careful list of every API the planet calls; worth it if the
  apps ever hold more than Steve's own things.
- **The SQL formatter in a Worker.** `/lab/sql-formatter` runs Pyodide and SQLFluff from PyPI on
  the site's own origin, where a signed-in browser keeps the SJPJr session. Pinned versions keep
  the risk small; moving it into a Web Worker (no `localStorage` there) would remove it.

- **Apple Photos:** an iOS Shortcut ("Send to Wardrobe") that uploads picked photos to the inbox
  with a personal key; parked by Steve, Oct 2026.
- [TabbyStack/panthera#32](https://github.com/TabbyStack/panthera/issues/32): a weekly, high-level,
  client-free "what I'm working on" that updates `focus:` in `_data/profile.yml` (and so /about,
  the bartender and the GitHub README). It lives in Panthera because that's where transcripts may be
  read; it opens a PR here and merges it once the site's checks pass.

## Done lately

- Oct 2026: what's public on GitHub, audited. No real secret ever committed; the tests' trip and
  family are made up now, and members' emails are a repo secret (`MEMBERS`), not in migrations.
  Test data is always made up: never the real trip, family or addresses.
- Oct 2026: a second door, behind the bar, onto the Rocky Steps of the Philadelphia Museum of Art:
  a world made by World Labs' Marble from two Wikimedia Commons photos (Dough4872, CC BY-SA 4.0),
  not scanned. The Marble workflow makes worlds from words or photos (`tools/marble-place.mjs`).
- Oct 2026: the two data posts moved to Tabby Stack's blog (tabbystack.io/blog); their old addresses here redirect there (`moved/`, `_layouts/redirect.html`), and /about links to it. This blog is for everything else now.
- Oct 2026: holidays on the planet, only on the day (the visitor's date; `?holiday=halloween` to
  see it any day): Halloween first, jack-o'-lanterns along the walk and round the bar, bats round
  the roof, orange and purple bulbs, a witch's hat on the bartender, and a pumpkin beside the name
  on the other pages. Its code is its own 4 KB file, fetched only that day.
- Oct 2026: more holidays on the planet: Thanksgiving (pumpkins, corn shocks, fallen leaves),
  Christmas Eve and Christmas (lights along the roof, wreaths, presents, a Santa hat), and New Year's
  Eve and Day (the year in the gable, a party hat, fireworks; on the eve a countdown to the
  visitor's own midnight). Each is its own 4 to 5 KB file.
- Oct 2026: the rest of the holidays Steve picked: Valentine's Day (a beating neon heart, rose
  petals), St. Patrick's Day (a rainbow, a pot of gold, shamrocks), Easter (eggs hidden in the
  grass, a basket, bunny ears; its date computed) and the Fourth of July (fireworks over the lagoon
  all night, bunting, flags). Eleven days in all, each its own small file.
- Oct 2026: My Tiny Planet in a chat: anyone's ChatGPT or Claude can ask for a little planet with
  the new Planets connector (`https://mcp.stevenpisani.com/planets`, no sign-in) and show it in
  the chat, walkable, in a frame of the preview page (`/p/preview/#<the spec>`): the spec travels
  in the link, so nothing is stored. It's their own small world, not Steve's: bare until it's
  built for them, with their name, under the stars, on a computer and in a phone's app alike (a
  plain card with "Walk around it" only if 3D can't run).
- Oct 2026: a security audit before Hacker News (the advisors, every policy and grant on the live
  project, every function, the client, the workflows, the whole git history: no secret has ever
  been committed). Fixed: the fireflies' channel made private, presence only, so nobody can
  broadcast to the planet and run up Realtime's bill; the bartender's per-visitor limit keyed on
  the IP Cloudflare saw, not a header anyone can write, and capped at 1,000 replies a day; the
  page count capped at 300 a minute so it can't fill the database; signed-out visitors' grants
  taken back on every private table; sign-in codes good for 15 minutes, not hours; the server's
  link reader checks every redirect, not just the first address; the consent page refuses to work
  in a frame; a `<meta>` CSP (base-uri, object-src, form-action); the Supabase CLI action pinned
  to a commit.
- Oct 2026: "Rockets and Horses" is a walk along one track: scroll and the camera moves back through time from today's rails to the Roman horses, then flies over all of it to the booster at the tunnel and the Shuttle, with the 4′ 8½″ measure lying across the track at every stop; drag to look round. Each stop's card tells the true story (Lincoln's 5 feet, Stephenson's wagonways, the boosters built in segments to ride the rails, and Challenger's joints), with the internet legend beside it where it differs. The horses are alive: they breathe, swish their tails, graze, and toss their heads when tapped (`walk/alive.js` bends the still Meshy horse in its vertex shader), and the page draws frame by frame only while one is in view. Without WebGL it's the cards. On the planet, a booster segment on a flatcar by the landing pad opens the same story and links to the walk. The things on the track are Meshy models (made by the Models workflow with the `MESHY_API_KEY` repo secret; `redo` remakes one) under a Poly Haven sky, on photographed ground; the code's stand-ins show until they load. Each wheeled thing is scaled so its wheels sit on the rails (or in the ruts), not to its stand-in's length, so the Rocket's wheels meet the track; a tall phone screen stands the camera further back; the camera eases after the scroll and settles; and if frames come slowly it draws fewer pixels. Over the scene the cards are solid in every theme. The horses are hitched: the chariot's pole runs between its pair to a yoke across their withers, and the coal wagon's horse pulls on two traces from a bar across the wagon's front. The chariot is built from a picture: Meshy's text-to-3D made a carriage or a cart every time, so the chariot's stand-in is drawn as a racing chariot, `tools/model-ref.mjs` renders it on white, and the Models workflow sends that to image-to-3D, then retextures it from its texture words. After a critical audit (Oct 25): each card names its stop and gives the legend first, then what happened; six facts were corrected (Robert Stephenson built the Rocket, the South's 1886 move was to 4′ 9″, Britain's Roman roads were mostly gravel, the big chariot races ran four horses, and the Shuttle card no longer names STS-1, whose tank was white); the measure in the corner says what each stop's brass bar reads instead of "the whole way", and the medieval road has ruts at two widths, the cart in one; the models' textures are 1024 (the horse's 2048) and the tree is lighter and drawn 45 times as one instanced mesh, so the models went from 13.5 to 7.6 MB; with reduced motion the long move from Rome to Utah is a cut; the camera's easing runs by the clock on slow phones; the horses alone draw at 30 frames a second; a lost WebGL context falls back to the cards; and the drag hint is retired once used. Then the rest of the audit: the Rocket (no cab, one big pair of drivers), the booster (a plain segment, no fins or nose), the coal wagon (a tapered hopper on small flanged wheels, heaped with coal) and the Roman cart (two solid plank wheels) are rebuilt from pictures of their stand-ins, like the chariot. Each era has its own setting (`walk/eras.js`): the Circus Maximus with its spina, turning posts and stands; a Pompeii street with kerbs and stepping stones; an English lane by a dry-stone wall and a thatched cottage; a pit head and spoil heap; Rainhill's grandstand; telegraph poles on the prairie; the Utah desert, its sagebrush and a concrete portal in a red ridge; and the pad in Florida with its service tower, exhaust and the sea. The ground's colour and grain change by era, a setting shows only near its stop (so one era's buildings never stand behind another's), the low-poly trees are gone, and the sky is sky alone, with no suburbs on its horizon. In the dark theme the walk is at dusk, under its own sky. The view shifts so each stop's subject sits beside its card on a wide screen and above it on a phone. Not tested on a real phone.
- Oct 2026: a bowl of petunias on the planet (Hitchhiker's): smashed in a little crater by the landing pad, behind you as you land. It never glints; hover it, or walk up to it, and it thinks "Oh no, not again." Procedural, a few hundred triangles, nothing to download.
- Oct 2026: the two 2025 posts rewritten in Steve's voice, with drawings: "Slow SQL Is Usually One of Four Things" and "Boring Data Pipelines Are the Good Kind" (same dates and addresses). The drawings are inline SVG on the theme's tokens (`.fig` in `site.css`), so they follow light, dark and terminal, and scroll sideways on a phone instead of shrinking.
- Oct 2026: polish before sharing the site on Hacker News: the fireflies capped in code (`supabase/realtime.json`: 50 connected, 2 presence updates a second, at most 360,000 messages an hour; each visitor updates at most every 15 s), the bartender's prompt cached so the same $5 buys 4,000 replies a month instead of 1,000, the suggested questions answered in the page for nothing, and the house answering when a limit's reached instead of "That's all the talking I can do", a picture for shared links (the planet), real descriptions on every page, `@StevenPisani` as the author everywhere, a sitemap and `robots.txt`, text contrast to WCAG AA on the light theme (the orange a shade deeper), typos in the posts, and the Lab at `/lab/` (it shared a name with the `lab/` folder). Checked: row security (nothing readable signed out), the photos bucket private, `public_places` showing only what's marked for the site, the bartender capped.
- Oct 2026: Places, a tab in SJPJr: a Google Takeout zip chosen in the app (starred, reviewed,
  labeled, saved lists and his own My Maps) is kept in the new inbox as it came, and becomes one
  record a place, each waiting for review and private until Steve shares it with Lexi or puts it
  on the site; home, work, labeled places, somewhere he stayed and anything near home can never
  be on the site (the database refuses it). Today and each leg of a trip show what's saved
  nearby, with "Add to this day". In SJPJr, `find_places`, and `get_today` has saved nearby. The
  places with no coordinates are found by the Places API (New), capped at 1,000 calls a month.
- Oct 2026: the robot's drinks, put right after the bottle work: it rolls to whatever its working
  hand works on, so it really picks up the tin, strains into the glass (the stream shows and the
  glass fills), stands the spoon in the glass and sets the garnish on; the drink reads full again
  (no white disc through it), the pineapple wedge sits on the rim with its leaves, the beans float.
  A tap sits you only on or near your stool; the rest of the bar walks you up to it.
- Oct 2026: a faster load. The planet asks for a quarter less before it appears (the campfire's
  moai and Thinker and the mugs load after, like the other models), builds the planet while the
  models download, and fetches its script first; on a slow phone it's built about 4 s sooner. The
  fonts are the site's own now, not Google's, so nothing from another server holds up the first
  paint: the other pages' Lighthouse score went from 86-88 to 97-98 on a phone. Then a second
  pass: the launch console loads after the reveal too, the Earth comes in small first (full size
  a few seconds later, for the telescope), and phones skip the ambient-occlusion code they never
  used. Before the planet appears it's now 1.2 MB, down from 2.66 MB; on a slow phone it's built
  at 9 s instead of 15 s.
- Oct 2026: the rocket is scenery now: tapping it no longer leaves for the classic site (the
  menu's "Regular website" link does that).
- Oct 2026: a record of each day (vision rule 2): one `events` table, only added to, each row with
  how it was known; on Today, "Wore it" logs the planned outfit in one tap (Undo, Change, or pick
  the pieces at home) and a line about the day saves as you leave it, offline too; each past day
  of a trip says what was worn and its line, the packing how many days each garment's been worn
  ("Not worn yet" where it hasn't), and a garment what it's cost a wear. In SJPJr, `get_today`
  (a day in one call, by the leg's own clock), `log_day` and `get_history`. A planned outfit
  counts only once it's logged.
- Oct 2026: a door past the telescope onto a real place: the Sala Thai at the East-West
  Center in Honolulu, a Gaussian-splat scan (Andrew.HD, CC BY 4.0) you step into and look round
  in daylight; the next launch on a console by the rocket; the bartender answers from the site
  when the AI can't.
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

Scene composition pilot (PRO-2293): gathering/lookout layouts, native lagoon, separate footprints, entrance routes, and a stable overview with tap-to-enter are implemented on the review branch. Preparation has no card and performs geometry checks only. Owner example and optional hammock edit are rehearsals; broad asset coverage, a rendered pre-reveal gate, phone performance acceptance and owner satisfaction are still open.
