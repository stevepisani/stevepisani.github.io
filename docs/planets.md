# My Tiny Planet: planets for other people

Anyone's ChatGPT or Claude can ask the person it's talking with what they love and show them
their own little planet right there in the chat, walkable. Every planet is its person's own: the
only thing shared with Steve's is its size (Steve, Oct 2026). Their AI builds it in the chat from
what they said (Steve chose this, Oct 26, for the wow of seeing it at once): their ground and sky,
and things made of simple shapes, each tied to what they love in their words. The first ten
sent are then finished by hand. The plan and what's next are in
`docs/roadmap.md` (My Tiny Planet, Linear P-PRO-40); this file is how what's built works.

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
  tap or click to walk (a ring marks where), drag to look, WASD too.
  `things.js` draws their things: each is up to 40 parts (box, sphere, cylinder, cone, torus,
  capsule, or `text`: a panel of their words), each a size in metres, a place from the thing's
  foot, a turn, a colour and a finish (matte, gloss, metal, glass, glow), maybe spinning. For real
  silhouettes there's more: a box can round its edges (`round`), a `lathe` turns a side profile
  round its up (a vase, a bun), an `extrude` gives a flat outline depth (a guitar body, a heart),
  and a `tube` runs along a smooth path (a handle, a tonearm); any part can `repeat` in steps
  (piano keys, a railing) and `mirror` to the other side (a pair of wheels), each copy counting
  toward the 400 parts. Sam's example uses each of them. A thing can cast light (8 a planet). Solid parts cast shadows; glowing parts and words bloom. A thing is placed by a bearing from straight ahead where you land
  and a distance along the ground, stands upright and faces you; it's solid unless it says not.
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
  their links, what they love, the look and `things` (how to place and make them, and some craft:
  scale, spread, light): none of Steve's planet's parts (Steve, Oct 2026). A spec needs only `version`, `slug` and
  `who.name`. Three tools, the first two read-only:
  - `get_kit`: what a spec can hold, what's drawn from it today, the limits, and an example
    (Sam's, which `tools/planet-test.mjs` checks passes);
  - `preview_planet(spec)`: checks the spec (each mistake said back as `where: what`, so the
    model fixes it and tries again), packs it into a preview link, and shows the card. Its text
    also says what a careful eye would fix (`lookOver` in `_shared/planet.js`): a part touching
    nothing in mid-air, two things standing in each other, a thing under 40 cm or over 5 m long
    (the ground falls away under it), a planet with nothing lit. Boxes are measured as if
    nothing were turned, so these are notes for the model, never errors;
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
  nothing for 12 s was blocked by the app, and the card falls back. Once it's drawn, the page
  sends the card a few views of itself (`looks()` in `planets/main.js`: from above where you land,
  then up to three things, each framed from the side it faces; 512 px JPEGs, drawn and read
  between two frames), and where the host takes pictures in the model's context
  (`hostCapabilities.updateModelContext.image`), the card puts them there with
  `ui/update-model-context`, so the AI that made the planet sees it and can fix what's off. If the frame fails or is
  blocked, or there's no WebGL2, it's a plain card: their name and city, their links, a little of
  what they love, and "Walk around it", which opens the preview page in the browser. The card's page allows the site as a frame
  (`frameDomains` for MCP Apps, `frame_domains` in ChatGPT's `openai/widgetCSP`).

## What a preview draws today

Their ground (colour and hills) and sky (the nebula's colour and the starlight), their things,
and their name and home city in the top bar; with no things it's bare rock under the stars.
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
deployed connector at `mcp.stevenpisani.com/planets`, with three made-up people (a baker in
Lisbon, a climber in Denver, and someone with only a name): it says hello, lists the tools, opens
the kit and the card's page, sends back a spec with a mistake, previews each planet, opens its
preview page in headless Chromium and checks it draws, says whose it is and walks where you tap,
then sends each one. Their slugs start with `test-`, and a planet whose slug does is saved as a
test (`status = 'test'`, `20261026000200_planet_request_tests.sql`): it has its own 20 a day and
never takes a real planet's place, Steve is never told, and the hourly job deletes it a day
later. Check what was saved in Supabase (`select slug, status, note from planet_requests where
status = 'test'`). `--no-send` stops before sending; `--site _site --url <a local connector>`
tries the script itself offline.

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

## Costs and limits

No AI of ours: an edge function call per tool call, within the plan's included calls, and a row
per planet sent, at most 20 a day and 50 waiting. A request over 256 KB is refused before it's read (a spec is 64 KB at most).
