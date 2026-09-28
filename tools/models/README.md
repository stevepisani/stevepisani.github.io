# Source models

Low-poly models by [Kenney](https://kenney.nl), released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).
Downloaded as GLB from the mirror at https://github.com/Hidencod/tge-assets.

| Folder | Kenney kit |
| --- | --- |
| `pirate-kit/` | [Pirate Kit](https://kenney.nl/assets/pirate-kit) |
| `nature-kit/` | [Nature Kit](https://kenney.nl/assets/nature-kit) |
| `food-kit/` | [Food Kit](https://kenney.nl/assets/food-kit) |
| `furniture-kit/` | [Furniture Kit](https://kenney.nl/assets/furniture-kit) |
| `space-kit/` | [Space Kit](https://kenney.nl/assets/space-kit) |

`npm run models` (from `tools/`) merges everything here into
`assets/models/props.glb`. Node names are `<kit>_<model>`.

# Hero props (`assets/models/hero/`)

Generated with [Meshy](https://www.meshy.ai) text-to-3D (API, `ai_model: latest`) on
2026-09-28: a preview (triangle topology, remeshed to a target polycount), then a refine with
PBR textures, using the shape and texture prompts in `HERO_PROMPTS.md`. Then shrunk with
gltf-transform (see "Optimising" there).

**Licence.** The API key belongs to a paid Meshy plan: Meshy's API is only offered on Pro and
above, and the account holds thousands of credits against the Free plan's 100 a month (it
started this run at 5,500). Under Meshy's Terms of Use (§3.2, updated 2026-09-19), customers on
a paid plan own their output and may keep it private; commercial use needs no attribution.
(Free-plan output would instead belong to Meshy and be CC BY 4.0 with credit to Meshy.) If
the account ever drops to the Free plan, regenerated models fall under the CC BY terms, so
credit Meshy on the site or keep using these files.

| File | Meshy task (refine, or remesh) | Triangles | Size | Notes |
| --- | --- | --- | --- | --- |
| `tiki-statue.glb` | `01a0e669-b244-71f8-9fc0-be85564f9439` | 14,000 | 432 KB | first try |
| `tiki-post.glb` | `01a0e669-b2ad-70d0-84e7-a33c6e087f8e` | 8,000 | 373 KB | first try, simplified from 10k |
| `tiki-mug.glb` | remesh `01a0e67e-529a-721c-bbd7-a7ceda1bd114` of refine `01a0e679-c438-70f2-80af-914458579cd5` | 2,500 | 164 KB | 3rd try (the first was a black beer stein); remeshed by Meshy because UV seams stop gltf-transform simplifying it, and up to 14 are on screen; 512px textures; `tint: aqua` in the manifest brings the glaze back to teal under amber light |
| `puffer-lamp.glb` | remesh `01a0e67e-54c9-76aa-8879-b84111b23809` of refine `01a0e679-9d73-7601-a00f-cf5fc43781e9` | 4,000 | 212 KB | 3rd try (the first came out as a spiked sea mine); 512px textures; `glow` makes it lit from inside |
| `volcano-bowl.glb` | `01a0e679-87f4-72a0-993e-53ef5d1f9fa5` | 3,000 | 83 KB | 3rd try (the first was a deep pot); 512px textures |
| `moai.glb` | `01a0e679-809c-757a-8cf7-b8ac2fefee1e` | 8,000 | 294 KB | 3rd try (the first came out as painted wood) |
| `parrot-mug.glb` | remesh `01a0e8fe-7d83-7127-8dfb-bc9e7cf809d1` of refine `01a0e8fc-e2cd-70fa-9563-e6cd5613662d` | 2,500 | 171 KB | on the counter and the shelf; 512px textures |
| `pineapple-mug.glb` | remesh `01a0e8fe-8075-77b1-aa97-06431fb4bb62` of refine `01a0e8fc-a283-736d-866a-52cd5d03e09d` | 2,500 | 208 KB | second of two tries (clearer mug shape); 512px textures |

All eight come to 1.98 MB (the parrot and pineapple mugs were added in a second run on 2026-09-28, 4 generations and 2 remeshes, 130 credits). **Robot:** five tries (refines `01a0e669-b310…`, `01a0e679-89cb…`,
`01a0e679-8689…`, `01a0e67d-b488…`, `01a0e67d-ecaf…`) all gave the robot legs instead of
one wheel, however the prompt put it, so no robot file is registered and the code-built one
in `assets/js/world/robot.js` tends the bar. Run cost: 580 credits (19 generations at 30,
two remeshes at 5).
