// The consent page for the wardrobe's MCP server (/apps/authorize, apps/authorize.html). When
// ChatGPT or Claude asks to sign in as you, Supabase Auth's OAuth server sends you here with an
// authorization_id; once you're signed in (the usual gate), this says which app is asking and
// where it'll send you back, and Allow or Don't allow answers it. Only ChatGPT's and Claude's own
// addresses can be approved, so a client someone else registered can't be let in by a stray click.
import { $, db, start } from './lib/kit.js';

// ChatGPT sends you back to chatgpt.com; Claude to claude.ai/api/mcp/auth_callback (claude.com in time)
const TRUSTED = /^(chatgpt\.com|chat\.openai\.com|claude\.ai|claude\.com)$/;
const id = new URLSearchParams(location.search).get('authorization_id');
const say = (text) => { $('#consent-note').textContent = text; };

start(async () => {
  if (!id) return say('Nothing to approve here. This page opens when ChatGPT or Claude asks to connect.');
  const { data, error } = await db.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return say("That request has expired or was already answered. Start connecting again from ChatGPT or Claude.");
  if (!data.authorization_id) { location.assign(data.redirect_url); return; } // approved before: straight back
  let host = '';
  try { host = new URL(data.redirect_uri).hostname; } catch (e) {}
  const trusted = TRUSTED.test(host);
  $('#consent-client').textContent = data.client?.name || 'An app';
  $('#consent-host').textContent = host || data.redirect_uri;
  $('#consent-warn').hidden = trusted;
  $('#consent-allow').hidden = !trusted;
  $('#consent').hidden = false;
  const answer = async (allow) => {
    for (const b of document.querySelectorAll('.consent__buttons button')) b.disabled = true;
    say(allow ? 'Connecting…' : 'Not allowed.');
    const { data: done, error: failed } = allow
      ? await db.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await db.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
    if (failed || !done?.redirect_url) { say("That didn't go through. Start connecting again from ChatGPT or Claude."); return; }
    location.assign(done.redirect_url);
  };
  $('#consent-allow').onclick = () => answer(true);
  $('#consent-deny').onclick = () => answer(false);
});
