// The wardrobe's MCP server, for ChatGPT (docs/apps.md): https://<ref>.supabase.co/functions/v1/mcp
// MCP over Streamable HTTP, stateless (server.js has the tools and the JSON-RPC). Signing in is
// OAuth 2.1 through Supabase Auth's OAuth server: a request without a valid token gets a 401
// pointing at this server's protected-resource metadata, which names Supabase Auth as the
// authorization server; ChatGPT registers itself there, sends Steve to the consent page
// (/apps/authorize), and comes back with an access token for him. Every query then runs as him,
// so row-level security decides what it sees, as in the app. Deployed with --no-verify-jwt
// (.github/workflows/supabase.yml): the discovery request carries no token, and tokens are
// checked here.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { rpc } from "./server.js";
import { fetchLimited, readProduct, storeImage } from "../_shared/product.js";
import { legWeather, locate } from "../_shared/weather.js";

const SUPABASE = Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "");
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESOURCE = `${SUPABASE}/functions/v1/mcp`;
const METADATA = `${RESOURCE}/.well-known/oauth-protected-resource`;
const DAY = 60 * 60 * 24;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/gif": "gif" };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const unauthorized = (why: string) =>
  json({ error: "unauthorized", error_description: why }, 401, { "www-authenticate": `Bearer resource_metadata="${METADATA}", error="invalid_token"` });

Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  // RFC 9728: who guards this server, and how to ask for a token
  if (path.endsWith("/.well-known/oauth-protected-resource")) {
    return json({ resource: RESOURCE, authorization_servers: [`${SUPABASE}/auth/v1`], bearer_methods_supported: ["header"], scopes_supported: ["openid", "email", "profile"], resource_name: "Steve's wardrobe" }, 200, { "access-control-allow-origin": "*" });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id", "access-control-allow-methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json({ error: "POST only: this server keeps no stream open." }, 405, { allow: "POST" });

  const token = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return unauthorized("Sign in first.");
  const db = createClient(SUPABASE, ANON, { global: { headers: { authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error } = await db.auth.getUser(token);
  if (error || !who?.user) {
    // why, for the logs (tools/supabase-logs.mjs): the error and the token's non-personal claims
    let claims: Record<string, unknown> = {};
    try { claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { /* not a JWT */ }
    const { aud, iss, role, scope, exp, client_id } = claims as Record<string, unknown>;
    // what the function's own requests to Supabase get back (status, type, the start of the body)
    const probe = async (path: string, auth = true) => {
      try {
        const r = await fetch(`${SUPABASE}${path}`, { headers: { apikey: ANON, ...(auth ? { authorization: `Bearer ${token}` } : {}) } });
        return `${path} ${r.status} ${r.headers.get("content-type")} ${(await r.text()).replace(/\s+/g, " ").slice(0, 120)}`;
      } catch (e) { return `${path} threw ${e}`; }
    };
    console.warn("mcp: probes:", new URL(SUPABASE).host, `anon key starts ${ANON.slice(0, 8)}`, await probe("/auth/v1/user"), "|", await probe("/auth/v1/.well-known/jwks.json", false), "|", await probe("/rest/v1/", false));
    console.warn("mcp: token refused:", error?.message, JSON.stringify({ aud, iss, role, scope, client: !!client_id, email: "email" in claims, expired: typeof exp === "number" && exp * 1000 < Date.now() }));
    return unauthorized("That sign-in has expired or isn't valid.");
  }
  const { data: member } = await db.rpc("is_member");
  if (member !== true) { console.warn("mcp: not a member"); return json({ error: "forbidden", error_description: "Members only." }, 403); }
  const uid = who.user.id;

  const ctx = {
    items: {
      list: async () => { const { data, error } = await db.from("wardrobe_items").select("*"); if (error) throw error; return data; },
      get: async (id: string) => { const { data, error } = await db.from("wardrobe_items").select("*").eq("id", id).maybeSingle(); if (error && error.code !== "22P02") throw error; return data; },
      add: async (row: Record<string, unknown>) => { const { data, error } = await db.from("wardrobe_items").insert(row).select().single(); if (error) throw error; return data; },
      set: async (id: string, patch: Record<string, unknown>) => { const { data, error } = await db.from("wardrobe_items").update(patch).eq("id", id).select().maybeSingle(); if (error && error.code !== "22P02") throw error; return data; },
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
    locate,
    weather: (leg: { lat: number; lon: number; from: string; to: string }) => legWeather(leg),
  };

  let body: unknown;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Not JSON." } }, 400); }
  const answers = (await Promise.all((Array.isArray(body) ? body : [body]).map((m) => rpc(m, ctx)))).filter(Boolean);
  if (!answers.length) return new Response(null, { status: 202 }); // only notifications
  return json(Array.isArray(body) ? answers : answers[0]);
});
