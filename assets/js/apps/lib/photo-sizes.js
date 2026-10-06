// The app's own copies of a photo: the stored file is often a 1254 px PNG of 2 MB or more (a
// catalog image), far more than a tile 170 px wide needs, and slow on a phone. So each photo has
// two WebP copies beside it (transparency kept, for cut-outs): `small` for tiles, flat-lays and
// thumbnails, `large` for the photo in a garment's sheet, both sharp on a 3x screen. The app makes
// them when it uploads a photo; tools/photo-copies.mjs makes any that are missing every hour (a
// photo added through ChatGPT, or an older one); the trash takes them with the photo. Until a
// copy exists, the app shows the stored file. docs/apps.md, "Photo sizes".
export const SIZES = { small: 512, large: 1080 };
export const QUALITY = 0.8;
export const copyPath = (path, px) => `${path}.w${px}`;
export const copyPaths = (path) => Object.values(SIZES).map((px) => copyPath(path, px));
