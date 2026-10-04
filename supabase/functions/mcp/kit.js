// What every area of SJPJr's MCP server shares (server.js has the protocol and the rules).
export const SITE = "https://stevenpisani.com";
export const WARDROBE_APP = `${SITE}/apps/wardrobe`; // the app's own links: #closet, #item/<id>, #trip/<id>

// The in-chat card: one page for every area (server.js serves it); a tool that shows it says so
// with these keys, the MCP Apps one and ChatGPT's
export const APP_URI = "ui://sjpjr/card.html";
export const showsCard = { ui: { resourceUri: APP_URI }, "openai/outputTemplate": APP_URI };

// Tool hints, as both apps read them. Nothing is ever destructive here (the rules, server.js).
export const read = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
export const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

// A mistake in the call, said so the model can fix it (anything else is "couldn't be reached")
export class Invalid extends Error {}

export const today = () => new Date().toISOString().slice(0, 10);
export const present = (v) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
export const pick = (row, keys) => Object.fromEntries(keys.filter((k) => present(row[k])).map((k) => [k, row[k]]));
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
