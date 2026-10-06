// Images as the model sees them (get_photo, get_photos, get_outfit_images, test_image(s)): MCP image
// content, sized so an answer gets through. Why sizes matter: ChatGPT carries a tool's answer over
// gRPC, which drops one past about 4 MB (two 2.6 MB catalog PNGs, base64, failed; one went through).
// So every answer's images share BUDGET, and anything but "original" is a smaller copy, made once
// with ImageScript (ctx.imaging: on the server its Deno build, 1.3.0 from deno.land, all WebAssembly;
// in Node and the tests the npm one, package.json's, which uses native code the edge can't load) and
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

// ---------- An outfit board: get_outfit_images, purpose board ----------
// The garments' photos laid out as one picture, made here from the stored files (their vision
// copies), resized and placed, never redrawn: so it costs nothing and can't get a garment wrong.
// BOARD_WIDTH wide, on the photos' own background (boardGround), in a grid read left to right, top to bottom, in the order given: one
// garment fills it; up to four sit two a row; five or six, three a row. A short last row is centred.
export const BOARD_WIDTH = 1200;
export function boardLayout(n) {
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, cell = Math.floor(BOARD_WIDTH / cols), rows = Math.ceil(n / cols);
  const cells = Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols);
    return { x: Math.floor((BOARD_WIDTH - inRow * cell) / 2) + (i % cols) * cell, y: row * cell, size: cell };
  });
  return { width: BOARD_WIDTH, height: rows * cell, cells };
}
// The colour the photos sit on, so they read as one picture, not tiles: each photo's four corners
// (the catalog images share a pale grey), their median channel by channel, opaque; white when a
// corner is see-through or the corners disagree (photos on their own backgrounds)
export function boardGround(imaging, images) {
  const corners = images.flatMap((img) => [[1, 1], [img.width, 1], [1, img.height], [img.width, img.height]].map(([x, y]) => imaging.Image.colorToRGBA(img.getPixelAt(x, y))));
  if (!corners.length || corners.some((c) => c[3] < 250)) return 0xffffffff;
  const mid = [0, 1, 2].map((k) => corners.map((c) => c[k]).sort((a, b) => a - b)[corners.length >> 1]);
  if (corners.some((c) => Math.max(...[0, 1, 2].map((k) => Math.abs(c[k] - mid[k]))) > 24)) return 0xffffffff;
  return imaging.Image.rgbaToColor(...mid, 255);
}
// pictures: the files' bytes, in order. The board as a JPEG with where each landed, or null when
// ImageScript isn't there; a picture it can't read is left out, its cell blank, and said
export async function board(module, pictures) {
  const imaging = await lib(module);
  if (!imaging) return null;
  const { width, height, cells } = boardLayout(pictures.length);
  const decoded = [];
  for (const bytes of pictures) { try { decoded.push(await imaging.decode(bytes)); } catch { decoded.push(null); } }
  const out = new imaging.Image(width, height).fill(boardGround(imaging, decoded.filter(Boolean))), placed = [];
  for (const [i, img] of decoded.entries()) {
    if (!img) { placed.push(null); continue; }
    const c = cells[i], room = c.size - 2 * Math.round(c.size * 0.04), scale = Math.min(room / img.width, room / img.height);
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
    const x = c.x + Math.floor((c.size - w) / 2), y = c.y + Math.floor((c.size - h) / 2);
    out.composite(img.resize(w, h), x, y);
    placed.push({ x, y, width: w, height: h });
  }
  return { bytes: await out.encodeJPEG(85), width, height, placed };
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

// A file's width and height from its header (PNG, JPEG, WebP, GIF), or null: nothing decoded
export function dimensions(b) {
  const type = sniff(b), u16 = (i) => (b[i] << 8) | b[i + 1], le16 = (i) => b[i] | (b[i + 1] << 8), le24 = (i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (type === "image/png") return { width: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, height: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 };
  if (type === "image/gif") return { width: le16(6), height: le16(8) };
  if (type === "image/webp") {
    const kind = String.fromCharCode(...b.subarray(12, 16));
    if (kind === "VP8 ") return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    if (kind === "VP8L") return { width: 1 + (((b[22] & 0x3f) << 8) | b[21]), height: 1 + (((b[24] & 0xf) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
    if (kind === "VP8X") return { width: 1 + le24(24), height: 1 + le24(27) };
  }
  if (type === "image/jpeg") {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

// ---------- Links to a photo, for an image generator: get_outfit_images, purpose generation ----------
// https://mcp.stevenpisani.com/photo/<token>: the token is the photo's id and when the link stops
// working, signed (HMAC-SHA256) with a key only the server has (index.ts: its service key), so it
// can't be guessed or altered, names no file, and is good for LINK_MINUTES. The server answers it
// with the stored file, unchanged (servePhoto), and nothing else: no listing, no writing.
export const LINK_MINUTES = 15;
const b64url = (bytes) => base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hmac = async (secret, text) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
};
export async function photoToken(secret, photoId, expiresAt) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ i: photoId, e: Math.floor(expiresAt / 1000) })));
  return `${body}.${b64url(await hmac(secret, body))}`;
}
// the photo id a token names, if it's ours, unaltered and not yet expired; null otherwise
export async function readPhotoToken(secret, token, now = Date.now()) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !/^[\w-]+$/.test(body + sig)) return null;
  const want = await hmac(secret, body), got = (() => { try { return unb64url(sig); } catch { return null; } })();
  if (!got || got.length !== want.length || got.some((v, i) => v !== want[i])) return null;
  let claim;
  try { claim = JSON.parse(new TextDecoder().decode(unb64url(body))); } catch { return null; }
  return typeof claim?.i === "string" && claim.e * 1000 > now ? claim.i : null;
}
// The answer to a photo link: the file as stored, or 404 for anything else (an altered or expired
// link, a photo since deleted). find(id) → its path or null (as the server, any owner's: the
// signature is what grants it); file(path) → bytes or null.
export async function servePhoto(token, { secret, find, file, now = Date.now() }) {
  const gone = () => new Response("Not found, or this link has expired.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const id = await readPhotoToken(secret, token, now);
  const path = id && (await find(id).catch(() => null));
  const bytes = path && (await file(path).catch(() => null));
  const type = bytes && sniff(bytes);
  if (!type) return gone();
  const left = Math.max(0, JSON.parse(new TextDecoder().decode(unb64url(token.split(".")[0]))).e - Math.floor(now / 1000));
  return new Response(bytes, { status: 200, headers: { "content-type": type, "content-length": String(bytes.length), "cache-control": `private, max-age=${left}`, "x-content-type-options": "nosniff", "content-disposition": "inline" } });
}
