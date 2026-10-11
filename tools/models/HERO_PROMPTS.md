# Hero props: generation guide

The homepage world has slots for hand-made or AI-generated "hero" props. Each slot has a
procedural stand-in; drop a GLB in `assets/models/hero/`, list it in
`assets/models/hero/manifest.json`, and it replaces the stand-in on the next load.

```json
{
  "tiki-post":    { "file": "tiki-post.glb",    "height": 2.7 },
  "tiki-mug":     { "file": "tiki-mug.glb",     "height": 0.17, "tint": "aqua", "brightness": 2.2 },
  "puffer-lamp":  { "file": "puffer-lamp.glb",  "height": 0.4, "glow": 1.2 },
  "volcano-bowl": { "file": "volcano-bowl.glb", "height": 0.1 },
  "moai":         { "file": "moai.glb",         "height": 2.4 },
  "parrot-mug":   { "file": "parrot-mug.glb",   "height": 0.2 },
  "pineapple-mug": { "file": "pineapple-mug.glb", "height": 0.17 },
  "robot":        { "file": "robot.glb",        "height": 1.9 },
  "thinker":      { "file": "thinker.glb",      "height": 1.5 },
  "bottle-campari": { "file": "bottle-campari.glb", "height": 0.3, "lazy": true }
}
```

Models are auto-scaled to `height` (metres), centred, and set on the ground. Optional keys:
- `rotateY` (radians) if the model faces the wrong way; the front should face +Z. `rotate`
  ([x, y, z] radians) for one lying the wrong way.
- `roughness`, `metalness`: material factors. With PBR maps they multiply the maps
  (`roughness: 0.5` makes a glaze glossier); without a roughness map roughness defaults to 0.7.
- `tint` (a `PALETTE` key) and `brightness` (a number) multiply the base colour. Use them when
  a texture goes muddy under the bar's amber light, rather than regenerating.
- `glow`: emissive strength for things lit from inside (pufferfish lamps). It emits the
  model's own texture, so it adds no new colours.
- `anchors`: where a slot that puts moving parts on the model puts them, in metres in the
  scaled, grounded model (front +Z). Only `launch-console` uses it: `screen` [x, y, z, width,
  height] (the live screen's plane, just in front of the glass), `lamps` [y, z, span] (the row of
  status lamps along the top of the screen housing) and `button` [x, y, z] (the red button, on
  the desk). `rocket` gives `engines` [height of the nozzles' mouths, how far apart] for the
  engine test's flames and `badge` [height, hull radius there, size] for the site's logo on
  its front (-Z). Measure them again whenever the model changes: cast rays at it (three.js
  `Raycaster` on the GLB's geometry) from the front, the sides and from above.
- `tinted`: its copies are tinted and lit by their own texture in code (the glass floats), so that
  form of its shader is compiled ahead too.
- `instance`: for a lazy model there are dozens of, standing still (the trail lanterns and their
  posts, the torches): every copy is drawn at once as one InstancedMesh, not one mesh each.
- `lazy`: load it after the scene is up, not before the reveal: the bottles the robot pours
  from, and every model that replaces a code-built thing (the rocket, the telescope's tripod,
  the radio dish, the message bottles, the glass floats, the campfire's logs and benches, the
  bar stools, the canoe, the signpost, the torches, the trail lanterns, the rum wall). Those are built in code first and swapped for the model when it arrives
  (`hero.js` `heroSlot()` / `fillSlots()`), so a slow connection never holds up the planet.

Lights, fire, and hanging cords are added by the world, so don't bake them in. The `robot`
slot replaces only the bartender's body: it still turns, rolls and rattles, but the
code-built arms, shaker and dial don't animate on a generated model, so only register one
that's worth that trade (and it must have its own single wheel).

## Art direction for every prop
Mid-century American "Polynesian Pop" (1950s–60s tiki bars: Trader Vic's, Mai-Kai,
Tiki-Ti), *not* a replica of any real sacred carving. Invented pop tiki faces in the
Witco / Shag spirit. Moody, realistic materials, lit at night by warm lamps.

- **Palette:** dark tiki stain `#4A2C1A`, bamboo `#C9A66B`, lava black `#1B1412`,
  amber `#F2A541`, coral `#E8634A`, deep teal `#0F5E63`, float aqua `#5FC7C4`.
- **Budget:** at most 10–15k triangles and one 1024px texture set per prop
  (512px for small props). Web-first: low-poly silhouette, detail in the textures.
- **Export:** GLB, PBR (base colour + normal + roughness; metallic only if metal),
  Y-up, real-world scale if the tool allows. No lights, no cameras, no ground plane.

## Prompts (Meshy / Tripo / Rodin text-to-3D)

Each slot has a shape prompt and a texture prompt (Meshy's refine `texture_prompt`). Keep the
texture prompt about materials: listing the whole palette there makes Meshy paint teal and
orange accents on everything.

**tiki-post**: holds up the roof (four of them)
> A tall cylindrical carved tiki pole, 2.7 metres, used as an architectural post in a 1950s tiki bar: a stylised invented tiki face in the upper half (bold brow, lozenge eyes, wide mouth with bared teeth), carved bands and zigzag patterns below. Dark stained wood, weathered, burnt accents. Even thickness top to bottom, flat top and bottom. Realistic PBR, game-ready.

Texture: Dark stained weathered wood, burnt accents in the carved grooves. Natural wood only, no paint.

**tiki-mug**
> A ceramic tiki mug, 17 cm tall, classic 1960s tiki bar style: a slightly waisted cylindrical tumbler with no handle, a tiki face moulded in relief on the front (heavy brow, big lozenge eyes, wide grin), glossy drip glaze. Open top, hollow inside. Realistic PBR ceramic, game-ready.

Texture: Glossy ceramic drip glaze in deep teal #0F5E63 fading to dark brown at the base, glaze pooling darker in the recesses.

**parrot-mug**
> A ceramic tiki bar parrot mug, 18 cm tall, classic 1960s style: a stylised macaw parrot perched upright forming the body of the mug, its curled tail making the handle, its head at the top beside a wide round opening, wings folded against the sides. Hollow with an open top. Glossy glazed ceramic. Realistic PBR, game-ready.

Texture: Glossy ceramic glaze: bright red body, yellow and blue wing feathers, cream beak, black eyes, darker glaze pooling in the carved feather details.

**pineapple-mug**
> A classic ceramic pineapple tiki mug, 15 cm tall: a pineapple-shaped cup with a diamond-pattern textured body, an open round top rimmed by short carved leaves, and a small loop handle. Hollow with an open top. Glossy glazed ceramic. Realistic PBR, game-ready.

Texture: Glossy golden-yellow ceramic glaze with amber in the diamond recesses and green glazed leaves around the rim.

**puffer-lamp**
> A hanging pufferfish lamp from a 1950s tiki bar: a real dried porcupine pufferfish inflated into a round balloon shape, with a fish face at the front (big round eyes, small pouting mouth), small side fins and a little tail fin at the back, skin covered in short pale spines. A short cord on top. 50 cm long. Realistic PBR, game-ready.

Texture: Dried pufferfish skin, translucent tan and pale yellow with brown spots, pale spines, glossy black eyes. No metal.

**volcano-bowl**
> A tiki volcano bowl for sharing flaming rum punch: a very wide, shallow round ceramic dish like a pie dish, 35 cm wide and only 13 cm tall, with a small hollow volcano cone rising from the centre of the dish. Glossy glaze. Realistic PBR, game-ready.

Texture: Glossy dark brown lava glaze with orange #E8634A drips running down, dark interior.

**moai**
> A weathered Easter Island moai-style head, stylised for a 1950s tiki bar garden: long rectangular face, heavy brow, long nose, tight lips, elongated ears, carved from porous dark grey lava rock with moss in the crevices. 2.4 metres tall. Realistic PBR, game-ready.

Texture: Porous dark grey volcanic basalt, weathered and pitted, green moss and lichen in the crevices. Bare stone, no paint.

**robot**: the bartender (static body only; the world adds the turning, shaking and serving)
> A legless 1950s tin-toy robot bartender: the body tapers at the bottom into a round skirt that sits on one single large rubber wheel, like a unicycle robot; no legs and no feet. Box-shaped head with a big round glowing dial gauge for a face, a clear glass dome on top of the head with a thin antenna. Riveted teal and cream enamel body wearing a short-sleeved Hawaiian aloha shirt, a bow tie and a flower lei. Jointed tube arms with two-finger pincer hands holding a chrome cocktail shaker. Retro-futurist Googie toy, 1.9 metres tall, facing forward. Realistic PBR, game-ready, low poly.

Texture: Glossy teal #0F5E63 and cream enamel tin with rivets, chrome trim, aloha shirt with coral hibiscus flowers, amber glowing dial face, pink and white flower lei, black bow tie, black rubber wheel.

**thinker**: sits with you at the campfire, a nod to Philadelphia's Rodin Museum (Rodin's 1880 original is in the public domain)
> The Thinker by Auguste Rodin: a muscular nude man seated on a rough rock, leaning forward, his right elbow resting on his left thigh, his chin resting on the back of his right hand, deep in thought, left hand hanging over the left knee. Full figure, seated, facing forward. Cast bronze with a dark green-brown patina. Realistic proportions, museum sculpture, game-ready.

Texture: Cast bronze sculpture with a dark brown-green patina, worn to warm golden bronze on the raised muscles and highlights, darker in the recesses; the rock base in the same bronze. Metallic, museum outdoor bronze, no paint.

**bottle-planteray**: the real bottle the robot pours Planteray from (8,000-triangle preview, optimised to about 4,000)
> A single bottle of Planteray (Plantation) XO 20th Anniversary rum: a short, wide, round-shouldered clear glass bottle full of dark amber rum, the lower half wrapped in a woven natural raffia straw net, a cream and gold paper label with a small crest, a short neck with a wooden-topped cork stopper. Product photo, standing upright, nothing else.

Texture: Clear glass bottle showing dark amber-brown aged rum inside, natural tan woven raffia straw net around the base, a cream paper label with gold trim and a small gold crest reading PLANTERAY XO, gold foil on the neck, a light wooden cork top. Realistic product materials.

**bottle-campari**: the real bottle the robot pours Campari from (8,000-triangle preview, optimised to about 4,000)
> A single bottle of Campari bitter aperitivo: a tall slim clear glass bottle with long sloping shoulders and a long neck, filled with bright translucent red liquid, a white label with the red CAMPARI wordmark, a red screw cap. Product photo, standing upright, nothing else.

Texture: Clear glass bottle showing bright translucent ruby red liquid inside, a white label with the red CAMPARI wordmark and small MILANO text, a red cap. Realistic product materials.

**bottle-chartreuse**: the real bottle the robot pours Chartreuse from (8,000-triangle preview, optimised to about 4,000)
> A single bottle of Green Chartreuse liqueur: a clear glass bottle with a rounded, slightly bulbous body, embossed glass shoulders and a long neck, filled with vivid yellow-green liqueur, an ornate cream label with script lettering and a round seal on the shoulder, a green capsule top. Product photo, standing upright, nothing else.

Texture: Clear glass bottle showing vivid chartreuse yellow-green liqueur inside, an ornate cream and tan label with elegant script lettering reading Chartreuse, a round cream seal medallion on the shoulder, a green foil capsule on the neck. Realistic product materials.

**bottle-meletti**: the real bottle the robot pours Meletti from (8,000-triangle preview, optimised to about 4,000)
> Exactly one single bottle, alone: a Meletti coffee liqueur bottle from Italy, a tall slim cylindrical glass bottle with a short neck, filled with nearly black coffee liqueur, a vintage cream label with red and black lettering, a dark cap. One bottle only, standing upright, centered, nothing else.

Texture: Clear glass bottle showing nearly black dark brown coffee liqueur inside, a vintage cream paper label with an ornate red and black border, the red word MELETTI and the words Caffè and Ascoli Piceno in black, a small gold crest, a black cap with a thin gold band. Realistic product materials.

**launch-console**: launch control by the rocket pad (the screen, lamps, red button and its guard are added by `props.js`; generated 2026-10-11)
> A 1960s space-age rocket launch control console, one solid freestanding unit: a heavy steel cabinet desk 1.3 metres wide and 0.7 metres deep standing on a dark plinth, a wide sloped control panel at waist height covered in rows of toggle switches and small round indicator lamps, and built into the back of the desk a boxy CRT monitor housing at eye height with a large flat dark rectangular glass screen facing forward, rounded corners, a thick bezel. Cream enamel and teal painted steel, chrome trim, rivets, 1.45 metres tall overall. Facing forward. Realistic PBR, game-ready.

Texture: Cream white baked enamel painted steel cabinet with deep teal painted side panels and kick plate, brushed chrome trim and handles, black bakelite knobs and toggle switches, small round indicator lamps, a dark charcoal plinth. The screen is plain dark green-black glass with nothing on it. Slightly worn paint, realistic industrial materials.

**Replacing code-built props** (generated 2026-10-11; each the shape prompt, then its texture prompt):

**rocket** (4.25 m; the flames, smoke and badge are added by `rocket.js`)
> A small stubby model of the Apollo Saturn V moon rocket standing on four landing legs. White body with black bands and the black and white roll pattern on the lower stage. Straight sided cylinders all the way up: wide first stage, same-width second stage, slightly narrower third stage, a short tapered adapter, a small grey cone capsule and a thin red lattice escape tower with a pointed tip on top. Four small black fins at the bottom corners. Five large black engine bells clustered under the base. No side boosters. 3.6 metres tall. Realistic PBR, game-ready.

Texture: Glossy white painted rocket stages with black roll pattern bands and black stripes like the Saturn V, a few riveted seams and slight scorch marks near the base, dark metal engine bells, grey capsule, red escape tower. Realistic materials.

**telescope-tripod** (the brass tube stays code: it turns on the mount, and Meshy's tubes came out stubby or on a post)
> A wooden surveyor's tripod for an antique brass telescope: three tapered square varnished wooden legs with brass hinges at the top and pointed brass feet, a small triangular wooden accessory tray held by brass spreader rods halfway down, and a round flat brass head plate on top with nothing mounted on it. 1.25 metres tall, standing upright. Realistic PBR, game-ready.

Texture: Varnished warm honey-brown hardwood legs with visible grain, polished brass hinges, head plate, spreader rods and pointed feet, a little worn. Realistic materials.

**radio-dish**
> A 1960s radio telescope dish antenna on a pedestal: a deep bowl-shaped white parabolic reflector dish 2 metres across, tilted up toward the sky, with a feed horn on three thin struts at its center, a counterweight and a steel yoke behind it, on a thick round steel column on a round concrete pad. Realistic PBR, game-ready.

Texture: Off-white painted steel reflector dish with faint panel seams, grey steel struts, yoke and feed horn, dark grey painted column, rough grey concrete pad, slightly weathered. Realistic industrial materials.

**message-bottle** (made see-through in code, so the letter shows; the cork that's pulled is code)
> A single old message in a bottle: an empty clear green glass wine bottle with a long neck, weathered and frosted by sand and sea, a few barnacles near the base, no label, a cork in the neck. Standing upright, 26 cm tall. Realistic PBR, game-ready.

Texture: Dark green glass bottle, frosted and scuffed by sand, a few pale barnacles near the base, a light brown cork in the neck. Realistic materials.

**glass-float** (tinted and lit from inside in code, each its own colour)
> A single Japanese glass fishing float: a round hand-blown aqua blue sea glass ball 30 cm across, completely covered by a knotted diamond-pattern net of thin brown rope that wraps the whole ball, gathered into a small loop at the top. Realistic PBR, game-ready.

Texture: Translucent aqua blue-green hand-blown glass ball with tiny bubbles and a glossy surface, coarse dark brown knotted rope net. Realistic materials.

**campfire-logs** (the fire, coals and sparks are code)
> A campfire log teepee, unlit: five split firewood logs leaning in at an angle against each other, their tops meeting in a point over the middle and their bottoms spread out in a circle on the ground, like a cone. Rough bark, charred black at the bottoms, a little ash underneath. 1 metre tall. Realistic PBR, game-ready.

Texture: Rough dark brown oak bark on the logs, pale split wood faces, charred black ends at the bottom, grey white ash and small embers underneath. Realistic materials.

**log-bench** (stretched in code to the bench's 1.5 m)
> A single round tree log lying on its side on the ground as a seat, 1.5 metres long and 35 cm thick, rough grey-brown bark, sawn flat ends showing growth rings, a few knots. Only the log, nothing on top of it. Realistic PBR, game-ready.

Texture: Rough grey-brown weathered oak bark, pale sawn end grain with growth rings, worn smooth on top where people sit. Realistic materials.

**bar-stool** (two tries came out as bentwood cafe stools; "thick light tan bamboo poles with visible nodes" fixed it)
> A Polynesian tiki bar stool built from thick light tan bamboo poles with visible nodes and joints: four straight bamboo legs, two bamboo cross rings, and a round padded seat covered in woven rattan, lashed together with dark cane strips. Chunky and rustic, 1950s Hawaiian style. 75 cm tall. Realistic PBR, game-ready.

Texture: Light tan bamboo poles with darker nodes, a woven natural rattan seat top, dark brown cane lashing at the joints. Realistic materials.

**The second run** (generated 2026-10-11):

**outrigger-canoe** (turned a quarter round to lie along z; the first try had no float)
> A traditional Hawaiian outrigger canoe on a beach: a long narrow carved wooden main hull with upturned ends, and to its left side a separate thin log float running parallel to it, connected to the hull by two curved wooden crossbeams (iako) lashed with rope, so it looks like a catamaran with one small float. A paddle across the hull. 3 metres long. Realistic PBR, game-ready.

Texture: Dark brown weathered koa wood hull with carved details, lighter wood float and crossbeams, tan coconut fibre rope lashings, a worn wooden paddle. Realistic materials.

**signpost** (the post only; the lettered boards stay code. "A tiki head on top" gave a head half the post's height)
> A tall thin wooden signpost pole, 2.3 metres tall and only 15 cm thick, straight and round, dark weathered wood, with a small carved tiki face on the top 30 cm of the pole only, the same width as the pole. Mostly plain pole. Realistic PBR, game-ready.

Texture: Dark brown weathered carved wood, deeper grooves in the carved face, slightly cracked and worn. Natural wood only, no paint.

**tiki-torch** (it came out upside down: `rotate` turns it over; the wick and fire are code)
> A Hawaiian tiki torch stuck straight into the ground: one tall thin bamboo pole 2.2 metres high with visible nodes, no stand, no base, no legs. At the top, a small cup woven from split bamboo with a metal fuel canister and wick inside, lashed to the pole with rope. Unlit, no flame. Realistic PBR, game-ready.

Texture: Light tan bamboo with darker nodes, a woven split bamboo cup, a dark sooty metal fuel canister, tan rope lashing. Realistic materials.

**lantern-post** (`anchors.arm`: how far its arm reaches from the model's middle; the first try had leaves and a noose)
> A plain thin bamboo pole 1.5 metres tall stuck straight into the ground, with one short straight bamboo crossbar sticking out horizontally from near its top on one side, tied on with a few turns of rope. No leaves, no rope hanging down, nothing else. Realistic PBR, game-ready.

Texture: Light tan bamboo with darker nodes and natural weathering, tan rope lashing. Realistic materials.

**lantern** (`glow` lights its glass from its own texture)
> A small vintage hanging hurricane lantern: a dark iron hood cap on top with a wire hanging loop, a short glass chimney in the middle glowing warm amber from a flame inside, a round dark iron base. 30 cm tall. Realistic PBR, game-ready.

Texture: Dark weathered black iron hood, frame, wire handle and base, a little rust, clear glass chimney glowing warm amber orange from the lit wick inside.

**rum-tall, rum-square, rum-gin, rum-slim**: the rum wall, four shapes in turn along the shelves. Ask for labels with no readable words: Meshy's lettering comes out as near-words ("RUUM").
> A single bottle of dark aged rum: a tall round glass bottle with sloping shoulders and a short neck, filled with dark amber rum, a cream paper label with an old-fashioned engraved design, a black screw cap. Standing upright, nothing else. Realistic PBR, game-ready.

> A single short wide bottle of aged rum: a squat cylindrical glass bottle with rounded shoulders and a short neck, full of deep amber rum, a plain dark paper label with no words, a cork stopper with a wooden top. Standing upright, nothing else. Realistic PBR, game-ready.

> A single square-shouldered bottle of gin: a tall glass bottle with a squarish body and short neck, clear glass with a faint green tint, a printed white and blue label, a silver cap. Standing upright, nothing else. Realistic PBR, game-ready.

> A single tall slim bottle of liqueur: a narrow glass bottle with a long elegant neck, filled with bright orange red liqueur, a vintage paper label, a gold foil capsule on the neck. Standing upright, nothing else. Realistic PBR, game-ready.

Textures: clear glass showing the spirit inside, a paper label with a simple border and no readable words, the cap or cork.

The hammock stays code: its cloth sags between the palms as you lie in it, and there's no frame to model.

## Licence check before committing a model
Whatever you generate is published on a public website. Use a tier whose licence allows
public commercial use without attribution conflicts (e.g. Meshy's paid tiers keep output
private and commercially usable; free tiers are CC BY 4.0 and public). Note the source and
licence of each file in this folder's README.

## Optimising
From `tools/`: `npx gltf-transform optimize in.glb ../assets/models/hero/out.glb --compress meshopt --texture-compress webp --texture-size 1024`

Budget: under 15k triangles each and under 2 MB for all of them. Small props that appear
many times (mugs, lamps, the volcano bowl) get `--texture-size 512` and a few thousand
triangles. Meshy's UV seams stop `gltf-transform simplify` short, so to cut a generated
model's triangles use Meshy's remesh API on its refine task instead
(`POST /openapi/v1/remesh` with `input_task_id` and `target_polycount`; it re-bakes the textures).
