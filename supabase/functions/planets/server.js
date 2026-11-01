import { startModels, PER_PLANET } from './models.js';
// The Planets connector (My Tiny Planet, docs/planets.md), without the transport: anyone's ChatGPT
// or Claude designs a little planet for the person it's talking with, from what they love, and
// shows it in the chat. Four tools: get_kit (what a planet can hold, and how to write one),
// prepare_planet (composes and checks it without opening a card),
// preview_planet (checks a spec and shows it in the card: their own planet, assets/js/planets/,
// with the things their AI made for them from simple shapes; none of Steve's places) and send_planet (when they're
// happy with it, saves it for Steve to build: ctx.send, public.planet_requests, capped there).
// Nobody signs in, and a preview stores no planet: its address is the planet (packPlanet); what it
// starts is the real models its things are described for, while they talk (models.js, capped). index.ts
// serves it; it's plain JavaScript so tools/planet-test.mjs can run it in Node.
import { checkPlanet, composePlanet, showsNothing, notDrawn, IN_VIEW, FIRST_VIEW, lookOver, packPlanet, line, PREVIEW_PAGE, LIMITS, SHAPES, FINISHES, SURFACES, USES, STOCK } from '../_shared/planet.js';

export const SITE = 'https://stevenpisani.com';
export const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER = { name: 'planets', title: 'My Tiny Planet', version: '0.1.0', description: 'Design a little planet of your own, from what you love, and walk around it right in the chat.', websiteUrl: `${SITE}/planets/` };

const INSTRUCTIONS = [
  'My Tiny Planet: design a little walkable planet for the person you are talking with, from what they love, and show it here.',
  'Call get_kit first: it says what a planet can hold and what is drawn today.',
  'Ask a few open questions about them and what they love, and put their answers in the spec in their own words. Nothing on a planet is copied from anyone else\'s, so never suggest a bar, a sign or anything else as a default.',
  'Build a coherent activity from their answers. Use gathering, lookout or painting scenes only when those activities fit; do not turn unrelated interests into dinner, astronomy or watercolour. For other activities, use custom things linked with near, put the primary activity first, and use arrival: overview for a view fitted to that activity. Use explicit setting edges or woodland planting around a custom activity when that setting fits. Match day, dawn, dusk or night and cloud cover to their requested atmosphere. A cat companion belongs only when they mentioned a cat; never replace another animal with one. Do not promise unsupported assets or behavior.',
  'Before designing, choose the primary activity, the personal detail that should read at arrival, and one supported visible action. Stage the objects that make that activity possible, with an approach, usable surfaces and seating facing the activity; do not scatter one object for every interview word. Use the first_reveal checklist in get_kit. If a requested activity, companion or action is unsupported, acknowledge that limit rather than silently changing their interests. Later model generation or customization cannot be required to make the first scene worthwhile.',
  'Call prepare_planet before the first reveal. It compiles scenes and returns a flat spec and geometry diagnostics without opening a card. Make at most two targeted corrections after that first preparation. Fix schema and arrival errors and meaningful warnings; geometric warnings can be approximate. Preparation does not render screenshots or generate assets, and passing it is not proof of visual quality. Never claim you inspected rendered views before any were actually available.',
  'Then call preview_planet with the prepared spec to reveal the planet. The card may send rendered pictures back where the host supports them; only then can you inspect those pictures. Tell the person what you made, that they can walk up to things and tap them, and immediately offer one specific additive change drawn from their answers. Make it an appealing optional idea, not a generic question about wanting changes or an invitation to repair basic defects.',
  'Show rather than explain wherever possible: stage usable places and visible personal responses. Tropical gathering scenes include an open supper pavilion and finished palm silhouettes; a cat notices a greeting and a lookout telescope opens an imagined sky. Keep reveal prose brief, preserve useful accessible text, and never describe a response or asset as working unless it is supported and actually shown.',
  'Change it and preview again whenever they ask. A preview stores no planet: its link is the planet, so give them the link to keep. Models may be made while you talk and swapped in later; the first reveal must already be worthwhile with its available shapes. Only describe an asset as finished once it is actually shown.',
  'When they are happy with it and say to send it, send_planet: that is what reaches Steve, who gives it its own address and may add to it by hand. Ask first whether there is anything they would like him to know, and how he can reach them when it is built (only if they want to say). Never send it without their go-ahead.',
  'A planet is public: never put a home address, phone number or anything private in it.',
].join(' ');

// The in-chat card (MCP Apps, SEP-1865, which ChatGPT and Claude both render): one small page whose
// script is the site's (assets/js/mcp-app/planets.js, built to /assets/js/dist/planet-card.js),
// fetched by index.ts and put in the page. The card shows the preview page in a frame, so the
// frame's address (the site) is allowed as well as its script; where 3D can't run, it shows who
// the planet is for and what they love as a plain card, and a link to walk around it in the browser.
export const APP_URI = 'ui://planets/preview.html';
export const APP_MIME = 'text/html;profile=mcp-app';
const showsCard = { ui: { resourceUri: APP_URI }, 'openai/outputTemplate': APP_URI };
export function appResource(script) {
  const js = script ? `<script>${script.replace(/<\/(script)/gi, '<\\/$1')}</script>` : `<script src="${SITE}/assets/js/dist/planet-card.js"></script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>My Tiny Planet</title></head><body><div id="app"></div>${js}</body></html>`;
  const _meta = {
    ui: { csp: { resourceDomains: [SITE], frameDomains: [SITE] }, prefersBorder: true },
    'openai/widgetCSP': { resource_domains: [SITE], frame_domains: [SITE], connect_domains: [] },
    'openai/widgetDescription': 'Shows the planet just previewed, in 3D where the app can (walk around it), or as a plain card with a link where it can’t. Don’t describe what it shows; say what you changed and what they could tell you next.',
  };
  return { uri: APP_URI, name: 'planet-preview', title: 'My Tiny Planet', mimeType: APP_MIME, html, _meta };
}

// A mistake in the call, said so the model can fix it
export class Invalid extends Error {}
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const sends = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

// a small planet, as an example of the shape (tools/planet-test.mjs checks it passes)
export const EXAMPLE = {
  version: 1,
  slug: 'sam',
  who: { name: 'Sam' },
  links: [{ id: 'band', label: 'My band', note: 'Live dates and recordings', href: 'https://example.com' }, { id: 'mail', label: 'Write to me', href: 'mailto:sam@example.com' }],
  look: { home: 'Austin', ground: { color: '#5b4a3c', hills: 0.4 }, sky: { color: '#3a5bd0', light: '#ffd8a8' } },
  collections: {
    records: { title: 'Records I love', items: [{ name: 'Kind of Blue', by: 'Miles Davis', year: 1959, why: 'The first record I wore out' }, { name: 'Blue Train', by: 'John Coltrane', year: 1957 }] },
    porch: { title: 'Evenings', items: ['Playing on the porch until the street lights come on', 'Every amp sounds better at 7'] },
  },
  things: [
    {
      id: 'turntable', name: 'The turntable', note: 'Always something spinning.', collection: 'records', at: { bearing: -22, distance: 5 }, scale: 1.5,
      model: 'A 1960s record player: a walnut wood plinth, a black vinyl record with a blue label on the platter, a chrome tonearm resting on the record, two silver knobs at the front',
      parts: [
        { shape: 'box', size: [1.4, 0.5, 1.1], round: 0.12, color: '#7a4a2a', finish: 'gloss' },
        { shape: 'cylinder', size: [1, 0.04, 1], at: [-0.12, 0.52, 0], color: '#111111', finish: 'gloss', spin: 200 },
        { shape: 'cylinder', size: [0.34, 0.045, 0.34], at: [-0.12, 0.53, 0], color: '#2456c8', finish: 'matte', spin: 200 },
        { shape: 'cylinder', size: [0.12, 0.12, 0.12], at: [0.55, 0.56, -0.38], color: '#cfd3da', finish: 'metal' },
        { shape: 'tube', size: [0.4, 0.1, 0.8], at: [0.42, 0.62, 0], path: [[0.32, 0.4, -0.48], [0.2, 0.5, -0.1], [0.05, 0.3, 0.25], [-0.25, 0, 0.42]], thick: 0.07, color: '#cfd3da', finish: 'metal' },
      ],
    },
    {
      id: 'crate', name: 'The crate', note: 'Everything else, alphabetical. Mostly.', collection: 'records', near: { of: 'turntable', side: 'left', gap: 0.4 },
      model: 'A wooden crate full of vinyl records standing on end, their colourful sleeves showing, with one record leaning against the front of the crate',
      parts: [
        { shape: 'box', size: [0.9, 0.5, 0.6], round: 0.05, color: '#a07a4a' },
        { shape: 'box', size: [0.02, 0.4, 0.4], at: [-0.35, 0.6, 0], color: '#2456c8', repeat: { count: 8, at: [0.1, 0, 0] } },
      ],
    },
    {
      id: 'porch', name: 'The porch', note: 'Where the evenings go.', collection: 'porch', at: { bearing: 30, distance: 10 }, turn: -10,
      model: 'A small wooden front porch, built like a little open hut: a raised plank deck, four white posts holding up a corrugated tin roof, a white railing along the front, a porch lamp under the roof, and on the deck a red electric guitar leaning against a small black amplifier',
      light: { color: '#ffcf8a', strength: 0.7, at: [0, 2.6, 0.8] }, use: 'switch',
      parts: [
        { shape: 'box', size: [4, 0.3, 3], color: '#8a6a4a' },
        { shape: 'cylinder', size: [0.15, 2.6, 0.15], at: [1.8, 1.6, 1.3], color: '#e8e2d6', mirror: true },
        { shape: 'cylinder', size: [0.05, 0.7, 0.05], at: [-1.8, 0.65, 1.35], color: '#e8e2d6', repeat: { count: 9, at: [0.2, 0, 0] } },
        { shape: 'box', size: [1.9, 0.07, 0.09], at: [-0.95, 1.02, 1.35], color: '#e8e2d6' },
        { shape: 'box', size: [4.4, 0.2, 3.4], at: [0, 2.95, 0], color: '#3c4a5a' },
        { shape: 'box', size: [0.7, 0.9, 0.5], at: [0.9, 0.75, -0.6], round: 0.08, color: '#2a2a2a', finish: 'gloss' },
        { shape: 'extrude', size: [0.5, 0.62, 0.1], at: [0.25, 0.65, -0.55], turn: [0, 0, 14], color: '#c8402a', finish: 'gloss', outline: [[0.5, 1], [0.66, 0.96], [0.72, 0.84], [0.66, 0.66], [0.86, 0.56], [1, 0.36], [0.92, 0.12], [0.7, 0], [0.3, 0], [0.08, 0.12], [0, 0.36], [0.14, 0.56], [0.34, 0.66], [0.28, 0.84], [0.34, 0.96]] },
        { shape: 'box', size: [0.07, 0.75, 0.04], at: [0.16, 1.28, -0.55], turn: [0, 0, 14], color: '#5a3a22' },
        { shape: 'sphere', size: [0.35, 0.35, 0.35], at: [0, 2.7, 0.8], color: '#ffcf8a', finish: 'glow' },
        { shape: 'text', text: 'Live at 7', size: [2.6, 0.5, 0.1], at: [0, 3.35, 1.71], color: '#ff9a5c', finish: 'glow' },
      ],
    },
    { id: 'bench', name: 'The bench', note: 'Best seat for the porch shows.', collection: 'porch', stock: 'bench', near: { of: 'porch', side: 'front', gap: 2 }, use: 'sit' },
  ],
};

// What a spec holds for someone else's planet. Steve's own planet's parts (places, the robot,
// the telescope, the launch pad) still pass checkPlanet, for his spec, but aren't offered here:
// nothing on a friend's planet is copied from his (Steve, Oct 2026).
const KIT = {
  first_reveal: {
    intent: 'Choose one primary activity, its emotional setting, one recognizable personal detail and one supported action from the interview before placing objects. Carry their words in notes/collections without treating those text cards as a substitute for the scene.',
    composition: 'Build the activity from related objects: a working surface and what belongs on it, support furniture facing it, enough walking space, a readable approach and restrained setting layers. Keep the personal detail readable at chat size on desktop and portrait phone. Do not add a theme, pet or weather absent from their answers.',
    coverage: 'The authored scene library covers gathering, lookout and watercolour painting only. Custom things can represent other interests, but text descriptions and model words do not establish their visual or behavioral quality. Record unsupported requests honestly; never replace them with a library theme to make validation pass.',
    before_reveal: 'Prepare before preview, with at most two targeted corrections. Preparation checks schema and geometry, not appearance. Required assets must be ready, and available parts must meet the first-impression bar without a later model swap. Do not claim screenshots or actions were inspected unless they were.',
    after_reveal: 'Immediately suggest one specific additive personal change. Preserve existing objects when it is accepted and set reveal to the new thing id for an edited arrival featuring that addition. It should add expression or delight, not ask the person to repair the first scene.',
  },
  what: 'A planet is one JSON spec for a small walkable planet, with an art-directed day, dawn, dusk or night sky, 40 m across the middle (about 126 m round), made for its person from what they love. Only the planet\'s size is shared; nothing on it is copied from anyone else\'s. You build what stands on it (things) from simple shapes, and choose its ground and sky. You land on top, looking ahead; tap or click to walk, drag to look, tap a thing to walk up to it and see what it holds.',
  drawn_today: [
    'who.name: the top bar',
    'look.home: the top bar ("A tiny planet in Austin"); a city, never an address',
    'look.ground: { color, hills 0..1, cover?, coast? }: the ground\'s colour (a rock, sand, grass, snow… colour) and how hilly it is; slug shapes the hills, so no two are the same. Choose cover: grass, sand, snow or paving only when it fits their requested place; this changes material cues and short grass cover without changing terrain heights. Optional coast is a native shoreline, not a floating water prop; tropical scenes supply it.',
    'look.sky: { color, light, period?, clouds?, weather? }: period is day, dawn, dusk or night (default night); clouds is clear or overcast (default clear). Day/dawn/dusk have a horizon/cloud sky and different key/fill lighting, not stars recoloured. color tints the sky and light the key light. This is art direction, not live weather; rain is explicit weather: rain, never inferred from a setting; snow animation is not supported.',
    'things: what stands on the planet, each made of parts; tapping one shows its name, note and collection',
    'scenes: semantic gathering, lookout or painting places compiled into things and routes before drawing; their names, notes and collections carry the person\'s meaning',
  ],
  preparation: {
    steps: ['Choose scenes only for matching gathering/lookout/painting activities; otherwise use custom things with near relationships and arrival: overview, with the primary activity first.', 'Call prepare_planet, review its diagnostics, and make at most two targeted corrections.', 'Call preview_planet with the returned spec to reveal it, then suggest one specific additive personal change.'],
    limits: 'Preparation runs schema, composition and arrival-geometry checks. It does not render screenshots, verify downloaded models or generate assets. Do not claim a rendered view has been inspected until the host actually supplies one. A geometry check is not a visual-quality guarantee.',
  },
  scenes: {
    how: 'Only when these authored activities fit the interview, use 1 to 3 scenes, each { id, name, kind, note?, collection?, setting?, companion?, extras? }. kind is gathering, lookout or painting; these are not a universal scene library. Other activities use custom things. The composer places the first scene ahead where they land and later scenes to one side, connected by routes. Give meaning and roles rather than spatial coordinates. Compiled specs have ordinary things and routes instead of scenes; use that returned spec without adding scenes back.',
    kinds: { gathering: 'A place to gather, eat or share something, with supporting seating and light.', lookout: 'A place to pause and look out, with supporting seating and light.', painting: 'A watercolour easel, supplies, usable seat, shelter and a bird on a branch.' },
    setting: 'Optional setting: tropical or woodland, when it belongs to the person\'s answers.',
    extras: 'Optional [hammock] adds a sitting hammock at the gathering edge; [birdbath] adds a shallow bath beside the clearing; keep the original scene design, change extras, and prepare again for this additive edit. Do not combine scenes with their compiled things.',
    companion: 'Optional { kind: cat, name?, color?: #rrggbb, note? }, only when a cat belongs in this person\'s world.',
  },
  setting: {
    how: 'Independent of activity, optional top-level setting: { around: <existing custom thing id>, edge?: wall|windows|railing, planting?: woodland, shelter?: canopy, extras?: [window-seat], color?: #rrggbb }. Choose these only when the interview supports them. Edges form three short bays behind the activity and leave the front and side approaches open; wall/windows also have short low returns. Windows have recessed panels, deep sills and timber trim. These are non-solid setting edges, not a complete room or safe physical barrier. They suit a compact activity about 4 metres wide; check nearby furniture and screenshots for conflicts. Leave setting absent for an open landscape.',
    shelter: 'Explicit shelter: canopy adds a 6.75 by 5.55 metre open timber structure with a connected pitched roof, rafters and four separately grounded posts. Use only for a sheltered activity without an existing roof. It adds no hobby, furniture or light; keep the activity roughly 4 metres wide and 3 metres deep. This is dressing, not a watertight room or physical collision enclosure. Inspect actual arrivals and reverse/walking views for occlusion; do not hide the personal hero under a roof.',
    extras: 'Optional extras: [window-seat] adds a cushioned usable seat beside the activity, facing it beneath the right window; it needs edge: windows. This can be a personal addition when their answers support somewhere to pause. Recompile the original design with this extra and reveal: <first 15 characters of around>-setting-seat. Existing things and architecture stay unchanged. It uses frameWith to retain the activity as context. Do not promise a view through the window or a private room.',
    planting: 'woodland adds five accepted birches and four fern/stone beds around any custom activity. It does not add painting, pets, rain or a tropical theme. It is birch woodland, not species-accurate beech or a seasonal forest. Trees load before reveal. Existing scene settings remain available; do not double their dressing with this layer.',
  },
  reveal: 'For an accepted addition, preserve the original design and objects, append the new thing, set arrival: overview and top-level reveal: <new thing id>, then prepare and preview. The edited arrival features the addition with its near anchor instead of fitting the whole place into a smaller image. It changes the view, never the objects. Use a recognizable silhouette and meaningful relationship to an existing object. Keep an addition in reach of its context; a far-away addition may have no context in frame. A visibility/pixel check is not proof that a person recognizes it.',
  things: {
    surfaces: `Optional part surface (${SURFACES.join(', ')}) reuses tactile procedural materials on an opaque matte part. Authored craft: palm, cat, birch, woodland-floor, bird, easel, canopy or pavilion is supplied by scene composition; use scenes for those bounded assemblies rather than inventing unsupported models or joints.`,
    footprint: 'Optional role: focus, support or environment gives composition importance independently of collision. Mark the personal activity/companion/addition as focus, its usable furniture/shelter as support, and distant scenery as environment. Then optional footprint: [width, depth], each 0.05 to 12 metres, describes ground contact separately from a broad visual canopy or light. The composer supplies it for scene objects. Keep it honest: it affects spacing and collision diagnostics, not the visible size of the object. Optional frameWith: <earlier thing id> keeps that activity beside a featured addition without changing its absolute at placement; otherwise reveal uses its near.of context.',
    how: 'Each thing is one physically supported object made of up to 40 parts. Keep separate trees and other independently grounded objects as separate things. For arrival: overview, put the primary activity first; framing uses its actual bounds and nearby focus/support objects, excluding environmental silhouettes and remote discoveries. Role affects opening framing; it does not resize or move anything. Keep personal additions in the focus/support group so their reveal stays visible. Place it with at: { bearing, distance }: bearing in degrees from straight ahead where you land (-180..180, + is to the right), distance in metres along the ground (2..60): the planet is so small that the horizon is about 6 m away, so 3..10 is in full view from where you land, and further things rise over the horizon as you walk toward them (63 is the far side). It stands upright and faces where you land; turn (degrees) turns it. Or set it beside a thing listed before it with near: { of: that thing\'s id, side: front, back, left or right (that thing\'s own sides, as it faces you; left and right sit a little forward), gap: metres between them, 0..10, default 0.5 } instead of at: code places it clear of the other and turned to face it, so a bench sits by the oven and a crash pad at the foot of the wall. Give near things no at. scale (0.25..4) scales the whole thing. solid: false lets you walk through it.',
    parts: `Each part: shape (${SHAPES.join(', ')}), size [width, height, depth] in metres, at [x, y, z] its centre in metres from the thing\'s foot (x to its right, y up, z toward you; default: standing on the ground at the foot), turn [x, y, z] in degrees, color "#rrggbb", finish (${FINISHES.join(', ')}; glow is lit from inside), spin (degrees a second, about its own up). A text part is a flat panel of their words (text), facing you, as wide as size[0] at most and size[1] tall. Beyond the simple shapes, for real silhouettes: box with round 0..0.5 rounds its edges (a share of its smallest side); lathe turns a side profile round its up, profile [[out, up], ...] each 0..1 of its size, bottom to top, out 1 at the widest (a vase, a bottle, a bun, a lamp shade); extrude gives a flat outline depth, outline [[across, up], ...] each 0..1 of its size, going round (a guitar body, a heart, a leaf, a cactus, a state's shape); tube runs along a smooth path, path [[x, y, z], ...] each -0.5..0.5 of its size, thick its thickness in metres (a handle, a cable, a tonearm, a rail). Any part can repeat: { count 2..${LIMITS.repeat}, at [x, y, z] the step, turn [x, y, z] degrees a step about the foot } (piano keys, fence posts, petals round a stem), and mirror: true copies it to the other side, x for -x (a pair of wheels, wings, ears). An upright box or cylinder support can say ground: true: its bottom meets the curved terrain while its top attachment stays fixed. Use it on individual legs/posts, without repeat, mirror, spin or head/tail joints; do not use it on roofs or personal objects. Each copy counts as a part.`,
    light: 'light: { color, strength 0..1, at [x, y, z] }: the thing casts warm or coloured light round it, at most 8 lit things a planet.',
    model: `model: up to 600 characters of words for a real 3D model of the thing, made in the planet's one house style (a storybook miniature) while you talk: the preview starts it, the card shows the thing's shapes and swaps the model in when it's ready, about 3 to 5 minutes later, so the parts still matter as its stand-in and for its size. Describe one object, the real one from their answers: what it is, its make or era, materials and colours, a sign of use, what makes it theirs (a 1960s walnut record player with a blue-label record on it, not "a music corner"). No words on it, no logos, no ground or base. Only on the things that are truly theirs, at most ${PER_PLANET} a planet; the same words always make the same model, so keep them unchanged between previews unless the thing itself changes. Stock things need none.`,
    stock: `stock (${Object.keys(STOCK).join(', ')}): a small thing ready-made in the planet\'s style, free and shown at once, instead of model words; it needs no parts (its recognizable local fallback already has legs, a seat/back or other relevant silhouette; give parts only to change that fallback), and scale sizes it. Use stock for the everyday things round a place (somewhere to sit, a lamp, a crate, a fence) and spend model words on what is truly theirs.`,
    use: `use (${USES.join(' or ')}): what happens when you walk up to it. sit: you sit on it, facing the way it faces (a bench, a chair, a sofa, steps, a swing; set near something, it faces that, so a bench near the oven looks at the oven). switch: its light goes on or off (it needs a light). greet: the scene's authored cat turns toward you, with an optional detail button. look: a telescope opens a deliberately imagined star-and-planet view; Step back or Escape returns. This is not live astronomy. Without use, you walk up to it and see its card.`,
    craft: 'A person is 1.7 m tall; make what they love big enough to read from 10 m (a record player can be a metre wide). Think in places, as in the real world: two or three little places, each one main thing at a bearing and distance with 2 to 5 things that belong with it set near it (an oven with its cooling table and a bench; a climbing wall with a crash pad; a van with a camp stove and chairs), at real sizes. Leave room for the visitor: somewhere at each place to sit (use: sit) and take it in. A worn path runs from where you land to each place\'s main thing. One place close by, and something worth walking to further off. Model the silhouette first, then the details that make it theirs: a guitar is an extruded body and a box neck, a coffee cup a lathe with a tube handle, a bike two tori and tubes. Round the edges of boxes that aren\'t meant to be sharp. Sit parts on or into each other, never floating: a part\'s at is its centre, so a 0.4 m tall part on a 0.5 m tall base sits at y 0.7. The ground curves: something longer than about 5 m lifts off at its ends, so keep long things shorter or let them stand on legs. Use glow and lights for warmth against the night.',
  },
  shape: {
    version: 1,
    slug: 'a-z, 0-9 and -, 2 to 32 characters: the planet\'s name in its address',
    who: { name: `required, ${LIMITS.name} characters at most` },
    links: `up to ${LIMITS.links}: [{ id, label, note, href }]; id is a short id (a-z, 0-9, -)`,
    look: { home: 'a city', ground: { color: '#rrggbb', hills: '0..1', cover: 'optional grass|sand|snow|paving', coast: 'optional { bearing: -180..180, distance: 2..30, radius: 1..8, color?: #rrggbb }; metres along the surface' }, sky: { color: '#rrggbb', light: '#rrggbb', period: 'optional day|dawn|dusk|night', clouds: 'optional clear|overcast', weather: 'optional clear|rain; only if requested' } },
    collections: `up to ${LIMITS.collections}: { <id>: { title, items: [text, or small objects with a name] } }`,
    setting: 'optional: { around: <custom thing id>, edge?: wall|windows|railing, planting?: woodland, shelter?: canopy, extras?: [window-seat], color?: #rrggbb }; setting layers independent of activity, compiled before drawing',
    reveal: 'optional: an existing thing id to feature in the edited overview arrival; preserves object positions',
    scenes: 'optional: 1 to 3 [{ id, name, kind: gathering, lookout or painting, note?, collection?, setting?: tropical or woodland, companion?: { kind: cat, name?, color?: #rrggbb, note? } }]; compiled into placed things and routes',
    routes: 'optional, up to 3 [{ from: { bearing, distance }, to: { bearing, distance } }]; normally supplied by the composer to connect scene entrances',
    things: `optional with scenes, otherwise required: 1 to ${LIMITS.things}, at least one 3 to ${IN_VIEW} m from where they land and nearly straight ahead, bearing -${FIRST_VIEW} to ${FIRST_VIEW}, the first view on a phone held upright (a preview with none in that view is refused, as they'd see bare rock): [{ id, name, note, collection, at: { bearing, distance } or near: { of, side, gap }, turn, scale, solid, model or stock, use, parts: [...], light, footprint?: [width, depth], seatView?: {eye, pitch}, frameWith?: <earlier thing id> }], ${LIMITS.allParts} parts in all`,
  },
  sending: 'When they have seen the preview and say to send it, send_planet: it reaches Steve, who gives it its own address and may add to it by hand. A preview alone is never sent.',
  limits: LIMITS,
  scene_example: {
    version: 1, slug: 'morgan', who: { name: 'Morgan' },
    collections: { evenings: { title: 'Evenings', items: ['Sharing recipes and watching meteor showers with friends'] } },
    scenes: [
      { id: 'supper', name: 'The evening table', kind: 'gathering', note: 'Recipes and long conversation.', collection: 'evenings' },
      { id: 'sky', name: 'Meteor watch', kind: 'lookout', note: 'A quiet place to watch the sky.', collection: 'evenings' },
    ],
  },
  example: EXAMPLE,
};

export const TOOLS = [
  {
    name: 'get_kit',
    title: 'What a planet can hold',
    description: 'What a tiny planet spec can hold, what is drawn from it today, the limits, and a small example. Call it before writing a spec.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: read,
    _meta: { 'openai/toolInvocation/invoking': 'Opening the kit…', 'openai/toolInvocation/invoked': 'Kit open' },
  },
  {
    name: 'prepare_planet',
    title: 'Prepare a planet',
    description: 'Compiles semantic scenes and checks the resulting planet without opening a card. Returns the prepared flat spec and geometry diagnostics. Does not render screenshots, verify downloaded models, generate assets or store anything. Use before the first preview.',
    inputSchema: { type: 'object', properties: { spec: { type: 'object', description: 'The planet spec, with scenes or existing things (get_kit says what goes in one).' } }, required: ['spec'], additionalProperties: false },
    annotations: read,
    _meta: { 'openai/toolInvocation/invoking': 'Preparing the planet…', 'openai/toolInvocation/invoked': 'Planet prepared' },
  },
  {
    name: 'preview_planet',
    title: 'Preview a planet',
    description: 'Compiles and checks a planet spec, then reveals it in the chat: the planet in 3D where the app can, else a plain card and a link. Use prepare_planet first to check without revealing. Returns the preview link, which is the planet itself (nothing is stored). If the spec has mistakes, says each one (where: what) so you can fix them and try again.',
    inputSchema: { type: 'object', properties: { spec: { type: 'object', description: 'The planet spec (get_kit says what goes in one).' } }, required: ['spec'], additionalProperties: false },
    annotations: read,
    _meta: { ...showsCard, 'openai/toolInvocation/invoking': 'Building the planet…', 'openai/toolInvocation/invoked': 'Planet ready' },
  },
  {
    name: 'send_planet',
    title: 'Send a planet to be built',
    description: 'Sends the planet to Steve Pisani, who builds each one by hand from its spec. Only when the person has seen the preview and says to send it. Saves the spec, their note and how to reach them (both optional, in their words); it will be at its own address when it is built.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: { type: 'object', description: 'The planet spec, as last previewed.' },
        note: { type: 'string', maxLength: 1000, description: 'Anything they would like Steve to know, in their own words (optional).' },
        contact: { type: 'string', maxLength: 200, description: 'How Steve can reach them when it is built, only if they gave it (optional).' },
      },
      required: ['spec'],
      additionalProperties: false,
    },
    annotations: sends,
    _meta: { 'openai/toolInvocation/invoking': 'Sending the planet…', 'openai/toolInvocation/invoked': 'Planet sent' },
  },
];

// where a planet will be once it's built
export const planetPage = (slug) => `${SITE}/p/${slug}/`;

async function call(name, args, ctx) {
  if (name === 'get_kit') return { text: JSON.stringify(KIT), data: KIT };
  const validate = (spec) => {
    const errors = checkPlanet(spec);
    if (errors.length) throw new Invalid(`That spec has ${errors.length === 1 ? 'a mistake' : `${errors.length} mistakes`}; fix ${errors.length === 1 ? 'it' : 'them'} and prepare again:\n${errors.slice(0, 30).join('\n')}`);
  };
  validate(args.spec); // raw scene intent must be checked before the compiler uses it
  let spec;
  try { spec = composePlanet(args.spec); }
  catch (e) { throw new Invalid(`That scene could not be composed; fix it and prepare again:\n${e.message}`); }
  validate(spec); // generated geometry must obey the same caps as hand-authored things
  // a planet that passes but would show them nothing is never shown or sent as if it were done
  const empty = showsNothing(spec);
  if (empty.length) throw new Invalid(`That planet would show them nothing but bare rock; fix this and prepare again:\n${empty.join('\n')}`);
  const notes = [...notDrawn(spec), ...lookOver(spec)];
  if (name === 'prepare_planet') return {
    text: `Prepared ${spec.who.name}'s planet. Schema and arrival-geometry checks passed. This did not render screenshots, verify downloaded models or generate assets.${notes.length ? `\nReview these geometry notes before revealing (they can be approximate):\n- ${notes.join('\n- ')}` : ''}\nUse the returned spec with preview_planet when ready to reveal it.`,
    data: { prepared: true, spec, ...(args.spec.scenes||args.spec.setting ? { design: args.spec } : {}), diagnostics: { warnings: notes, rendered: false, assetsGenerated: false } },
  };
  if (name === 'send_planet') {
    const text = (v, max, what) => {
      if (v == null || v === '') return null;
      if (typeof v !== 'string' || v.length > max) throw new Invalid(`${what} should be text, ${max} characters at most.`);
      return v.trim() || null;
    };
    const note = text(args.note, 1000, 'note'), contact = text(args.contact, 200, 'contact');
    if (!ctx.send) throw new Error('send_planet: no store');
    const id = await ctx.send({ spec, note, contact });
    if (!id) return { text: "Steve has as many planets waiting to be built as he can take right now, so this one wasn't sent. Keep the preview link; try again in a day or two.", data: { sent: false } };
    const page = planetPage(spec.slug);
    if (spec.slug.startsWith('test-')) return { text: `Saved as a test (its slug starts with test-): Steve isn't told, it's never built, and it's deleted after a day.`, data: { sent: true, test: true, page } };
    return {
      text: `Sent. Steve builds each planet by hand, so it isn't there yet; when it's built it will be at ${page}. Until then the preview link is the planet as it stands.`,
      data: { sent: true, page },
    };
  }
  // preview_planet: the real models their things need start now (models.js), and come into the card as they're made
  const url = `${PREVIEW_PAGE}#${await packPlanet(spec)}`;
  const models = await (ctx.models ? startModels(spec, ctx.models).catch((e) => { console.error(e); return null; }) : null);
  const named = (ids) => ids.map((id) => spec.things.find((t) => t.id === id).name).join(', ');
  const making = !models ? '' : [
    models.making.length ? ` Real models of ${named(models.making)} are being made in the planet's style; the card shows their shapes until each is ready, about 3 to 5 minutes, and swaps it in, so they can walk around meanwhile.` : '',
    models.over.length ? ` There's no room left for real models of ${named(models.over)} (the month's or the planet's cap), so they stay as their shapes.` : '',
    models.test ? ' Test planets (slug test-…) get no real models.' : '',
  ].join('');
  // what the plain card shows: who it's for, their links, and a little of what they love
  const loves = Object.values(spec.collections || {}).filter((c) => Array.isArray(c.items)).slice(0, 4).map((c) => ({ title: c.title, items: c.items.slice(0, 6).map(line).filter(Boolean) }));
  const planet = { name: spec.who.name, home: spec.look?.home || null, links: (spec.links || []).map(({ label, note, href }) => ({ label, note, href })), loves };
  // Geometry notes are available during preparation; a preview has already revealed its card.
  const fix = notes.length ? `\n\nGeometry notes (the card has already been revealed; use prepare_planet before the next reveal, and do not claim these notes are rendered inspection):\n- ${notes.join('\n- ')}` : '';
  return {
    text: `${spec.who.name}'s planet is ready to walk around, with ${spec.things.map((t) => t.name).join(', ')} on it.${making} It's shown in the card; to keep it or share it, here's its link (the link is the planet): ${url}${fix}`,
    data: { view: 'planet', url, planet, ...(models ? { models: { making: models.making, made: models.made, over: models.over, ...(models.test ? { test: true } : {}) } } : {}) },
  };
}

/** Answers one JSON-RPC message (or null for a notification). */
export async function rpc(msg, ctx = {}) {
  const ok = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Not a JSON-RPC request.');
  if (msg.id === undefined) return null; // notifications: nothing to say
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return ok({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false }, resources: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'resources/list': { const { html, _meta, ...r } = appResource(); return ok({ resources: [r] }); }
    case 'resources/templates/list': return ok({ resourceTemplates: [] });
    case 'resources/read': {
      if (msg.params?.uri !== APP_URI) return fail(-32002, `No resource ${msg.params?.uri}.`);
      const r = appResource(await ctx.cardScript?.().catch(() => null));
      return ok({ contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.html, _meta: r._meta }] });
    }
    case 'tools/call': {
      const { name, arguments: args } = msg.params || {};
      if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `There's no tool called ${name}.`);
      try {
        const { text, data } = await call(name, args || {}, ctx);
        return ok({ content: [{ type: 'text', text }], structuredContent: data });
      } catch (e) {
        if (!(e instanceof Invalid)) console.error(e);
        return ok({ content: [{ type: 'text', text: e instanceof Invalid ? e.message : "That didn't work; try again." }], isError: true });
      }
    }
    default: return fail(-32601, `No method ${msg.method}.`);
  }
}
