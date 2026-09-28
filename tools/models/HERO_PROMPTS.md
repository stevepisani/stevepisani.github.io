# Hero props: generation guide

The homepage world has slots for hand-made or AI-generated "hero" props. Each slot has a
procedural stand-in; drop a GLB in `assets/models/hero/`, list it in
`assets/models/hero/manifest.json`, and it replaces the stand-in on the next load.

```json
{
  "tiki-statue":  { "file": "tiki-statue.glb",  "height": 2.7 },
  "tiki-post":    { "file": "tiki-post.glb",    "height": 2.7 },
  "tiki-mug":     { "file": "tiki-mug.glb",     "height": 0.17, "roughness": 0.3 },
  "puffer-lamp":  { "file": "puffer-lamp.glb",  "height": 0.5 },
  "volcano-bowl": { "file": "volcano-bowl.glb", "height": 0.13, "roughness": 0.35 },
  "moai":         { "file": "moai.glb",         "height": 2.4, "roughness": 0.95 }
}
```

Models are auto-scaled to `height` (metres), centred, and set on the ground. Optional keys:
`rotateY` (radians, if the model faces the wrong way; the front should face +Z),
`roughness`, `metalness`. Lights and fire are added by the world, so don't bake them in.

## Art direction for every prop
Mid-century American "Polynesian Pop" (1950s–60s tiki bars: Trader Vic's, Mai-Kai,
Tiki-Ti), *not* a replica of any real sacred carving. Invented pop tiki faces in the
Witco / Shag spirit. Moody, realistic materials, lit at night by warm lamps.

- **Palette:** dark tiki stain `#4A2C1A`, bamboo `#C9A66B`, lava black `#1B1412`,
  amber `#F2A541`, coral `#E8634A`, deep teal `#0F5E63`, float aqua `#5FC7C4`.
- **Budget:** at most 10–15k triangles and one 1024px texture set per prop
  (hero statue: up to 25k). Web-first: low-poly silhouette, detail in the textures.
- **Export:** GLB, PBR (base colour + normal + roughness; metallic only if metal),
  Y-up, real-world scale if the tool allows. No lights, no cameras, no ground plane.

## Prompts (Meshy / Tripo / Rodin text-to-3D)

**tiki-statue**: the hero at the entrance
> A 2.7 metre tall carved wooden tiki statue in mid-century American Polynesian Pop style, Marquesan-inspired: huge oval eyes, heavy brow, broad flat nose, very wide open mouth with a tongue, hands resting on the belly, squat proportions with a big head. Dark walnut-stained cedar, chainsaw and chisel marks, lighter wire-brushed high points, darker burnt recesses. Standing on a small base. Realistic PBR, game-ready, low poly with detailed normal map.

**tiki-post**: holds up the roof (four of them)
> A tall cylindrical carved tiki pole, 2.7 metres, used as an architectural post in a 1950s tiki bar: a stylised invented tiki face in the upper half (bold brow, lozenge eyes, wide mouth with bared teeth), carved bands and zigzag patterns below. Dark stained wood, weathered, burnt accents. Even thickness top to bottom, flat top and bottom. Realistic PBR, game-ready.

**tiki-mug**
> A ceramic tiki mug, 17 cm tall, classic 1960s shape: slightly waisted cylinder with a pressed tiki face (heavy brow, big eyes, wide grin), glossy drip glaze in deep teal fading to brown at the base. Open top, hollow. Realistic PBR ceramic, game-ready.

**puffer-lamp**
> A hanging pufferfish lamp from a tiki bar: an inflated dried pufferfish, round and spiky, with small fins, tail and eyes, translucent tan skin that would glow when lit from inside, a short cord on top. 50 cm. Realistic PBR, game-ready.

**volcano-bowl**
> A tiki volcano bowl: a wide, shallow dark ceramic punch bowl with a raised central cone (the "volcano") in the middle for flaming rum, glossy dark brown lava glaze with orange drips. 13 cm tall, 35 cm wide. Realistic PBR, game-ready.

**moai**
> A weathered Easter Island moai-style head, stylised for a 1950s tiki bar garden: long rectangular face, heavy brow, long nose, tight lips, elongated ears, carved from porous dark grey lava rock with moss in the crevices. 2.4 metres tall. Realistic PBR, game-ready.

## Licence check before committing a model
Whatever you generate is published on a public website. Use a tier whose licence allows
public commercial use without attribution conflicts (e.g. Meshy's paid tiers keep output
private and commercially usable; free tiers are CC BY 4.0 and public). Note the source and
licence of each file in this folder's README.

## Optimising
From `tools/`: `npx gltf-transform optimize in.glb ../assets/models/hero/out.glb --compress meshopt --texture-compress webp --texture-size 1024`
