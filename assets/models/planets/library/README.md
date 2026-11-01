# Accepted scene library inputs

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
