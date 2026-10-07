// The real moon for the telescope on the homepage (main.js lookThroughScope): GET -> this hour's
// moon from NASA's Dial-A-Moon (svs.gsfc.nasa.gov/api/dialamoon), cut down to what the eyepiece
// needs: the picture (730 px, about 50 KB, celestial north up), how big it looks, how lit it is,
// and its libration and tilt, so the landing sites can be marked where they really are. NASA's
// API only answers browsers on its own sites, so this asks for them. It changes once an hour,
// so each answer is kept for the hour, here and in the browser. Deployed by
// .github/workflows/supabase.yml; costs nothing beyond the free tier's invocations.
const SITE = "https://stevenpisani.com";
const ALLOWED = [SITE, "http://localhost:4000", "http://127.0.0.1:4000"];
const cors = (origin: string) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, OPTIONS",
  vary: "origin",
});

let kept: { hour: string; body: string } | null = null;

Deno.serve(async (req) => {
  const origin = ALLOWED.includes(req.headers.get("origin") ?? "") ? req.headers.get("origin")! : SITE;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: { ...cors(origin), "content-type": "application/json" } });
  const hour = new Date().toISOString().slice(0, 13) + ":00"; // e.g. 2026-10-07T02:00, UTC
  if (kept?.hour !== hour) {
    try {
      const r = await fetch(`https://svs.gsfc.nasa.gov/api/dialamoon/${hour}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`NASA said ${r.status}`);
      const d = await r.json();
      const moon = {
        time: d.time, image: d.image?.url, phase: d.phase, age: d.age,
        diameter: d.diameter, // arcseconds across
        posangle: d.posangle, // the moon's north pole, degrees east of celestial north
        subearth: { lon: d.subearth_lon, lat: d.subearth_lat }, // libration
        subsolar: { lon: d.subsolar_lon, lat: d.subsolar_lat },
      };
      if (typeof moon.image !== "string" || !moon.image.startsWith("https://svs.gsfc.nasa.gov/")) throw new Error("no picture");
      kept = { hour, body: JSON.stringify({ moon }) };
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...cors(origin), "content-type": "application/json" } });
    }
  }
  return new Response(kept.body, { headers: { ...cors(origin), "content-type": "application/json", "cache-control": "public, max-age=900" } });
});
