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
  "thinker":      { "file": "thinker.glb",      "height": 1.5 }
}
```

Models are auto-scaled to `height` (metres), centred, and set on the ground. Optional keys:
- `rotateY` (radians) if the model faces the wrong way; the front should face +Z.
- `roughness`, `metalness`: material factors. With PBR maps they multiply the maps
  (`roughness: 0.5` makes a glaze glossier); without a roughness map roughness defaults to 0.7.
- `tint` (a `PALETTE` key) and `brightness` (a number) multiply the base colour. Use them when
  a texture goes muddy under the bar's amber light, rather than regenerating.
- `glow`: emissive strength for things lit from inside (pufferfish lamps). It emits the
  model's own texture, so it adds no new colours.

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
