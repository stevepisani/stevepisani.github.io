// Images as the model sees them (get_photo, get_photos, get_outfit_images, test_image(s)): MCP image
// content, sized so an answer gets through. Why sizes matter: ChatGPT carries a tool's answer over
// gRPC, which drops one past about 4 MB (two 2.6 MB catalog PNGs, base64, failed; one went through).
// So every answer's images share BUDGET, and anything but "original" is a smaller copy, made once
// with ImageScript (ctx.imaging: npm imagescript, the same version in index.ts and package.json) and
// kept beside the stored file in Storage (<path>.vision.jpg, .thumbnail.jpg). The stored file itself
// is never changed. docs/apps.md, "Seeing a photo".

// all the images in one answer, as base64 characters (gRPC's 4 MiB, less room for the rest)
export const BUDGET = 3_800_000;
export const PURPOSES = {
  original: null, // the stored file, unchanged
  // for looking at (fabric, pattern, colour, cut): the first try that comes in under cap, so six
  // always fit in one answer (6 × 400 KB is 3.2 M base64 characters)
  vision: { cap: 400_000, tries: [[1024, 86], [1024, 72], [896, 68], [768, 64]] },
  thumbnail: { cap: 60_000, tries: [[256, 80], [256, 65]] }, // for a glance
};
export const renditionPath = (path, purpose) => `${path}.${purpose}.jpg`;

// what a file is, from its first bytes (not its name)
export function sniff(b) {
  const at = (i, s) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && at(1, "PNG")) return "image/png";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  if (at(0, "GIF8")) return "image/gif";
  if (at(4, "ftypavif") || at(4, "ftypavis")) return "image/avif";
  return null;
}
export const base64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
export const b64Length = (n) => 4 * Math.ceil(n / 3);

// A smaller copy for `purpose`, as JPEG on white (a transparent PNG's background), or null when
// the file can't be read (a format ImageScript doesn't decode) or is already small enough. Tries
// sizes and qualities in turn until one comes in under the cap (the last try is kept regardless).
// (ImageScript is CommonJS: its parts may sit on the module or its default, by runtime; ctx.imaging
// may also be a function that loads it)
const lib = async (m) => { const x = typeof m === "function" ? await m() : m; return x?.decode ? x : x?.default; };
export async function shrink(module, bytes, purpose) {
  const want = PURPOSES[purpose], imaging = want && (await lib(module));
  if (!want || !imaging) return null;
  let img;
  try { img = await imaging.decode(bytes); } catch { return null; }
  if (Math.max(img.width, img.height) <= want.tries[0][0] && bytes.length <= want.cap) return null;
  let out;
  for (const [px, quality] of want.tries) {
    const scale = Math.min(1, px / Math.max(img.width, img.height));
    const sized = scale < 1 ? img.clone().resize(Math.round(img.width * scale), Math.round(img.height * scale)) : img;
    const flat = new imaging.Image(sized.width, sized.height).fill(0xffffffff);
    flat.composite(sized, 0, 0);
    out = { bytes: await flat.encodeJPEG(quality), width: sized.width, height: sized.height };
    if (out.bytes.length <= want.cap) break;
  }
  return out;
}

// The file to send for a photo: the stored one, or its copy for `purpose` (made and kept the first
// time; if it can't be made, the stored file, said so)
export async function photoBytes(ctx, path, purpose = "original") {
  const stored = async () => { const b = await ctx.photoFile(path).catch(() => null); return b && { bytes: b, purpose: "original" }; };
  if (purpose === "original") return stored();
  const key = renditionPath(path, purpose);
  const kept = await ctx.photoFile(key).catch(() => null);
  if (kept?.length) return { bytes: kept, purpose };
  const orig = await stored();
  if (!orig) return null;
  const made = await shrink(ctx.imaging, orig.bytes, purpose);
  if (!made) return orig;
  await ctx.saveFile?.(key, made.bytes, "image/jpeg").catch(() => null); // a nicety: next time it's read, not made
  return { bytes: made.bytes, purpose };
}

// Deterministic test pictures, each easy to say in words: test_images
export const TEST_PICTURES = [
  ["red", (x, y) => 0xdc1e1eff],
  ["blue", (x, y) => 0x1e3cdcff],
  ["green", (x, y) => 0x1eaa3cff],
  ["yellow", (x, y) => 0xf5d214ff],
  ["a black and white checkerboard, 8 by 8", (x, y, s) => ((Math.floor((x * 8) / s) + Math.floor((y * 8) / s)) % 2 ? 0xffffffff : 0x000000ff)],
  ["a white circle on black", (x, y, s) => ((x - s / 2) ** 2 + (y - s / 2) ** 2 < (s * 0.35) ** 2 ? 0xffffffff : 0x000000ff)],
];
// A PNG from a paint(x, y, size) → 0xRRGGBBAA function, written here (CompressionStream's deflate
// is zlib's, what PNG wants), so the tests of delivery depend on nothing else
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const be32 = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type, data) => { const td = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat([...data])); return [...be32(data.length), ...td, ...be32(crc32(td))]; };
export async function testPicture(n, px) {
  const [, paint] = TEST_PICTURES[n];
  const raw = new Uint8Array((px * 3 + 1) * px);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { const c = paint(x, y, px) >>> 0, o = y * (px * 3 + 1) + 1 + x * 3; raw[o] = c >>> 24; raw[o + 1] = (c >>> 16) & 255; raw[o + 2] = (c >>> 8) & 255; }
  const idat = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr = [...be32(px), ...be32(px), 8, 2, 0, 0, 0];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", ihdr), ...chunk("IDAT", idat), ...chunk("IEND", [])]);
}
