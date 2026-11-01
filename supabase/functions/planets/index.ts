// The Planets connector (docs/planets.md): https://<ref>.supabase.co/functions/v1/planets, and
// https://mcp.stevenpisani.com/planets through the proxy in proxy/. MCP over Streamable HTTP,
// stateless (server.js has the tools and the JSON-RPC). Open to anyone, with no sign-in: it reads
// nothing private, a preview stores no planet (its address is the planet), and what it writes is a
// planet someone sends to be built, through planet_request_add(), which caps how many (20 a day,
// 50 waiting), and the real models a preview starts (models.js, public.planet_models, capped by
// planet_models_claim()), which a card follows with GET ?models=<key>,<key>. Deployed with
// --no-verify-jwt (.github/workflows/supabase.yml) for that reason.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PROTOCOLS, rpc } from "./server.js";
import { modelsNow, MODELS_A_MONTH, PER_PLANET } from "./models.js";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// a sent planet: its id, or null when the caps are reached
const send = async ({ spec, note, contact }: { spec: unknown; note: string | null; contact: string | null }) => {
  const { data, error } = await db.rpc("planet_request_add", { spec, note, contact });
  if (error) throw new Error(`planet_request_add: ${error.message}`);
  return data as number | null;
};

// the real models made while the chat waits (models.js): the table, Meshy (with MESHY_API_KEY, a
// function secret the Supabase workflow copies in; without it nothing is asked for), the bucket,
// and the models the Planet models workflow made (the site's manifest, kept ten minutes)
const MESHY = Deno.env.get("MESHY_API_KEY");
const BUCKET = "planet-models";
let manifest: { at: number; m: Record<string, { model?: string }> } | null = null;
const models = MESHY ? {
  claim: async (slug: string, keys: string[], words: string[]) => {
    const { data, error } = await db.rpc("planet_models_claim", { planet: slug, keys, words, monthly_cap: MODELS_A_MONTH, planet_cap: PER_PLANET });
    if (error) throw new Error(`planet_models_claim: ${error.message}`);
    return (data as string[]) || [];
  },
  rows: async (keys: string[]) => {
    if (!keys.length) return [];
    const { data, error } = await db.from("planet_models").select("*").in("key", keys);
    if (error) throw new Error(`planet_models: ${error.message}`);
    return data || [];
  },
  turn: async (key: string, every: number) => {
    const { data, error } = await db.rpc("planet_model_turn", { model_key: key, every_seconds: every });
    if (error) throw new Error(`planet_model_turn: ${error.message}`);
    return (data as unknown[])?.[0] || null;
  },
  set: async (key: string, patch: Record<string, unknown>) => {
    const { error } = await db.from("planet_models").update(patch).eq("key", key);
    if (error) throw new Error(`planet_models: ${error.message}`);
  },
  meshy: async (method: string, url: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: { authorization: `Bearer ${MESHY}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Meshy ${method} ${new URL(url).pathname}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  },
  download: async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`model download: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  },
  put: async (file: string, bytes: Uint8Array) => {
    const { error } = await db.storage.from(BUCKET).upload(file, bytes, { contentType: "model/gltf-binary", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`upload ${file}: ${error.message}`);
  },
  url: (file: string) => db.storage.from(BUCKET).getPublicUrl(file).data.publicUrl,
  inManifest: async (slug: string, id: string, words: string) => {
    if (!manifest || Date.now() - manifest.at > 600_000) {
      const res = await fetch("https://stevenpisani.com/assets/models/planets/manifest.json", { signal: AbortSignal.timeout(5000) }).catch(() => null);
      manifest = { at: Date.now(), m: res?.ok ? await res.json() : {} };
    }
    return manifest.m[`${slug}/${id}`]?.model === words;
  },
} : undefined;

// who may call from a browser page (ChatGPT and Claude call from their servers, with no Origin)
const ORIGINS = /^https:\/\/([a-z0-9-]+\.)*(chatgpt\.com|openai\.com|claude\.ai|claude\.com|anthropic\.com|stevenpisani\.com)$/;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

// the card's script, from the site (server.js puts it in the card's page); kept ten minutes
let card: { at: number; js: string } | null = null;
const cardScript = async () => {
  if (card && Date.now() - card.at < 600_000) return card.js;
  const res = await fetch("https://stevenpisani.com/assets/js/dist/planet-card.js", { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`card script: HTTP ${res.status}`);
  card = { at: Date.now(), js: await res.text() };
  return card.js;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (origin && !ORIGINS.test(origin)) return json({ error: "forbidden", error_description: "Not from an app this server works with." }, 403);
  const version = req.headers.get("mcp-protocol-version");
  if (version && !PROTOCOLS.includes(version)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Unsupported MCP-Protocol-Version ${version}; this server speaks ${PROTOCOLS.join(", ")}.` } }, 400);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id", "access-control-allow-methods": "GET, POST, OPTIONS" } });
  // a card asking how its planet's models are coming (assets/js/planets/models.js): moves them on
  if (req.method === "GET" && new URL(req.url).searchParams.has("models")) {
    const keys = (new URL(req.url).searchParams.get("models") || "").split(",");
    return json(models ? await modelsNow(keys, models) : {}, 200, { "access-control-allow-origin": "*" });
  }
  if (req.method !== "POST") return json({ error: "POST only: this server keeps no stream open." }, 405, { allow: "POST" });
  // a spec is 64 KB at most (LIMITS.bytes); a request much bigger than that isn't one
  if (Number(req.headers.get("content-length") || 0) > 256 * 1024) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Too big: a planet spec is 64 KB at most." } }, 413);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Not JSON." } }, 400); }
  const answers = (await Promise.all((Array.isArray(body) ? body : [body]).map((m) => rpc(m, { cardScript, send, models })))).filter(Boolean);
  if (!answers.length) return new Response(null, { status: 202 }); // only notifications
  return json(Array.isArray(body) ? answers : answers[0]);
});
