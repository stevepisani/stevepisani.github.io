# The private apps (`/apps`)

Small tools for life at home, on the site but only for members: Steve and Lexi today. The recipe
tracker was the first; the wardrobe is the second. They share one sign-in, one look and
one small kit, so a new app is a table, a page and a script, and nothing else.

## How it fits together

| Piece | What it does |
|---|---|
| `_data/apps.yml` | the list on `/apps` (`apps/index.html`): title, url, emoji, blurb |
| `_layouts/app.html` | the shell: the site's nav and themes, the heading, the sign-in form, and the page's content hidden until a member is signed in. It loads `apps.css` (through `head.html`) and the script named by `app:` |
| `assets/css/apps.css` | the parts apps are made of, all on the site's tokens: fields, the top block (`.app-hero`), toolbar (`.app-bar`), segmented filter (`.seg`), cards (`.items`, `.item`), pill, rating, dialog, toast |
| `assets/js/apps/lib/kit.js` | `db` (the Supabase client), `start(open, close)` (the gate), `rows(table)` (list, add, set, remove, with failures shown), `saver(field, save)` (save as you type, and when the page is hidden), `fresh(again)` (reload after a minute away, so a stale tab doesn't save over the other person's edits), `ask(dialog)` (a form in a dialog; Cancel is `type="button" data-close`, so Enter submits), `photos` (put, urls, remove), `toast(text)` |
| `assets/js/apps/<name>.js` | one app. `tools/build-js.mjs` bundles every file in this folder to `dist/apps/<name>.js`; what they share is split into one chunk |

Signing in is a link by email (Supabase magic link), sign-ups off. The session is kept in the
browser for the whole site, so signing in once covers every app, and the site's nav shows "Apps"
to someone signed in (`site.js`). Who's a member is the `members` table; every table's policy asks
`is_member()`, and the page asks it too, only to decide what to show. The pages are `noindex`.

## Adding an app (say, a wardrobe)

1. **A table**, in a new migration (`supabase/migrations/<timestamp>_<name>.sql`), written so a
   re-run is safe. Shared between members:

   ```sql
   create table if not exists public.clothes (
     id uuid primary key default gen_random_uuid(),
     name text not null,
     photo_path text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   alter table public.clothes enable row level security;
   drop policy if exists "members" on public.clothes;
   create policy "members" on public.clothes for all to authenticated
     using ((select public.is_member())) with check ((select public.is_member()));
   drop trigger if exists trg_clothes_updated_at on public.clothes;
   create trigger trg_clothes_updated_at before update on public.clothes
     for each row execute function public.set_updated_at();
   ```

   If each person should see only their own rows, add `owner uuid not null default auth.uid()`
   and make the policy `(select public.is_member()) and owner = (select auth.uid())`.
2. **A page**, `apps/<name>.html`, with `layout: app`, `app: <name>`, `title:` and `lede:` (the
   lede is what the sign-in form says the app is). Its content is the app's markup, built from the
   classes in `apps.css`; `apps/recipes.html` is the example.
3. **A script**, `assets/js/apps/<name>.js`: import from `./lib/kit.js`, and call
   `start(async () => { … load and draw … })`. Photos go in the shared private `photos` bucket,
   under `<name>/<row id>/` (`photos.put(file, folder)` shrinks them to 1600px first).
4. **A line** in `_data/apps.yml`.
5. **A test**: a fixture in `tools/fixtures/` and a few steps in `apps()` in `tools/smoke.mjs`,
   which runs the apps against a made-up Supabase.

Put something in the kit or `apps.css` only when a second app needs it.

Known limits, to deal with when an app meets them:

- **Photos are members-wide**, except the wardrobe's: the `photos` bucket's one policy asks
  `is_member()`, and for paths under `wardrobe/` also that the second folder is the person's own
  id (`wardrobe/<user id>/…`). Another per-person app needs the same clause for its folder.
- **Photos are freshly signed each visit**, so the browser never caches them. Fine for a few
  dozen at 1600px; the wardrobe stores its cut-outs at 1200px as WebP (`photos.put(file, folder,
  { alpha: true, longest: 1200 })`, 50 to 200 KB each), which holds up to a couple of hundred.
- **`rows().list()` has no paging**; the API returns at most 1,000 rows.
- Recipe photos from before Oct 2026 sit at the bucket's root (`<recipe id>/…`); new ones are
  under `recipes/`. Both work.

## The recipe tracker (`/apps/recipes`)

Table `recipes`. Up top, the one thing to act on: tonight's pick (the same one all day; "Another"
picks at random), with how many are cooked, the average rating, the streak and a progress bar.
Then search and Add; All / To cook / Cooked with their counts; and the order. The filter and order
are remembered on that phone (`localStorage` `recipes-view`).

A recipe still to cook is a small card: its name (a link to the recipe) and "Cooked it". Once
cooked it grows: the photo, the date, a rating out of 10 (the same star again clears it), notes
that save as you type, and "Add a photo". "Edit" opens the name, link, date, "Not cooked yet"
and remove (and, on one still to cook, its notes). Import, a pasted list of `Name | link` lines,
is a link under the list.

Design rules for the apps, from the Oct 2026 critique and accessibility pass:
- Show a control when there's something to do with it, not before (no rating on an uncooked
  recipe). The first phone screen should reach the list.
- Text is `--ink` or `--ink-2`; `--ink-3` is for borders and outlines only (in the light theme
  it's 3.7:1 on white, short of the 4.5:1 text needs). Field borders are `--ink-3`, not `--line`.
- State is never colour alone: stars are outlined or filled, a pressed filter is inverted.
- Tap targets are 44px tall; scrolling and confetti respect reduced motion.
- Not fixed, because it's the whole site's: white on the light theme's `--accent` (buttons) is
  3.9:1.

It lived at `/recipe_tracker/` as a standalone page until Oct 2026; that address redirects.
Gone with the old page: the Refresh button (it reloads by itself when you come back to it), the
Cmd+I, Cmd+N and R shortcuts, and the camera opening straight away for a photo (the phone now
offers the library too). The old page could also fetch an NYT Cooking collection through public CORS proxies; that was
dropped (third-party proxies, and no way to test it). If it's missed, the way to do it is an edge
function.

## The wardrobe (`/apps/wardrobe`)

Steve's clothes: private to him, not shared (table `wardrobe_items`, rows owned by `auth.uid()`;
photos under `photos/wardrobe/<user id>/`). ChatGPT reads and edits the same rows through the
wardrobe MCP server, signed in as him (below).

- **The closet:** search and Add, category chips (All, then each category with something in it,
  with counts), season, dressiness and "In the closet / Retired". A grid of square tiles: the
  photo cut out on a soft tile, the name, brand and size. Remembered on that phone
  (`localStorage` `wardrobe-view`).
- **An item's sheet** (tap a tile): the photo, name, category, "Buy another" (the replacement
  link) and "Find another" (a Google Shopping search for brand, name and colour), then brand,
  colour, size, material, fit, seasons, warmth, dressiness, price and currency, bought on, where
  to buy another, notes. Text saves as it's typed, the rest at once. "Retire it" moves it out of
  the closet (kept, under Retired); "Delete it" is for good, and only here, never from ChatGPT.
- **Adding:** a photo, or a store link (or both: the link is kept as where to buy another).
  - A photo is cut out of its background in the browser (`@imgly/background-removal`, run on
    demand; its model, about 40 MB, comes from imgly's CDN the first time and is then cached;
    about 15 s on a laptop). If it can't be cut out it's kept as taken. The library is AGPL-3.0,
    which this site, whose source is public, already meets.
  - A store link goes to the `wardrobe-link` edge function, which reads the page's JSON-LD or
    Open Graph tags (`supabase/functions/_shared/product.js`: name, brand, picture, price) and
    copies the picture into the person's folder, as them. Some shops (Patagonia, J.Crew) refuse
    anything that isn't a browser; then only the link is kept and the name is typed.
- Categories: tops, bottoms, outerwear, suits, shoes, accessories, workout, swim (a check in the
  table, and `CATS` in `wardrobe.js`).

## ChatGPT: the wardrobe's MCP server

`supabase/functions/mcp`, at `https://<ref>.supabase.co/functions/v1/mcp`: MCP over Streamable
HTTP, stateless (each POST gets one JSON answer; no sessions, no stream). `server.js` has the tools
and the JSON-RPC, in plain JavaScript so the smoke test runs them in Node; `index.ts` serves it and
checks who's calling.

- **Tools:** `find_items` (search, category, season, dressiness; retired left out unless asked),
  `get_item`, `read_store_link` (reads a shop page, saves nothing), all marked read-only; and
  `add_item` (with a `buy_link`, the shop's picture is copied in and blank fields filled from the
  page), `update_item` (only the fields given; wrong values are refused, not guessed),
  `retire_item` (or back). No delete: that's only in the app. Results are a line of text an item
  plus `structuredContent`; ChatGPT can't see images from a connector (Oct 2026), so each item's
  `photo_url` is there for Steve to open, and the descriptions are what ChatGPT goes on.
- **Signing in** is OAuth 2.1 with Supabase Auth as the authorization server (its OAuth server,
  beta). A call without a valid token gets a 401 whose `WWW-Authenticate` points at
  `…/functions/v1/mcp/.well-known/oauth-protected-resource` (RFC 9728), which names
  `https://<ref>.supabase.co/auth/v1` as the authorization server. ChatGPT registers itself there
  (dynamic client registration is on), sends you to the consent page, and gets a token for you.
  Every query then runs as you: `getUser` checks the token, `is_member()` must say yes, and the
  tables' row-level security does the rest. Deployed with `--no-verify-jwt` (the workflow's
  list), since the discovery request has no token and tokens are checked here.
- **The consent page** is `/apps/authorize` (`apps/authorize.html`, `assets/js/apps/authorize.js`;
  not listed on /apps): Auth sends you there with `?authorization_id=`; signed in as usual, it
  says which app is asking and where it'll send you back, and Allow or Don't allow answers it.
  Only ChatGPT's own addresses (`chatgpt.com`, `chat.openai.com`) can be allowed. Its address is
  `site_url` + `oauth_server_authorization_path` in `supabase/auth.json`, joined as text, which is
  why `site_url` is the bare `https://stevenpisani.com`.
- **As code:** `supabase/auth.json` turns the OAuth server on; `tools/supabase.mjs` also switches the
  project's JWT signing to an ES256 key once (the OAuth server can't sign ID tokens with the old
  shared secret), keeping the old secret trusted so the anon and service keys and existing
  sessions keep working. `wardrobe-link` is deployed with `--no-verify-jwt` too, and checks the
  caller itself, since tokens from the new key may not pass the gateway's old check.
- **Connecting ChatGPT** (Steve, once): on the web, Settings → Security and login → turn on
  Developer mode; then Plugins (once called Connectors, then Apps) → + → name "Wardrobe", URL
  `https://dkaiavlnmtetqigxnkwb.supabase.co/functions/v1/mcp`, authentication OAuth → sign in →
  Allow. ChatGPT asks before each write; that approval lasts the conversation if you tell it to.
  After a tool changes, refresh the plugin and start a new chat.
- **Known risk:** since late September 2026 some people report ChatGPT's safety checks blocking
  write calls to custom connectors before they reach the server (reads work; OpenAI hasn't said
  why). If writes never arrive, that's it: the function's logs show nothing for them.
- To revoke ChatGPT's access: delete the plugin in ChatGPT, or remove its grant from your account
  (Supabase Auth's OAuth grants).
