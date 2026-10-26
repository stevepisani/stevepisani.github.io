// The Planets connector (docs/planets.md): https://<ref>.supabase.co/functions/v1/planets, and
// https://mcp.stevenpisani.com/planets through the proxy in proxy/. MCP over Streamable HTTP,
// stateless (server.js has the tools and the JSON-RPC). Open to anyone, with no sign-in: it reads
// nothing, a preview stores nothing (its address is the planet), and the one thing it writes is a
// planet someone sends to be built, through planet_request_add(), which caps how many (20 a day,
// 50 waiting). Deployed with --no-verify-jwt (.github/workflows/supabase.yml) for that reason.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PROTOCOLS, rpc } from "./server.js";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// a sent planet: its id, or null when the caps are reached
const send = async ({ spec, note, contact }: { spec: unknown; note: string | null; contact: string | null }) => {
  const { data, error } = await db.rpc("planet_request_add", { spec, note, contact });
  if (error) throw new Error(`planet_request_add: ${error.message}`);
  return data as number | null;
};

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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id", "access-control-allow-methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return json({ error: "POST only: this server keeps no stream open." }, 405, { allow: "POST" });
  // a spec is 64 KB at most (LIMITS.bytes); a request much bigger than that isn't one
  if (Number(req.headers.get("content-length") || 0) > 256 * 1024) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Too big: a planet spec is 64 KB at most." } }, 413);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Not JSON." } }, 400); }
  const answers = (await Promise.all((Array.isArray(body) ? body : [body]).map((m) => rpc(m, { cardScript, send })))).filter(Boolean);
  if (!answers.length) return new Response(null, { status: 202 }); // only notifications
  return json(Array.isArray(body) ? answers : answers[0]);
});
