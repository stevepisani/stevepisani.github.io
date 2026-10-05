// SJPJr's MCP server, for ChatGPT and Claude (docs/apps.md): https://<ref>.supabase.co/functions/v1/mcp
// MCP over Streamable HTTP, stateless (server.js has the tools and the JSON-RPC). Signing in is
// OAuth 2.1 through Supabase Auth's OAuth server: a request without a valid token gets a 401
// pointing at this server's protected-resource metadata, which names Supabase Auth as the
// authorization server; the app (ChatGPT or Claude) registers itself there, sends Steve to the consent page
// (/apps/authorize), and comes back with an access token for him. Every query then runs as him,
// so row-level security decides what it sees, as in the app. Deployed with --no-verify-jwt
// (.github/workflows/supabase.yml): the discovery request carries no token, and tokens are
// checked here. It also answers at https://mcp.stevenpisani.com, through the proxy in proxy/
// (Cloudflare Pages), which says so with an x-mcp-public-host header: then the addresses it
// gives out (RFC 9728's resource, the 401's metadata link) are that one.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PROTOCOLS, rpc } from "./server.js";
import { fetchLimited, readProduct, storeImage } from "../_shared/product.js";
import { legWeather, locate } from "../_shared/weather.js";

const SUPABASE = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESOURCE = `${SUPABASE}/functions/v1/mcp`;
const PUBLIC_HOSTS = ["mcp.stevenpisani.com"];
const SCOPES = ["openid", "email", "profile"];
// who may call from a browser page (ChatGPT and Claude call from their servers, with no Origin)
const ORIGINS = /^https:\/\/([a-z0-9-]+\.)*(chatgpt\.com|openai\.com|claude\.ai|claude\.com|anthropic\.com|stevenpisani\.com)$/;
const DAY = 60 * 60 * 24;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/gif": "gif" };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const unauthorized = (why: string, resource: string) =>
  json({ error: "unauthorized", error_description: why }, 401, { "www-authenticate": `Bearer resource_metadata="${resource}/.well-known/oauth-protected-resource", scope="${SCOPES.join(" ")}", error="invalid_token"` });

// the in-chat card's script, from the site (server.js puts it in the card's page); kept ten minutes
let card: { at: number; js: string } | null = null;
const cardScript = async () => {
  if (card && Date.now() - card.at < 600_000) return card.js;
  const res = await fetch("https://stevenpisani.com/assets/js/dist/mcp-app.js", { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`card script: HTTP ${res.status}`);
  card = { at: Date.now(), js: await res.text() };
  return card.js;
};

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  const host = req.headers.get("x-mcp-public-host");
  const resource = host && PUBLIC_HOSTS.includes(host) ? `https://${host}` : RESOURCE; // the address the app used
  // RFC 9728: who guards this server, and how to ask for a token
  if (path.endsWith("/.well-known/oauth-protected-resource")) {
    return json({ resource, authorization_servers: [`${SUPABASE}/auth/v1`], bearer_methods_supported: ["header"], scopes_supported: SCOPES, resource_name: "SJPJr", resource_documentation: "https://stevenpisani.com/apps/wardrobe" }, 200, { "access-control-allow-origin": "*" });
  }
  // the transport's checks (MCP 2025-11-25): a page elsewhere can't use a browser's way in, and
  // a protocol this server doesn't speak is said plainly
  const origin = req.headers.get("origin");
  if (origin && !ORIGINS.test(origin)) return json({ error: "forbidden", error_description: "Not from an app this server works with." }, 403);
  const version = req.headers.get("mcp-protocol-version");
  if (version && !PROTOCOLS.includes(version)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Unsupported MCP-Protocol-Version ${version}; this server speaks ${PROTOCOLS.join(", ")}.` } }, 400);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id", "access-control-allow-methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json({ error: "POST only: this server keeps no stream open." }, 405, { allow: "POST" });

  const token = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return unauthorized("Sign in first.", resource);
  // "Authorization", spelled as supabase-js spells it: another spelling is sent alongside its own,
  // as "Bearer t, Bearer t", which Supabase Auth refuses
  const db = createClient(SUPABASE, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error } = await db.auth.getUser(token);
  if (error || !who?.user) {
    // why, for the logs (tools/supabase-logs.mjs): the error and the token's non-personal claims
    let claims: Record<string, unknown> = {};
    try { claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { /* not a JWT */ }
    const { aud, iss, role, scope, exp, client_id } = claims as Record<string, unknown>;
    console.warn("mcp: token refused:", error?.message, JSON.stringify({ aud, iss, role, scope, client: !!client_id, email: "email" in claims, expired: typeof exp === "number" && exp * 1000 < Date.now() }));
    return unauthorized("That sign-in has expired or isn't valid.", resource);
  }
  const { data: member } = await db.rpc("is_member");
  if (member !== true) { console.warn("mcp: not a member"); return json({ error: "forbidden", error_description: "Members only." }, 403); }
  const uid = who.user.id;

  // what the server reads and writes, as this person (server.js lists what each does)
  // deno-lint-ignore no-explicit-any
  const rows = async (q: any) => { const { data, error } = await q; if (error) throw error; return data; };
  // deno-lint-ignore no-explicit-any
  const one = async (q: any) => { const { data, error } = await q; if (error && error.code !== "22P02") throw error; return data ?? null; }; // 22P02: not an id at all
  const closet = (id: string) => one(db.from("wardrobe_closet").select("*").eq("id", id).maybeSingle());
  const table = (name: string) => ({
    get: (id: string) => one(db.from(name).select("*").eq("id", id).maybeSingle()),
    add: (row: Record<string, unknown>) => rows(db.from(name).insert(row).select().single()),
    set: (id: string, patch: Record<string, unknown>) => rows(db.from(name).update(patch).eq("id", id).select().single()),
  });
  const ctx = {
    items: {
      list: () => rows(db.from("wardrobe_closet").select("*")),
      get: closet,
      own: (id: string) => one(db.from("wardrobe_items").select("*").eq("id", id).maybeSingle()),
      add: async (row: Record<string, unknown>) => closet((await rows(db.from("wardrobe_items").insert(row).select("id").single())).id),
      set: async (id: string, patch: Record<string, unknown>) => (await one(db.from("wardrobe_items").update(patch).eq("id", id).select("id").maybeSingle())) && closet(id),
    },
    products: { ...table("wardrobe_products"), list: () => rows(db.from("wardrobe_products").select("*")) },
    variants: { ...table("wardrobe_variants"), list: (productId: string) => rows(db.from("wardrobe_variants").select("*").eq("product_id", productId)) },
    photos: {
      ...table("wardrobe_photos"),
      list: (itemId: string) => rows(db.from("wardrobe_photos").select("*").eq("item_id", itemId).order("created_at").order("id")),
      forItems: (itemIds: string[]) => rows(db.from("wardrobe_photos").select("*").in("item_id", itemIds).order("created_at").order("id")),
      byFile: (fileId: string) => one(db.from("wardrobe_photos").select("*").eq("file_id", fileId).limit(1).maybeSingle()),
      add: async (list: Record<string, unknown>[]) => { await rows(db.from("wardrobe_photos").insert(list)); },
    },
    photoUrls: async (paths: string[]) => {
      if (!paths.length) return new Map();
      const { data } = await db.storage.from("photos").createSignedUrls(paths, DAY);
      return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    },
    readProduct,
    storeImage: (image: string) => storeImage(db, uid, image),
    // a photo uploaded in the chat: fetched from ChatGPT's short-lived link and kept in the person's folder
    storeUpload: async (file: { download_url: string; mime_type?: string }) => {
      try {
        const res = await fetchLimited(new URL(file.download_url), "image/*", 15 * 1024 * 1024 + 1);
        const type = (file.mime_type || res.headers.get("content-type") || "").split(";")[0].toLowerCase();
        if (!res.ok || !PHOTO_TYPES[type] || !res.bytes?.length || res.bytes.length > 15 * 1024 * 1024) return null;
        const path = `wardrobe/${uid}/${Date.now()}-${crypto.randomUUID().slice(0, 4)}.${PHOTO_TYPES[type]}`;
        const { error } = await db.storage.from("photos").upload(path, res.bytes, { contentType: type });
        if (error) { console.error(error); return null; }
        return path;
      } catch (e) { console.error(e); return null; }
    },
    trips: {
      list: async () => { const { data, error } = await db.from("trips").select("*"); if (error) throw error; return data; },
      get: async (id: string) => { const { data, error } = await db.from("trips").select("*").eq("id", id).maybeSingle(); if (error && error.code !== "22P02") throw error; return data; },
      add: async (row: Record<string, unknown>) => { const { data, error } = await db.from("trips").insert(row).select().single(); if (error) throw error; return data; },
      set: async (id: string, patch: Record<string, unknown>) => { const { data, error } = await db.from("trips").update(patch).eq("id", id).select().maybeSingle(); if (error && error.code !== "22P02") throw error; return data; },
    },
    cardScript,
    storageOrigin: SUPABASE, // where the photos load from, for the card's allowed sources
    locate,
    weather: (leg: { lat: number; lon: number; from: string; to: string }) => legWeather(leg),
  };

  let body: unknown;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Not JSON." } }, 400); }
  const answers = (await Promise.all((Array.isArray(body) ? body : [body]).map((m) => rpc(m, ctx)))).filter(Boolean);
  if (!answers.length) return new Response(null, { status: 202 }); // only notifications
  return json(Array.isArray(body) ? answers : answers[0]);
});
