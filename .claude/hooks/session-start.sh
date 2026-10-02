#!/bin/bash
# Claude Code on the web: install what building and testing the site needs, so a new session
# can run `npm run build`, `bundle exec jekyll build`, `npm run check` and `npm test` at once.
# The container is cached after this runs, so later sessions start warm. Safe to run again.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"

# Ruby gems (github-pages, so Jekyll 3.x) into vendor/bundle, which _config.yml excludes
bundle config set --local path vendor/bundle
bundle install --quiet

# Node: three, Rapier, esbuild, Playwright (its Chromium is preinstalled at /opt/pw-browsers)
npm install --no-audit --no-fund --loglevel=error

# Build the scripts once so a fresh `bundle exec jekyll build` has assets/js/dist to copy
npm run build --silent

# Jekyll needs UTF-8 to read the posts
echo 'export LANG=C.UTF-8 LC_ALL=C.UTF-8' >> "${CLAUDE_ENV_FILE:-/dev/null}"
