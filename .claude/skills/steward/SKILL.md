---
name: steward
description: How work moves through this repo, from branch to live site. Use when starting a change, opening or updating a pull request, handling CI or review comments on one, merging, or checking a deploy on stevenpisani.com.
---

# Steward: from branch to stevenpisani.com

## Before you start

- Read `docs/roadmap.md` for what's next, and the doc for the area you're touching
  (`docs/world.md` for the planet, `docs/backend.md` for Supabase and deploys).
- Work on the branch the session names. If its pull request has already merged, restart the
  branch from `origin/main` (same name) rather than stacking on merged history.
- One pull request per coherent change. Small follow-ups Steve asks for while a PR is open can
  ride along in it; say so in the PR title or body.

## Before you push

All of these, locally:

```bash
npm run build && bundle exec jekyll build --strict_front_matter && npm run check
npm test                      # or --only desktop|phone|pages|nogl while iterating
```

- For anything visible, look at it: `npm test -- --shots <dir>` (or the patterns in the
  `verify-world` skill) and read the screenshots. Say what you couldn't check.
- Update `CLAUDE.md` / `docs/` in the same commit as the change they describe, and
  `docs/roadmap.md` when something ships or an idea comes up.
- Commit messages: a short summary line, then what changed and why, in plain words.

## The pull request

- Open it as a draft. Title says what a visitor (or Steve) gets; the body has what changed,
  how it was tested, and anything Steve has to do (a setting, a secret), stated exactly.
- CI (`site.yml`: build, check, smoke test) must be green. A red smoke test is real until shown
  otherwise: download the `smoke-failed` artifact, reproduce with `npm test -- --only <part>`,
  fix the cause. Never skip or weaken a test to get green.
- Supabase changes don't run on PRs. To try one before merging, run the Supabase workflow on the
  branch (`workflow_dispatch`) and test against the live project.
- Steve merges by saying so ("merge it"). Then: mark it ready, merge with the full 40-character
  head SHA as `expectedHeadSha`, stop watching it, and cancel any pending check-in.

## After the merge

- Pushes to main deploy through `site.yml` (build, check, smoke, then Pages); it's live about two
  minutes after the smoke test passes. Confirm it: fetch https://stevenpisani.com/ and check the
  change is there, and for the planet, load it in a browser (see `verify-world`, "the live site").
- If the change touched `supabase/`, check the Supabase workflow's run too.
- Reset the working branch to `origin/main` and push it, so the next change starts clean.
- Tell Steve what's live, what you verified, and anything left for him.

## Things only Steve can do (ask, with exact steps)

Repository settings (Pages source, archiving a repo), repo secrets, the Anthropic console's spend
limit, Supabase account-level actions, approving bottles until that's automated. Never ask for a
token in the chat.
