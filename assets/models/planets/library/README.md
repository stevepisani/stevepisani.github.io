# Accepted scene library inputs

## Small furnishings

Five static models from [Kay Lousberg's KayKit Furniture Bits 1.0](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0)
at `96d5930a8dbdb363409bbc2d3341718b00e17c9c`: `reading-chair-v1`, `side-table-v1`,
`books-v1`, `book-v1` and `table-lamp-v1`. The author's CC0 notice is preserved in
`KayKit-LICENSE.txt`; original resource hashes, selected names, dimensions, triangle counts,
changes and output hashes are in `furniture-provenance.json`. The five GLBs total 46,676 bytes.

`node tools/planet-furniture.mjs <source checkout> <separate review output folder>` imports
only these selections through the pinned optimizer. It normalizes metres and a centred foot,
sets roughness .85 and embeds 512 px WebP with meshopt, without simplifying geometry. It never
downloads, starts a paid job or overwrites changed accepted bytes. Versions remain separate.
Front/back inspection uses the actual renderer; final owner/style acceptance remains open.

`planet-library.js` is the measured catalog consumed by `STOCK`, its loader and the importer.
The generated stock/model cache remains intact. Only the side table declares a flat support:
its 0.70 × 0.70 m rectangle is checked against actual decoded top triangles. Tabletop objects
are independent things using `on`, not a hidden compound scene. The lamp's suggested light is
calibrated for that small surface; it is explicit scene intent, not automatically switched on.

## Woodland vegetation

`birch.glb` is derived from **BirchTree_1** in Quaternius’s Ultimate Stylized Nature Pack.
Source, original and derived hashes, modifications and the CC0 license are recorded in
`provenance.json` and `Quaternius-LICENSE.txt`. The source license’s reused pack title is
preserved with line endings normalized; the official nature-pack page independently marks the files CC0.

Supply the original glTF, bin and three textures to `node tools/planet-nature.mjs <folder>`.
The importer normalizes the foot and height, changes transparent leaves to alpha cutouts,
then uses the repository’s pinned glTF optimization path. A changed result cannot overwrite
the accepted file: review a new version/file and loader mapping. No generation or download runs.

This is environmental vegetation with a narrow trunk footprint, not an interactive asset
or an assertion that all source-pack assets match the house style. Several scene trees
share the one downloaded/parsed model. Required vegetation loads before reveal; failure
shows a retry message instead of silently revealing a primitive replacement.
