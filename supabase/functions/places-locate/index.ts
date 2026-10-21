// Where the saved places a Takeout file gives no coordinates for are (a saved list has only a
// name and a link): POST {} with the member's own session -> { located, left, capped, missing_key }.
// Up to 25 at a time, each one call to the Places API (New) Text Search with only the fields
// needed (its id, where it is, its address), counted in public.places_api_usage and capped there
// (places_api_take: 1,000 a month, well inside Google's free calls; the key has a daily quota too).
// A place it can't find is marked so, and not asked about again. As the member, so row-level
// security applies. The key is the GOOGLE_MAPS_API_KEY repo secret, copied into the function's
// secrets by .github/workflows/supabase.yml; without it this says so and changes nothing.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SITE = "https://stevenpisani.com";
const ALLOWED = [SITE, "http://localhost:4000", "http://127.0.0.1:4000"];
const KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
const BATCH = 25;

const cors = (origin: string) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  vary: "origin",
});
const reply = (body: unknown, status: number, origin: string) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...cors(origin), "content-type": "application/json" } });

// One place, by its name and what else is known of it; null when Google has nothing
async function search(query: string) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY, "x-goog-fieldmask": "places.id,places.location,places.formattedAddress" },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Places API: HTTP ${res.status}`);
  const p = (await res.json()).places?.[0];
  return p?.location ? { id: p.id as string, lat: p.location.latitude as number, lon: p.location.longitude as number, address: (p.formattedAddress as string) || null } : null;
}

Deno.serve(async (req) => {
  const origin = ALLOWED.includes(req.headers.get("origin") ?? "") ? req.headers.get("origin")! : SITE;
  if (req.method === "OPTIONS") return reply(null, 204, origin);
  if (req.method !== "POST") return reply({ error: "POST only" }, 405, origin);

  // as the member who asked ("Authorization" as supabase-js spells it; wardrobe-link says why)
  const token = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who } = token ? await db.auth.getUser(token) : { data: null };
  const { data: member } = await db.rpc("is_member");
  if (!who?.user || member !== true) return reply({ error: "Members only." }, 401, origin);

  // the ones still to find: no coordinates, not dismissed, not already looked for in vain
  const waiting = db.from("places").select("id, name, address, data", { count: "exact" }).eq("owner", who.user.id).is("lat", null).neq("status", "dismissed").is("data->located", null);
  const { data: todo, count, error } = await waiting.order("created_at").limit(BATCH);
  if (error) return reply({ error: error.message }, 500, origin);
  if (!todo?.length) return reply({ located: 0, left: 0 }, 200, origin);
  if (!KEY) return reply({ located: 0, left: count ?? todo.length, missing_key: true }, 200, origin);

  const { data: granted } = await db.rpc("places_api_take", { n: todo.length });
  const these = todo.slice(0, Number(granted) || 0);
  let located = 0;
  // a few at a time
  for (let i = 0; i < these.length; i += 5) {
    await Promise.all(these.slice(i, i + 5).map(async (p) => {
      const query = [p.name, p.address].filter(Boolean).join(", ");
      const at = new Date().toISOString();
      try {
        const hit = await search(query);
        // how it was found, kept with it (docs/vision.md, rule 1): a better match can be asked for later
        const located_how = { by: "places_api", query, at, found: !!hit };
        const patch = hit
          ? { lat: hit.lat, lon: hit.lon, located_by: "places_api", google_place_id: hit.id, ...(!p.address && hit.address && { address: hit.address }), data: { ...p.data, located: located_how } }
          : { data: { ...p.data, located: located_how } };
        const { error: e } = await db.from("places").update(patch).eq("id", p.id);
        if (!e && hit) located++;
      } catch (e) {
        console.warn(`places-locate: ${(e as Error).message}`); // never the place itself: the logs are public
      }
    }));
  }
  console.log(`places-locate: ${these.length} asked, ${located} found, ${todo.length - these.length} over the cap`);
  return reply({ located, left: Math.max(0, (count ?? todo.length) - these.length), capped: these.length < todo.length }, 200, origin);
});
