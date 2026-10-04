// mcp.stevenpisani.com: the wardrobe's MCP server (supabase/functions/mcp) at an address of the
// site's own, so the connector URL in ChatGPT and Claude is short and stays put if the backend
// moves. A Cloudflare Pages worker (deployed by .github/workflows/mcp-proxy.yml; DNS stays at
// Bluehost, with a CNAME for mcp) that passes every request through as it came, adding
// x-mcp-public-host so the server gives out this address (RFC 9728's resource must be the URL
// the app used). Someone opening the address in a browser is sent to the app instead.
const SUPABASE = "__SUPABASE_URL__"; // from _config.yml, filled in at deploy
const APP = "https://stevenpisani.com/apps/wardrobe";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/" && (request.headers.get("accept") || "").includes("text/html")) return Response.redirect(APP, 302);
    const headers = new Headers(request.headers);
    headers.set("x-mcp-public-host", url.host);
    headers.delete("host");
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    const res = await fetch(`${SUPABASE}/functions/v1/mcp${url.pathname === "/" ? "" : url.pathname}${url.search}`, { method: request.method, headers, body, redirect: "manual" });
    return new Response(res.body, { status: res.status, headers: res.headers });
  },
};
