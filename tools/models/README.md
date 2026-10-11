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

`npm run models` (from the repo root) merges everything here into
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
| `tiki-post.glb` | `01a0e669-b2ad-70d0-84e7-a33c6e087f8e` | 8,000 | 373 KB | first try, simplified from 10k |
| `tiki-mug.glb` | remesh `01a0e67e-529a-721c-bbd7-a7ceda1bd114` of refine `01a0e679-c438-70f2-80af-914458579cd5` | 2,500 | 164 KB | 3rd try (the first was a black beer stein); remeshed by Meshy because UV seams stop gltf-transform simplifying it, and up to 14 are on screen; 512px textures; `tint: aqua` in the manifest brings the glaze back to teal under amber light |
| `puffer-lamp.glb` | remesh `01a0e67e-54c9-76aa-8879-b84111b23809` of refine `01a0e679-9d73-7601-a00f-cf5fc43781e9` | 4,000 | 212 KB | 3rd try (the first came out as a spiked sea mine); 512px textures; `glow` makes it lit from inside |
| `volcano-bowl.glb` | `01a0e679-87f4-72a0-993e-53ef5d1f9fa5` | 3,000 | 83 KB | 3rd try (the first was a deep pot); 512px textures |
| `moai.glb` | `01a0e679-809c-757a-8cf7-b8ac2fefee1e` | 8,000 | 294 KB | 3rd try (the first came out as painted wood) |
| `thinker.glb` | `01a0edd3-1405-771a-8c62-2aa3797390b6` (refine of preview `01a0edd1-6c37-7157-9019-7d290e8cb504`) | 14,000 | 297 KB | Rodin's Thinker (a public-domain 1880 sculpture) at the campfire (a nod to Philadelphia's Rodin Museum); first of two previews, generated 2026-09-29 |
| `parrot-mug.glb` | remesh `01a0e8fe-7d83-7127-8dfb-bc9e7cf809d1` of refine `01a0e8fc-e2cd-70fa-9563-e6cd5613662d` | 2,500 | 171 KB | on the counter and the shelf; 512px textures |
| `pineapple-mug.glb` | remesh `01a0e8fe-8075-77b1-aa97-06431fb4bb62` of refine `01a0e8fc-a283-736d-866a-52cd5d03e09d` | 2,500 | 208 KB | second of two tries (clearer mug shape); 512px textures |
| `bottle-planteray.glb` | `01a0f058-d4b3-72ea-a2a6-3e453ec42f6b` (refine of preview `01a0f056-f2e9-7519-981c-994cb78ffcf5`) | 6,600 | 249 KB | Planteray XO 20th Anniversary, for the Jungle Bird; raffia net kept; 512px textures, loaded after the reveal (`lazy`), generated 2026-09-30 |
| `bottle-campari.glb` | `01a0f058-dcb9-7799-8663-4009798e0658` (refine of preview `01a0f056-feb4-752a-a12c-d62e49f919ac`) | 4,000 | 116 KB | Campari, for the Jungle Bird and Il Professore; 512px textures, loaded after the reveal (`lazy`), generated 2026-09-30 |
| `bottle-chartreuse.glb` | `01a0f058-e617-72a4-b695-2c100bca4d8e` (refine of preview `01a0f057-080c-7654-b011-bc9afb937345`) | 4,000 | 143 KB | Green Chartreuse, for the swizzle; 512px textures, loaded after the reveal (`lazy`), generated 2026-09-30 |
| `bottle-meletti.glb` | `01a0f05a-27fc-7157-9ac4-3a898e3afc3b` (refine of preview `01a0f058-f8ac-720a-be3f-39decd145bbd`) | 4,000 | 124 KB | Meletti coffee liqueur, for the Shakerato and Il Professore; second preview (the first gave two bottles); 512px textures, loaded after the reveal (`lazy`), generated 2026-09-30 |
| `launch-console.glb` | `01a12a01-95b4-7610-840d-fd40357472bf` (refine of preview `01a12a00-6b82-77f7-937a-8c1c596736ce`) | 10,260 | 264 KB | launch control by the pad; first of two previews (the other was a long two-pedestal desk); 1024px textures; the screen, lamps and red button are placed by `anchors` in the manifest; generated 2026-10-11, 50 credits |
| `rocket.glb` | `01a12aa4-9310-7134-9dc8-ae927abcfeb6` (refine of preview `01a12aa2-e478-7796-939f-4a5550d3e21e`) | 16,207 | 596 KB | your ship on the pad; 4th try (the others: an Outer Wilds pod, a modern booster, a 1950s pulp rocket); 1024px textures; `lazy`; the flames and badge placed by `anchors` |
| `telescope-tripod.glb` | `01a12a9f-eddc-7664-b434-fbb896d08786` (refine of preview `01a12a9e-1d18-74f9-a7a4-6afd235c7538`) | 5,955 | 187 KB | under the code-built brass tube (two Meshy tubes didn't work); 512px textures; `lazy` |
| `radio-dish.glb` | `01a12aa4-9a1e-77a9-86b0-898c7612a5be` (refine of preview `01a12aa2-ebe8-71d2-8a2b-31cc821f9463`) | 8,954 | 241 KB | Contact; 2nd try (the first dish was flat); 512px textures; `lazy` |
| `message-bottle.glb` | `01a12a9f-fb8d-7030-8239-9faa11b2d141` (refine of preview `01a12a9e-37b2-720f-a33f-0f75c5b40ac0`) | 3,105 | 113 KB | at the lagoon, and the one you throw; 512px textures; `lazy` |
| `glass-float.glb` | `01a12aa2-cf1d-70f4-9be5-53bcab6a1e97` (refine of preview `01a12aa0-18b0-70dc-bae4-889fe89ca68d`) | 2,991 | 159 KB | every float, tinted in code; 2nd try (the first had one rope round its middle); 512px textures; `lazy` |
| `campfire-logs.glb` | `01a12aa2-d683-71a8-8662-56fcfd08d37b` (refine of preview `01a12aa0-1f75-7704-b9ae-acf5e9356669`) | 4,651 | 121 KB | 2nd try (the first stood the logs upright); 512px textures; `lazy` |
| `log-bench.glb` | `01a12aa2-dd51-70cb-bb5a-983d91485e17` (refine of preview `01a12aa0-26b2-742a-89e4-3d6637edf12c`) | 3,068 | 91 KB | the campfire's benches; 2nd try (the first had a plank on it); 512px textures; `lazy` |
| `bar-stool.glb` | `01a12aa4-a1cd-7398-9c85-d0ad0e9e93a9` (refine of preview `01a12aa2-f33f-751a-819a-4cbd09c40f96`) | 3,361 | 91 KB | 3rd try (two bentwood cafe stools); 512px textures; `lazy` |

The eight that replace code-built props (2026-10-11) come to 1.6 MB, all loaded after the planet is up; that run was 16 previews and 9 refines, 470 credits.

All eight come to 1.98 MB (the parrot and pineapple mugs were added in a second run on 2026-09-28, 4 generations and 2 remeshes, 130 credits). **Robot:** five tries (refines `01a0e669-b310…`, `01a0e679-89cb…`,
`01a0e679-8689…`, `01a0e67d-b488…`, `01a0e67d-ecaf…`) all gave the robot legs instead of
one wheel, however the prompt put it, so no robot file is registered and the code-built one
in `assets/js/world/robot.js` tends the bar. Run cost: 580 credits (19 generations at 30,
two remeshes at 5).
