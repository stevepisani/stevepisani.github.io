# stevenpisani.com

Steve Pisani's personal site. The homepage is a small planet you walk around in first person: a
tiki bar with a robot bartender, a campfire, a hammock, a lagoon with stones to skip and bottles
to throw into space, and every section of the site on the bar's menu (and in the top bar, for
anyone who'd rather not walk). Every other page is plain Jekyll, and `/classic` is the homepage
without 3D.

- **Site:** Jekyll (`github-pages` gem), deployed to GitHub Pages by GitHub Actions.
- **Homepage:** three.js, Rapier physics, Web Audio, bundled with esbuild.
- **Backend:** one Supabase project, kept as code in `supabase/` (messages in bottles, a
  cookieless page count, the AI bartender on Claude Haiku, the recipe tracker).

## Run it

```bash
bundle config set --local path vendor/bundle && bundle install   # Ruby 3.3
npm install                                                       # Node 22
make serve          # http://localhost:4000, scripts rebuilt on save
make test           # build, link check and the browser smoke test (what CI runs)
```

Content lives in `_data/` (drinks, books, career, the bar's menu and lines) and `_posts/`.

## How it's put together

- `CLAUDE.md`: the working guide (commands, conventions, design rules, where things are).
- `docs/world.md`: the planet, module by module.
- `docs/backend.md`: Supabase, the bartender, deploys, secrets and the monthly budget.
- `docs/roadmap.md`: what's next.
