# My Tiny Planet: planets for other people

Anyone's ChatGPT or Claude can design a little planet for the person it's talking with, from what
they love, and show it right there in the chat, walkable, on this planet's engine. The plan, its
phases and what's next are in `docs/roadmap.md` (My Tiny Planet, Linear P-PRO-40); this file is
how what's built works.

## The pieces

- **The spec** (`supabase/functions/_shared/planet.js`): one small JSON per planet, and
  `checkPlanet`, the one check every spec passes before anything draws it, on the server and in
  the browser alike. Steve's is built from `_data/` (`tools/planet.mjs`). The same file has
  `planetParts` (what the world draws from a spec, with defaults: the sign, the chalkboard, the
  campfire, the robot) and `packPlanet` / `unpackPlanet` (a spec in an address, below).
- **The preview page**, `/p/preview/` (`p/preview.html`): the homepage's world
  (`_includes/world.html`, the same include the homepage uses) with no planet of its own. It
  reads one from its address, after the `#`: the spec, deflated and in base64url (Steve's is
  about 4 KB that way). `assets/js/world/spec.js` unpacks it, runs `checkPlanet`, and fills the
  page from it (top bar, menu, the launch screen's sign) the way Jekyll fills Steve's. Nothing
  is stored anywhere: the address is the planet. The last good one is kept in the tab
  (`sessionStorage`) so a reload works after the world has moved the `#` on. An address with no
  planet in it, or one that fails the check, says so on the launch screen.
- **The connector**, `supabase/functions/planets` (MCP over Streamable HTTP, stateless, like
  SJPJr's), at `https://mcp.stevenpisani.com/planets` (the proxy in `proxy/` sends `/planets`
  there and everything else to SJPJr). Open to anyone, no sign-in: it reads nothing and stores
  nothing. Two tools, both read-only:
  - `get_kit`: what a spec can hold, what the world draws from it today, the limits, and an
    example (Sam's, which `tools/planet-test.mjs` checks passes);
  - `preview_planet(spec)`: checks the spec (each mistake said back as `where: what`, so the
    model fixes it and tries again), packs it into a preview link, and shows the card.
- **The card** (`assets/js/mcp-app/planets.js`, built to `dist/planet-card.js`): SJPJr's card
  shell (`card.js`) with one view, `views/planet.js`. On a computer it shows the preview page in
  a frame, so the planet itself is in the chat, with Full screen and Open in browser. The page
  tells the card how it's going (`tellCard` in `spec.js`: loading, ready, failed); a frame that
  says nothing for 12 s was blocked by the app, and the card falls back. In a phone's app (the
  host says `platform: mobile`, or the pointer is coarse), or with no WebGL2, it's a plain card:
  the sign, the robot's first line, the menu, the chalkboard and the campfire, and "Walk around
  it", which opens the preview page in the browser. The card's page allows the site as a frame
  (`frameDomains` for MCP Apps, `frame_domains` in ChatGPT's `openai/widgetCSP`).

## What a preview draws today

The sign (neon, the menu card, the signpost, the telescope's ring), the name and home city in
the top bar, the links as the menu, a tiki bar's chalkboard display (up to six names; tapping one
shows its other fields, and "Make me one" only for a drink with a recipe), a campfire's
collection (a thought with each marshmallow), the robot's lines, and the cities on the
telescope's Earth (`telescope.pins`, with a few round the world when there are none). A link to a site path means
something only on Steve's site, so in a preview it's shown but goes nowhere.

The rest of the planet is still Steve's (the hammock's book sky stays empty in a preview; the
launch pad, the places themselves): each display and place that reads its spec is PRO-2289 on. A preview never writes:
no AI bartender (the chat box is hidden), no bottles sent, no fireflies; the page count does count
it, as one view of `/p/preview/` (the spec is after the `#`, so it never reaches a server).

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

## Costs and limits

Nothing stored, no AI of ours: an edge function call per tool call, within the plan's included
calls. A request over 256 KB is refused before it's read (a spec is 64 KB at most).
