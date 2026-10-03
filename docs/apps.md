# The private apps (`/apps`)

Small tools for life at home, on the site but only for members: Steve and Lexi today. The recipe
tracker is the first; a wardrobe is next (`docs/roadmap.md`). They share one sign-in, one look and
one small kit, so a new app is a table, a page and a script, and nothing else.

## How it fits together

| Piece | What it does |
|---|---|
| `_data/apps.yml` | the list on `/apps` (`apps/index.html`): title, url, emoji, blurb |
| `_layouts/app.html` | the shell: the site's nav and themes, the heading, the sign-in form, and the page's content hidden until a member is signed in. It loads `apps.css` (through `head.html`) and the script named by `app:` |
| `assets/css/apps.css` | the parts apps are made of, all on the site's tokens: fields, toolbar (`.app-bar`), numbers (`.app-stats`), cards (`.items`, `.item`), photo slot, pill, rating, dialog, toast |
| `assets/js/apps/lib/kit.js` | `db` (the Supabase client), `start(open)` (the gate), `rows(table)` (list, add, set, remove, with failures shown), `saver(field, save)` (save as you type), `ask(dialog)` (a form in a dialog), `photos` (put, urls, remove), `toast(text)` |
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

## The recipe tracker (`/apps/recipes`)

Table `recipes`. Each card: a photo, the name (a link to the recipe), cooked or not and when, a
rating out of 10 (the same star again clears it), notes that save as you type, and under "Edit"
the name, link, date and remove. Above: search, filter, sort, how many are cooked, the average
rating, the week streak, and tonight's pick (the same one all day; "another" picks at random).
Import takes a pasted list, one recipe a line, `Name | link`.

It lived at `/recipe_tracker/` as a standalone page until Oct 2026; that address redirects.
The old page could also fetch an NYT Cooking collection through public CORS proxies; that was
dropped (third-party proxies, and no way to test it). If it's missed, the way to do it is an edge
function.
