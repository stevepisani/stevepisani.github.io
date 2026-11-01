# My Tiny Planet: planets for other people

Anyone's ChatGPT or Claude can ask the person it's talking with what they love and show them
their own little planet right there in the chat, walkable. Every planet is its person's own: the
only thing shared with Steve's is its size (Steve, Oct 2026). Their AI builds it in the chat from
what they said (Steve chose this, Oct 26, for the wow of seeing it at once): their ground and sky,
and things made of simple shapes, each tied to what they love in their words. The first ten
sent are then finished by hand. The plan and what's next are in
`docs/roadmap.md` (My Tiny Planet, Linear P-PRO-40); this file is how what's built works.

## First-preview quality requirement

The reusable research/design artifact is [planet-art-direction.md](planet-art-direction.md).
Show, don't tell wherever possible: meaning appears in places and visible responses, with
supporting details and accessible controls. Review changes with actual engine frames and action
captures. Concept illustrations are treatments, not implementation evidence.

After the interview, the first planet the person sees must already look coherent, personal and
worth exploring. Repeated customer-directed fixes to basic shapes, placement or lighting are
not the normal product flow. Later customization builds on a good first result.

The default interaction has three beats: reveal a convincing first version; immediately suggest
one specific, appealing change drawn from the person's answers; then, when they choose a change,
apply it and show the updated planet. The suggestion should make the ease of editing tangible
and help them make the world their own. Keep it optional and concrete, with the person free to
choose another direction. Follow-up suggestions add delight or personal expression, rather than
exposing unfinished basic work. The invitation is part of the first reveal, not something that
waits for the person to discover the editing tools.

Judge that first result from fresh interview inputs, with no per-example hand edits or rescue
prompts: recognizable personal objects, a consistent palette and composition, objects grounded
in the terrain, clear approaches, and an attractive populated arrival on desktop and portrait
phone. Preserve each person's composition rather than filling every world with the same props.
Prepared showcase models and eventual hand finishing do not prove this works for unseen inputs.

Automatic checks and correction before presentation may help, within measured latency and cost
limits. `prepare_planet` now compiles and checks without opening a card. It does not render or judge
pictures. `preview_planet` immediately returns its card: inspecting that result is after reveal. The loading fix addresses
reliability; it does not establish this visual-quality gate. Next: a fresh-input first-preview
benchmark and generation/composition improvements measured against it. This requirement is not
yet an implemented guarantee.

The next experience pilot rehearses the creation and edit flow with the owner's original
interview. Keep that input fixed, preserve the baseline and each reviewed revision, and record
the person's actual feedback without inferring satisfaction from a successful render or test.
A rehearsed, refined example is not a fresh-generation benchmark. Readiness for a friend test
requires the owner's explicit satisfaction with the simulated reveal and edit experience; the
friend's first attempt then supplies separate evidence for first-pass quality on unseen input.

## Scene composer

`planet-scenes.js` compiles 1–3 semantic `scenes` into ordinary `things`, explicit entrance
`routes`, and an `arrival: overview` view. It removes scenes from the compiled result, so
preparing the result again is idempotent. `prepare_planet` also returns the small original
`design`, for later edits: change that design, then prepare it again. Never overlay it on the
compiled things. Raw and compiled data pass the same validator and total geometry caps.

There are two authored layouts for now: `gathering` (table, food, seats and warm lights) and
`lookout` (a telescope, small ringed-planet sculpture, seat and lantern). Choose them when they
fit the interview; this is not coverage for every person's world. `setting: tropical` adds
shore palms, beach planting, sand and a native shallow lagoon. Optional `companion: {kind:
cat, name?, color?, note?}` adds the reusable rounded cat only when the person mentioned one.
The props are code-built miniatures, available immediately; they do not need Meshy downloads.
They are a bounded starting library, not a replacement for finished hero models or proof of
first-pass quality on unseen input. Existing custom things and cached models remain available.

A tropical gathering also has an open bamboo-and-thatch pavilion. Furniture stays separate for
independent interaction. An opaque matte part can use `surface: wood|bamboo|thatch|cloth` for
shared procedural texture craft. `craft: planting` uses instanced tropical leaf beds;
`craft: palm` reuses the procedural palm; `craft: cat` keeps
authored head/tail joints. No downloads or generation are needed. A cat's `use: greet` turns
its head toward the visitor (a settled pose under reduced motion). A lookout's `use: look` opens
an explicitly imagined ringed-world sky; Step back, Escape or a walking key returns. Details
remain optional for those actions, rather than covering their response with a card. This is
not live astronomy. The pavilion is open decoration, not a solid room or raised walking deck.

Tropical gathering scenes use cool starlight, warmer light at the table and two low approach
lanterns at a primary gathering place. Scene routes reuse the homepage’s hand-split flagstones, draped on the receiving
planet’s own surface. The lagoon has an irregular wet margin, broken groups of shore stones
and the same wind-ripple/sky-reflection treatment as the homepage. Its walking boundary
conservatively encloses every lobe; some dry sand at its edge is deliberately kept clear.

`arrival: overview` frames the actual primary activity for the current viewport. Optional
thing `role: focus|support|environment` separates composition importance from collision. Put the
main activity first (or mark it focus), nearby usable furniture and shelter as support, and
scenery as environment. Personal additions can be focus without becoming solid. The composer
supplies roles for its authored scenes. Ordinary previews retain their validated forward axis
and loading-screen drag.

The opening searches stable surface positions clear of colliders, fits primary/nearby supporting
bounds, and checks focus visibility with the same mesh/hull hit policy as real taps. Open silhouettes
are checked at real surface samples as well as their potentially empty box centre. Remote
scenery cannot shrink the hero. It respects the receiving aspect ratio and reframes an untouched
opening on resize; deliberate looking is preserved. Very large/conflicting arrangements can
still return a best-effort frame rather than a guarantee. Visibility and clear starting feet
are not a complete walking-route proof. The first tap lowers the visitor to walking height.

`footprint: [width, depth]` separates ground clearance from visual bounds. Mesh hits still
select foliage, but the box under its canopy no longer claims taps meant for another object.
Scene routes join entrances, rather than drawing a separate trail to each plant. Footprints
use oriented rectangles for overlap notes; those notes are approximate on curved ground.

The coast depresses the actual ground continuously and draws a curved water cap inside it.
Ground heights, prop feet and walking use the same surface; a collision boundary keeps the
walking controller out of the lagoon. It is a shallow pond on the planet, not an ocean or a
swimming feature. `scenes[0].extras: ["hammock"]` is one supported additive edit: a sitting
hammock at the scene edge. Recompile the original design to add it without moving existing
scene objects. The example rehearsal and browser tests check this reveal/edit path; owner
satisfaction and an unseen-input friend pilot are still separate gates.

## Atmosphere and visible responses

`look.sky.period` is `day|dusk|night` (default night); `clouds` is `clear|overcast` (default clear).
Day/dusk use a horizon/cloud dome and different directional, hemisphere and environment light,
with the horizon fitted to the tiny planet's visible limb. Clear legacy nights retain their
nebula/stars. `color` tints the chosen sky treatment; `light` colours the directional light.
These controls are art direction, not live weather or an astronomical clock. They do not imply
rain, snow, weather audio or a matching environment asset library.

All usable things respond in the world before optional details. Seats sit, lights switch, the
cat acknowledges and the telescope looks; the separate details button can then open the object's
name/note/collection. This does not add riding, baking, animal rigs or musical performance.
Wood parts map grain in part metres rather than stretching a whole tile over every little board.

## Repeatable interview development review

Use the existing connector runner, offline and without sends:

```sh
node tools/planet-live.mjs --interviews --phase review --local --site _site --shots /path/to/review
```

The fixture `tools/fixtures/planet-interviews.json` contains four clearly synthetic intakes and
agent-authored first designs (forest art, desert cycling, mountain reading/baking, city music).
It is a development stress set, not independent model generations or held-out acceptance data.
Frozen meshes, placements and names stay unchanged in the shared-renderer comparison; new
period/cloud and importance metadata are translated from the same intakes. It records input
hashes, renderer bundle hash, actual desktop/phone frames, first-action state changes and one
additive edit. The old centre-tap probe is retained; when occluded, a visible control is also
clicked in a fresh preview, reported explicitly as a separate first-reveal probe.

`--phase` names an evidence folder; it does not restore old renderer code. `baseline` omits the
new atmosphere/importance metadata. Reproducing a historical renderer requires that checkout
and build. `--arrivals-only` captures first reveals without claiming actions or edits were run.
The review records aesthetic/interaction gaps rather than passing them as universal quality.
No generation, external API or send calls are part of this review mode. Separate fresh interviews
and owner judgment remain necessary after tuning this set.

## The pieces

- **The spec** (`supabase/functions/_shared/planet.js`): one small JSON per planet, and
  `checkPlanet`, the one check every spec passes before anything draws it, on the server and in
  the browser alike. Steve's is built from `_data/` (`tools/planet.mjs`) and also holds his
  planet's own parts (places, the robot, the telescope, the launch pad: `planetParts` reads them
  for the homepage). For anyone else it holds who they are (`who.name`, `look.home`), their links,
  what they love (`collections`, in their own words), the look of their planet (`look.ground`:
  colour and hills; `look.sky`: the nebula's colour and the starlight's) and what stands on it
  (`things`, below).
  `packPlanet` / `unpackPlanet` put a spec in an address (below).
- **A friend's planet** (`assets/js/planets/`, built to `dist/planets.js`; `_layouts/planet.html`,
  `assets/css/planet.css`): its own small world on three.js, a quarter of the homepage's download
  and none of Steve's planet (no bar, sign, campfire, telescope, rocket, lagoon, machine or Earth).
  It shares only the radius (`RADIUS`, `world/planet.js`) and a few general parts: walking
  (`world/player.js`, which takes the planet's own ground), and the empty sky (`buildSpace` in
  `world/sky.js`: the nebula and the stars, which Steve's sky builds on), and the site's look
  (`world/render.js`: ambient occlusion on computers, bloom, vignette; here with ACES tone
  mapping, so the colours their AI chose stay as chosen, and a softer bloom). The starlight
  casts shadows round where you stand (a 2048 map on computers, 1024 on phones), and a dim
  room's reflections (`RoomEnvironment`) give metal, gloss and glass something to show. That
  look made `dist/planets.js` about 735 KB (from 570). `ground.js` makes the
  ground: hills of its own, seeded by the planet's slug so no two are the same shape, patches of
  a duller tone and of pale dust, and loose stones, in the planet's own colour (`look.ground`). You land looking a little down,
  tap or click to walk (a ring marks where; a tap through a thing's gaps, under a table or between chairs, still picks that thing, even with another behind it: the nearest box round what's drawn, turned with the thing), drag to look, WASD too.
  `things.js` draws their things: each is up to 40 parts (box, sphere, cylinder, cone, torus,
  capsule, or `text`: a panel of their words), each a size in metres, a place from the thing's
  foot, a turn, a colour and a finish (matte, gloss, metal, glass, glow), maybe spinning. For real
  silhouettes there's more: a box can round its edges (`round`), a `lathe` turns a side profile
  round its up (a vase, a bun), an `extrude` gives a flat outline depth (a guitar body, a heart),
  and a `tube` runs along a smooth path (a handle, a tonearm); any part can `repeat` in steps
  (piano keys, a railing) and `mirror` to the other side (a pair of wheels), each copy counting
  toward the 400 parts. Sam's example uses each of them. A thing can cast light (8 a planet). Solid parts cast shadows; glowing parts and words bloom. A thing is placed by a bearing from straight ahead where you land
  and a distance along the ground, stands upright and faces you; it's solid unless it says not.
  Or it's set beside a thing listed before it, `near: { of, side, gap }` (front, back, left or
  right are that thing's own sides as it faces you; left and right sit a little forward, so the
  other thing never hides them from where you land): `placeThings` in `_shared/planet.js` works out
  where, clear of the other by both their reaches plus the gap, and turns it to face the other, so
  a planet is a few little places (an oven with its table and bench) rather than things in a ring.
  The same function places things for `lookOver`, so its notes match what's drawn. A thing can
  say what it does when you walk up to it (`use`): `sit` sits you on it, facing the way it faces
  (so a bench set near the oven looks at the oven), with a "Stand up" button under their name, and
  Esc, a step or a tap elsewhere gets you up; `switch` turns its light, and whatever glows on it,
  on or off. Sitting down and getting up are one eased motion by the clock, from and to the walking
  view (a cut with reduced motion). A walk that's blocked close to the thing (the van beside the
  camp chairs) still counts as there. `paths.js`
  lays a worn path from where you land to each thing placed by `at` (3 m out or more), curving in
  to its front: one mesh, a canvas texture with soft edges, in a paler shade of the ground.
  The planet is 20 m across, so the horizon is about 6 m off: 3 to 10 m is in full view from
  where you land. Tap a thing and you walk up to it and a card says what it is (name, note) and
  holds (its collection, in their words); ×, Esc or a tap on the ground closes it. Caps
  (`LIMITS`): 24 things, 400 parts, 12 m a part.
  The launch screen is the night sky over the planet's horizon (drawn where the first frame has
  it), and it's already live: an inline script draws the stars and lets you drag them round at
  the same rate the planet turns you, and the planet appears facing where you looked
  (`window.__veilLook`). It says "Loading the planet…" and fades after the first frames are drawn.
- **The preview page**, `/p/preview/` (`p/preview.html`, `layout: planet`): a friend's planet
  with no spec of its own. It reads one from its address, after the `#`: the spec, deflated and in
  base64url. `assets/js/world/spec.js` (`readSpec`) unpacks it and runs `checkPlanet`. Nothing is
  stored anywhere: the address is the planet. The last good one is kept in the tab
  (`sessionStorage`) for a reload. An address with no planet in it, or one that fails the check,
  says so on the launch screen. A built planet's page will carry its spec (`planet:` in its front
  matter, written into `planet-data`).
- **The connector**, `supabase/functions/planets` (MCP over Streamable HTTP, stateless, like
  SJPJr's), at `https://mcp.stevenpisani.com/planets` (the proxy in `proxy/` sends `/planets`
  there and everything else to SJPJr). Open to anyone, no sign-in: it reads nothing, and the one
  thing it stores is a planet someone sends to be built (below). Its instructions say to ask open questions and keep the answers in the person's own
  words, never to suggest a bar, a sign or anything as a default, and then to build them a few
  things that are unmistakably theirs, tied to what they love. `get_kit` offers who they are,
  their links, what they love, the look, semantic `scenes`, and `things` (how to place and make them, and some craft:
  scale, spread, light): none of Steve's planet's parts (Steve, Oct 2026). A spec passes the check with only `version`,
  `slug` and `who.name`, but the connector won't preview or send a planet that would land them on
  bare rock (`showsNothing` in `_shared/planet.js`): one with no things, one whose nearest thing is
  more than 10 m out, over the horizon, or one with nothing in the first view: a thing counts
  when it's within 10 m and reaches to within 15° of straight ahead (a phone held upright shows
  18.6° either side; `tools/smoke.mjs` checks a cube at the edge really is on screen there). When
  it refuses, it also names anything in Steve's planet's parts (`places`, `robot`, `telescope`,
  `launchPad`, which pass the check for his own spec but a friend's planet never draws), the
  likely reason; with something in view they're only a note, and empty ones are ignored. Each comes back as a mistake naming why, so their AI fixes it
  instead of showing an empty planet as done (Oct 31 2026: a test chat interviewed someone and
  rendered a bare planet). Four tools, the first three read-only:
  - `get_kit`: what a spec can hold, what's drawn from it today, the limits, and an example
    (Sam's, which `tools/planet-test.mjs` checks passes);
  - `prepare_planet(spec)`: checks raw scene intent, compiles it with `composePlanet`, then checks
    the resulting flat spec and arrival geometry. It returns `{ prepared: true, spec, diagnostics }`
    without a card or preview URL. Diagnostics contain geometry warnings, `rendered: false` and
    `assetsGenerated: false`: this does not render screenshots, verify downloaded models or
    generate assets. The agent reviews it once, makes at most two targeted corrections, then uses
    the prepared spec for reveal. Passing these checks is not proof of visual quality;
  - `preview_planet(spec)`: compiles and checks the spec (each mistake said back as `where: what`,
    so the model fixes it and tries again), packs it into a preview link, and immediately shows the
    card. Direct calls with scenes still work, but preparation should precede the first reveal.
    Its text also reports geometry notes (`lookOver` in `_shared/planet.js`): a part touching
    nothing in mid-air, two things standing in each other, a thing under 40 cm or over 5 m long
    (the ground falls away under it), a planet with nothing lit. These are approximate notes,
    never errors. The card may later supply pictures, but preparation does not inspect rendered
    views before reveal. The first reveal includes one specific, optional additive change drawn
    from the person's answers, rather than a generic request for changes or a repair prompt;
  - `send_planet(spec, note?, contact?)`: once the person has seen the preview and says to send
    it (the instructions say never without their go-ahead), checks the spec again and saves it,
    with anything they'd like Steve to know and how to reach them, both optional and in their
    words. It answers with where the planet will be once built (`/p/<slug>/`), or, when the caps
    are reached, that it wasn't sent and to try again in a day or two.
- **The requests** (`public.planet_requests`, `supabase/migrations/20261026000100_planet_requests.sql`):
  what `send_planet` saves (the spec, its slug and name, the note, the contact, a status: new,
  told, building, built, declined). Private: signed out or signed in, nobody but a member reads
  or changes a row, and nobody writes one but the connector, through `planet_request_add()`
  (service role only), which holds the caps: 20 in a day and 50 waiting (new or told) at most; past
  either it returns null and nothing is saved. Every hour the Supabase workflow's
  `tools/planet-requests.mjs` turns the new ones into one GitHub issue assigned to Steve (which
  emails him) and marks them told. The issue says only how many and their ids, because the repo is
  public; what's in them is read in Supabase (`select * from public.planet_requests where id in
  (...)`), by Steve or by Claude through the Supabase connector.
- **The card** (`assets/js/mcp-app/planets.js`, built to `dist/planet-card.js`): SJPJr's card
  shell (`card.js`) with one view, `views/planet.js`. On a computer and in a phone's app alike it
  shows the preview page in a frame, so the planet itself is in the chat, walkable by tap or
  click, with Full screen and Open in browser (Steve, Oct 2026: the phone and the computer should
  be the same). The page tells the card how it's going (`tellCard` in `spec.js`: loading, from an
  inline script before the planet's script arrives, then ready or failed); a frame that says
  nothing for 12 s was blocked by the app, and the card falls back. The loading message is sent
  before the 3D bundle arrives, so a slow download gets time to finish; if the page still hasn't
  drawn after 60 s, it falls back too. Ready cancels both deadlines. Messages must come from
  its own preview frame and match the site's origin (or the host sandbox's opaque origin).
  The card clears its timers and listener when replaced or torn down. Once it's drawn, the page
  sends the card a few views of itself (`looks()` in `planets/main.js`: from above where you land,
  then up to three things, each framed from the side it faces; 512 px JPEGs, drawn and read
  between two frames), and where the host takes pictures in the model's context
  (`hostCapabilities.updateModelContext.image`), the card puts them there with
  `ui/update-model-context`, so the AI that made the planet sees it and can fix what's off. If the frame fails or is
  blocked, or there's no WebGL2, it's a plain card: their name and city, their links, a little of
  what they love, and "Walk around it", which opens the preview page in the browser. The card's page allows the site as a frame
  (`frameDomains` for MCP Apps, `frame_domains` in ChatGPT's `openai/widgetCSP`).

## What a preview draws today

Semantic scenes let the agent describe a place's meaning instead of its coordinates:
`scenes: [{ id, name, kind, note?, collection?, setting?, companion? }]`, one to three scenes.
Kinds are `gathering` and `lookout`; optional `setting: tropical` and
`companion: { kind: cat, name?, color?, note? }` apply only when they belong to the person's answers.
The composer resolves the arrival scene, supporting objects and connecting routes. Generated
object IDs carry the scene prefix; a collision with custom `things` is refused. Compilation
preserves existing custom objects, removes `scenes` and returns ordinary `things` and `routes`,
so preparation can be repeated without duplicating them. Prepare, preview and send use the same
compiler and validate the compiled result against the ordinary limits.

Their ground (colour and hills) and sky (the nebula's colour and the starlight), their things
(each as its real model where one has been made, see below, else as its shapes),
and their name and home city in the top bar; with no things it's bare rock under the stars (only an old link can
show one now: the connector refuses to make it).
Their links show on the chat's plain card. A preview never writes anywhere; the page
count counts it as one view of `/p/preview/` (the spec is after the `#`, so it never reaches a
server).

Steve's planet's engine (`assets/js/world/`) no longer draws anyone else's. `layout` and
`section` in `world/places.js` can still leave places off a planet, kept for the day shared places
are wanted.

## Trying it

- **For a friend:** send them `stevenpisani.com/planets/` (`planets.html`, not in the sitemap): the
  address with a Copy button, the steps for Claude and for ChatGPT, and the first message to send.
  The address is `links.planets` in `_config.yml`, and the connector's `websiteUrl` points there.
  Claude is the easy one (the free plan allows one custom connector, no sign-in, and it works in
  the phone app once added); ChatGPT needs Plus or Pro and Developer mode, on the web.
- Claude (Oct 2026): Customize → Connectors → + Add → Add custom connector → "My Tiny Planet",
  URL `https://mcp.stevenpisani.com/planets`, No sign in → Add. ChatGPT: Settings → Apps &
  Connectors → Advanced settings → Developer mode on; then Apps & Connectors → Create → the same
  name and URL, authentication None. (`https://dkaiavlnmtetqigxnkwb.supabase.co/functions/v1/planets`
  works too.) Then, in a new chat with it turned on: "Use My Tiny Planet to make me a planet: I
  love jazz records and camping." If either app moves its settings, fix `planets.html` too.
- After changing the tools or the card, refresh the connector the way `docs/apps.md` says for
  SJPJr (both apps keep the old card until then).
- Locally: `node tools/smoke.mjs --only planets --shots <dir>` drives the preview page and the
  card (in the MCP Apps SDK's own host) and saves screenshots; `node tools/planet-test.mjs` checks
  the spec, the packing and the connector's answers.

## Testing the live connector

`node tools/planet-live.mjs [--shots <dir>]` does what ChatGPT or Claude would, against the
deployed connector at `mcp.stevenpisani.com/planets`, with two made-up people (a baker in
Lisbon and a climber in Denver): it says hello, lists the tools, opens the kit and the card's page,
sends back a spec with a mistake and four that would be bare rock (only a name, what they love in
Steve's places, everything over the horizon, everything behind them), previews each planet, opens its
preview page in headless Chromium and checks it draws, says whose it is and walks where you tap,
taps each thing from where you land for its card (and sits on what's for sitting, switches what
switches), then sends each one. Their slugs start with `test-`, and a planet whose slug does is saved as a
test (`status = 'test'`, `20261026000200_planet_request_tests.sql`): it has its own 20 a day and
never takes a real planet's place, Steve is never told, and the hourly job deletes it a day
later. Check what was saved in Supabase (`select slug, status, note from planet_requests where
status = 'test'`). `--no-send` stops before sending; `--site _site` serves the site from a local build, and
`--local` asks this checkout's connector in the same process (nothing is sent), so `--local
--site _site` tries a change to both before it's merged.

A cloud session needs its environment to allow `mcp.stevenpisani.com` and `stevenpisani.com`
(Allowed domains, in the project's cloud environment settings); without them the first call
fails to connect. Run `npm install` and `npm run build` first if the session's setup hook
didn't (it runs only when the site is the session's own folder). The browser comes from
`tools/chromium.mjs`, which falls back to the cloud image's newer Chromium in `/opt/pw-browsers`
when the one Playwright expects isn't there (Oct 26: all three made-up planets passed live).

## Building a friend's planet

The first ten are built by hand (Steve, Oct 2026). From a request: read it in Supabase, set its
status to `building`, and give the planet its own page, `p/<slug>.html` with `layout: planet`,
`permalink: /p/<slug>/` and the spec as sent under `planet:` in its front matter (the layout
writes it into `planet-data`). That page is already their planet as previewed, things and all.
Finishing it by hand means changing its spec (better things, more of them) or, where shapes
can't do it, adding to `assets/js/planets/` for that planet; the first one finished decides how
a planet's own code is kept, so this section grows with it. Then set the
status to `built` and tell them (the contact, if they gave one).

## Real models (Meshy)

Simple shapes only go so far (Steve, Oct 26: "still very very poor. let's try just using meshy").
A thing can say what it is in words, `model` (up to 600 characters: what it is, its materials and
colours, what makes it theirs). Every model is made in one house style, **storybook miniature**:
hand-painted textures, soft rounded forms, gentle exaggerated proportions, warm and cosy (Steve
chose it on Oct 27 from the same oven and van drawn and modelled in three styles: "lock it in and
have it as our style"). `tools/planet-models.mjs` holds the style's words (`STYLE`, `STYLE_NAME`)
and makes each thing in two steps, the way the chariot in "Rockets and Horses" got its shape:
first a picture in the house style (Meshy text-to-image, `nano-banana-2`: the thing alone on
white, no ground, no base, no text or logos), kept in `tools/models/planets/pictures/`, then a
model from the picture (image-to-3D with PBR textures), made small with gltf-transform (meshopt,
1024 px WebP textures) into `assets/models/planets/<slug>/<thing id>.glb`, listed in
`assets/models/planets/manifest.json` under `<slug>/<thing id>` with the words and the style it
was made from. New generations record input/reference hashes and pinned settings. Complete legacy
assets remain available until explicitly replaced; migration does not buy the library again.
The generation/cache policy is in `tools/planet-model-cache.mjs`.
The planet (`planets/models.js`) loads the manifest, and each model as it comes, one at a time,
in place of the thing's shapes (`swap` in `things.js`): as big as fits in the room the shapes
took (as tall, and as long along the ground), standing where they stood. The shapes show until
then, and still do if the words have changed since. The pictures sent back to the AI wait for the
models.

Stock things, as a film set keeps stock props: nine small things every place uses (bench, chair,
table, lamp post, crate, sack, mailbox, planter, fence; `STOCK` in `_shared/planet.js`, each with
its size and its words), made once in the house style as the planet `stock` (`stock/<name>` in the
manifest; Steve approved about $6 for them, Oct 27). A thing says `stock: 'bench'` instead of model
words and needs no parts: `partsOf` gives it a rounded box its size, which stands in until the
model loads, for the layout, `lookOver` and taps alike. Any planet can have them, free and at once,
so each planet's own models go on what's truly theirs (all nine were made on Oct 27, 0.5 to 1.3 MB each). Sam's example has a stock bench to sit on.

It runs in the Planet models workflow (`.github/workflows/planet-models.yml`, with the
`MESHY_API_KEY` repo secret; the sandbox can't reach Meshy) whenever a spec in
`tools/models/planets/` or the kit's example changes on a branch other than main, or by hand with
`redo` (`slug/id`, comma-separated), and commits what it made to that branch (push again after,
for the Site checks). Only what's missing is paid for; interrupted tasks resume their IDs. Only
terminal failures clear the failed stage. Reference filenames include input identity; changed
words cannot reuse a legacy slug/id picture. Mesh identity includes actual reference bytes and
pinned settings. Accepted files remain intact while replacements are pending. `--dry-run` lists
work without a key or API calls. The planets it makes models for: the kit's example (Sam), the stock things, and each spec in
`tools/models/planets/` (the live test's Inês and Dev are there; a friend's planet goes there
when it's finished). Caps: 14 models a planet (about $10) for the first 10 friends' planets, then none until Steve says (Steve, Oct 27: "10 an onboarding for the first 10 people"; the example and `test-` planets don't count), 24 a run, about $0.70 a model.
The first nine (Oct 26: Sam's turntable and porch, Inês's oven, tram and bun, Dev's van and
cliff, and the porch and cliff made again from clearer words) took about 3 minutes a run. Words
that describe one object do best: the porch came out as a guitar and an amp until its words said
it was built like a little open hut, with them on its deck.

Next: accepted reusable assets and complete assemblies, proven in first-reveal and interaction
captures. Bespoke generation stays outside the immediate path until measured quality, latency
and cost justify it. The longer-term on-demand idea is not the current runtime.

## Costs and limits

Meshy, for a planet's real models: about $0.70 a model, at most 14 a planet for the first 10 friends (above). Otherwise
no AI of ours: an edge function call per tool call, within the plan's included calls, and a row
per planet sent, at most 20 a day and 50 waiting. A request over 256 KB is refused before it's read (a spec is 64 KB at most).
