// The wardrobe's "add from a store link" (/apps/wardrobe): POST { url } with the member's own
// session -> { name, brand, price, currency, link, photo_path }. Reads the product page
// (_shared/product.js) and copies its picture into the member's own photo folder
// (photos/wardrobe/<user id>/), as that member, so the storage rules apply. Anything it can't
// read is left out; the link always comes back. Deployed by .github/workflows/supabase.yml.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { publicUrl, readProduct, storeImage } from "../_shared/product.js";

const SITE = "https://stevenpisani.com";
const ALLOWED = [SITE, "http://localhost:4000", "http://127.0.0.1:4000"];

const cors = (origin: string) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  vary: "origin",
});
const reply = (body: unknown, status: number, origin: string) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...cors(origin), "content-type": "application/json" } });

Deno.serve(async (req) => {
  const origin = ALLOWED.includes(req.headers.get("origin") ?? "") ? req.headers.get("origin")! : SITE;
  if (req.method === "OPTIONS") return reply(null, 204, origin);
  if (req.method !== "POST") return reply({ error: "POST only" }, 405, origin);

  // as the member who asked: their session, so row and storage rules are theirs
  // ("Authorization" as supabase-js spells it, or it's sent twice and refused; and the token passed
  // to getUser, since a client without a session has no user of its own)
  const token = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  const { data: member } = await db.rpc("is_member");
  if (!who?.user || member !== true) return reply({ error: "Members only." }, 401, origin);

  let url = "";
  try { url = String((await req.json()).url ?? ""); } catch { /* below */ }
  if (!publicUrl(url)) return reply({ error: "That isn't a web address." }, 400, origin);

  const p = await readProduct(url);
  const photo_path = await storeImage(db, who.user.id, p.image);
  return reply({ name: p.name ?? null, brand: p.brand ?? null, price: p.price ?? null, currency: p.currency ?? null, link: p.url, photo_path }, 200, origin);
});
