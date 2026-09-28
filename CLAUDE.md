# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jekyll personal site for stevenpisani.com, built by GitHub Pages (the `github-pages` gem, so Jekyll 3.x and only whitelisted plugins). It is a professional home page plus a playground: writing, a "lab" of experiments, and a bookshelf. No CSS framework and no build step beyond Jekyll.

## Development Commands

### Setup
```bash
# Install dependencies (requires Ruby and Bundler)
gem install bundler:2.1.4
bundle install
```

### Local Development
```bash
# Run Jekyll development server
bundle exec jekyll serve

# Build the site
bundle exec jekyll build
```

## Architecture

- `_layouts/`: `default.html` (shell, SEO via `{% seo %}`), `page.html` (kicker/heading/lede header + prose), `post.html`
- `_includes/`: `nav.html`, `footer.html`, `clock.html` (Weasley clock), `cover.html` (post cover, gradient fallback seeded by title), `post-row.html`, `lab-card.html`, `read_time.html`
- `_data/`: content lives here, edit these rather than HTML
  - `timeline.yml`: career timeline on /about
  - `lab.yml`: experiments on /lab (first three also appear on the homepage)
  - `books.yml`: shelves on /bookshelf
  - `clock.yml`: hands and time rules for the "Where's Steve?" clock
- `_posts/`: posts (layout defaults to `post`). Optional front matter: `image_url`, `description`
- Pages: `index.html`, `about.html`, `blog.html` (/blog, labelled "Writing"), `lab.html`, `bookshelf.html`, `404.html`, `401.html`
- `recipe_tracker/`: standalone app (own inline styles, Supabase), linked from the lab

### Styling and scripts
- `assets/css/site.css`: the only stylesheet. Colors are custom properties on `:root` with three themes: light (default), dark (system preference or chosen), terminal (chosen). New components should use the tokens, never raw colors.
- `assets/js/site.js`: theme cycling (auto → light → dark → terminal) and the clock. No jQuery.
- `assets/css/normalize.css` is kept only for `recipe_tracker/`.
- Fonts: Fraunces (display), Inter (body), JetBrains Mono (labels/code) from Google Fonts.

## Important Notes
- CNAME holds the custom domain; don't remove it.
- Post permalinks use Jekyll's default (`/YYYY/MM/DD/Title.html`); don't change them, they're linked externally.
- Use `relative_url` for internal links and assets.
- Non-site files (this file, README, Makefile, Gemfile) are in `exclude:` in `_config.yml` so they aren't published.
