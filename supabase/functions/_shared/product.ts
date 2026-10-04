// Reads a shop's product page for what the wardrobe wants: the name, brand, picture and price.
// Shops say these for search engines and link previews, in JSON-LD (schema.org Product) or
// Open Graph tags, so no shop-specific code. Some shops refuse anything that isn't a browser;
// then there's nothing to read, and the caller keeps just the link.
export type Product = { url: string; name?: string; brand?: string; image?: string; price?: number; currency?: string };

const MAX_HTML = 2_000_000, TIMEOUT = 8000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

/** An http(s) address on the open internet, or null (no local or private hosts: this runs on a server). */
export function publicUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.startsWith("[")) return null;
  return u;
}

export async function fetchLimited(url: URL, accept: string, max: number): Promise<Response & { bytes?: Uint8Array }> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept, "accept-language": "en-US,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
  const reader = res.body?.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { await reader.cancel(); break; }
    parts.push(value);
  }
  const bytes = new Uint8Array(Math.min(n, max));
  let at = 0;
  for (const p of parts) { bytes.set(p.subarray(0, bytes.length - at), at); at += p.length; if (at >= bytes.length) break; }
  return Object.assign(res, { bytes });
}

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, "&").trim();
const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

export async function readProduct(raw: string): Promise<Product> {
  const url = publicUrl(raw);
  if (!url) throw new Error("That isn't a web address.");
  const out: Product = { url: url.href };
  let html = "";
  try {
    const res = await fetchLimited(url, "text/html,application/xhtml+xml", MAX_HTML);
    if (!res.ok) return out;
    html = new TextDecoder().decode(res.bytes);
    out.url = res.url || out.url;
  } catch { return out; }

  // JSON-LD: a Product, maybe inside an array or an @graph
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const all: any[] = [];
    const walk = (x: any) => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) return x.forEach(walk); all.push(x); if (x["@graph"]) walk(x["@graph"]); };
    walk(data);
    const p = all.find((x) => [].concat(x["@type"]).some((t: string) => /^(Product|ProductGroup)$/i.test(t)));
    if (!p) continue;
    out.name ??= p.name && decode(String(p.name));
    const brand = first(p.brand);
    out.brand ??= brand && decode(typeof brand === "string" ? brand : String(brand.name || ""));
    const img = first(p.image);
    out.image ??= img && (typeof img === "string" ? img : img.url || img.contentUrl);
    const offer = first(p.offers?.offers) || first(p.offers) || first(p.hasVariant)?.offers;
    const o = first(offer);
    const price = parseFloat(o?.price ?? o?.lowPrice ?? o?.priceSpecification?.price);
    if (!isNaN(price)) { out.price ??= price; out.currency ??= o?.priceCurrency || o?.priceSpecification?.priceCurrency; }
    break;
  }
  // Open Graph and friends
  const meta = (key: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*>`, "i");
    const tag = re.exec(html)?.[0];
    return tag ? decode(/content=["']([^"']*)["']/i.exec(tag)?.[1] || "") || undefined : undefined;
  };
  out.name ??= meta("og:title") || meta("twitter:title") || decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || "") || undefined;
  out.brand ??= meta("product:brand") || meta("og:brand") || meta("og:site_name");
  out.image ??= meta("og:image:secure_url") || meta("og:image") || meta("twitter:image");
  const price = parseFloat(meta("product:price:amount") || meta("og:price:amount") || "");
  if (!isNaN(price)) { out.price ??= price; out.currency ??= meta("product:price:currency") || meta("og:price:currency"); }
  if (out.image) { try { out.image = new URL(out.image, out.url).href; } catch { delete out.image; } }
  if (out.currency) out.currency = /^[A-Za-z]{3}$/.test(out.currency) ? out.currency.toUpperCase() : undefined;
  if (out.name) out.name = out.name.slice(0, 120);
  return out;
}
