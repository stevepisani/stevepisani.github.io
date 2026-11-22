# SJPJr UX improvement audit

Active goal started November 11, 2026. Improve the whole app through observed workflows,
specific Mobbin comparisons, implementation and verified desktop/mobile behavior. Preserve
the app's identity, data, permissions and Finance's private-storage boundaries.

## Walkthrough coverage

This historical table predates the November 12/15 deployed checks below. Those checks close
the PR #160/#161 release gates; remaining workflow/design gaps are tracked in the current
completion audit at the end. Physical-device Safari coverage is still not claimed.

| Area | Observed so far | Still required |
|---|---|---|
| Shared shell | Live desktop/390px navigation; Terminal/Auto settings and Escape/focus; synthetic light/dark/terminal and sign-in/sign-out checks | Post-deploy verification; physical-device check not performed |
| Finance | Live import/export/refresh/plan; synthetic keyboard correction walkthrough, failed-load recovery, search, long editors and privacy regression | Final release review and deployed walkthrough |
| Today | Live desktop/phone dashboard and day navigation; empty-outfit picker; synthetic journal/outfit/undo/trip-link tests | Verify changed empty-outfit label after deployment |
| Closet | Live phone category filter, garment detail/Done, add/cancel; synthetic search/photo/add/edit/dirty-cancel/offline tests | Final shared-style regression review |
| Trips | Live desktop/phone list/itinerary, new-trip form and packing filters; synthetic creation/edit/packing/undo tests | Final shared-style regression review |
| Places | Live phone list filter and detail; synthetic import/review/privacy/nearby/day integration | Final shared-style regression review |
| Recipes | Live desktop/phone collection/filter/add/required validation; synthetic search/cooking/notes/rating/photo/cancel | Verify secondary row actions after deployment |

Use synthetic records for mutations where possible; never publish personal screenshots,
record details or financial amounts as audit evidence in this public repository.

## Initial observations (resolution recorded below)

- Today's empty-outfit `Wore it` action was opened live: it correctly opens a picker, and Cancel
  makes no record. The label implies immediate confirmation; change it to `Log what you wore`
  only when there is no valid planned outfit. Existing one-tap planned-outfit behavior stays.
- Today's empty-outfit message directs the user to an external assistant. Walk the complete
  planning path and determine whether the app provides a usable next step.
- Finance's top-level actions share text-link treatment. Compare the importance and placement
  of refresh, import, export and editing against the task the user arrived to do.

## Initial Mobbin comparison

Search: `personal finance dashboard`, web, standard. Images inspected; these are starting
references, not an approved design direction.

- [Revolut analytics](https://mobbin.com/screens/9b019468-ba9a-4943-884e-70ec2479eaef):
  account/month controls sit with the spending overview; navigation remains separate.
- [Stripe balances](https://mobbin.com/screens/ec4bf8ef-b6b8-4fb7-b866-293ac767904e):
  reference for structure only, from a business-payments product. Compact action group,
  balance summary and activity have separate regions.
- Quartz holdings result excluded: it addresses securities holdings rather than household cash planning.

## Completion gates

Walk each main flow, record the specific obstruction and its state, gather relevant references,
implement coherent shared patterns, and repeat the same walkthrough after changes. Check phone
and desktop layout, keyboard operation, loading/empty/error/success states, persistence and
security regressions. Follow the steward PR, CI and deployment process. None of the new
cross-app redesign work is complete merely because the Finance cutover passed.

## First implementation pass (not yet deployed)

Scope: shared action hierarchy in the web app, using existing tokens and button components;
Today's empty-outfit action, Recipe collection row actions, and Finance's toolbar. Data,
routes, access controls and dependencies stay unchanged.

- Today: label the picker action `Log what you wore`; keep `Wore it` for a planned outfit.
- Recipes: use existing secondary buttons for repeated `Cooked it` actions so the collection
  is not a wall of competing accent buttons. Add remains the primary collection action.
- Finance: group record actions separately from plan/account editing, with Import primary;
  use existing secondary buttons rather than a spread of ungrouped text links.
- Source inspection found two invalid Finance theme token names (`--ink2`, `--bg2`); use the
  existing `--ink-2` and `--bg-2` so muted text and notice surfaces inherit the intended theme.

Additional images inspected on Mobbin:
- [GetYourGuide trip plan](https://mobbin.com/screens/19e14c5d-eed3-4e55-a75e-43bba32200e2):
  a compact trip heading and date/action group above activity rows; useful for hierarchy,
  but not evidence for day-by-day planning.
- [NYT Cooking saved recipes](https://mobbin.com/screens/304d5760-05ce-487a-8604-4c4f3e45fc1b):
  search, filters and result count stay together; item actions are subordinate to finding recipes.
  Native iOS reference used for the mobile collection structure, not copied native chrome.
- [Noom recipes](https://mobbin.com/screens/99817269-341f-4d2d-bf05-17162018a65b):
  active filters are explicit removable chips; useful for future filter-state refinement.
- Zillow tour itineraries, Insight Timer saved content and BitePal saved meals were excluded
  from the domain-specific comparison; they do not show the requested travel/cooking flows.

Still open: the full mobile walkthrough, keyboard paths, persistence/feedback tests and the
remaining section-specific improvements. Visiting every landing page is not full workflow coverage.

## Verification of first pass

- Local JavaScript build, strict Jekyll build and all 258 internal links passed.
- Synthetic Finance desktop/phone tests passed: no overflow, review correction, safe text,
  sign-out race and no persistent financial storage.
- Inspected generated phone screenshots for Finance and Recipes. The secondary row actions
  reduce accent repetition. Finance's full toolbar still occupies substantial vertical space;
  a compact management disclosure remains a candidate for the next pass, not a verified fix.
- Live screenshot and source confirm Finance and Today currently reuse the same navigation
  icon. Give Finance a distinct existing-style symbol in the shared-navigation pass.
- Cross-app smoke suite passed: recipe search/cooking/add/edit, wardrobe filtering and
  editing, trip creation/packing/undo, daily notes, settings, Places import/review, membership
  boundaries, sign-in errors, sign-out and offline recovery. These are synthetic browser
  checks; the remaining hands-on mobile walkthrough is still required.

## Second pass: phone walkthrough and long editors

Observed the live app at a 390px responsive browser viewport, in the system dark theme:
all six dock labels fit; Closet category filtering and garment detail/Done worked; Places
list filtering worked; Recipes' Cooked filter showed the matching collection; Trips opened
its itinerary; Finance completed loading and opened/canceled its funding plan unchanged.
This is browser emulation, not evidence from an actual iPhone or installed Safari app.

The Finance plan's Cancel/Save controls were below the long field list. Plan, account and
scenario editors now share sticky top actions: Cancel left, commit right. Cancel checks for
changed values and restores focus to the opener. Privacy clearing on leaving/backgrounding
still takes precedence: drafts are not persisted and navigation is not blocked for privacy.
Finance now has a distinct wallet symbol rather than reusing Today's sun.

Synthetic desktop/phone Finance tests passed after these changes, including sticky-action
visibility, declining discard (draft retained), accepting discard (stored plan unchanged),
focus return, saving, and existing security/persistence checks. The isolated fixture now uses
the real app class so shared field/button CSS is covered. Phone editor screenshot review and the rebuilt full-shell app smoke suite both passed.
The new wallet symbol was also inspected in the rendered phone dock.

The attempted live Escape check went to the focused DevTools console, so it is **not** counted
as a successful app keyboard test. Done was verified instead; the later deliberate keyboard
checks are recorded in the third pass and release review below.

The phone editor screenshot was inspected. Finance now also inherits the shared high-contrast
field borders and body type instead of overriding them with a faint border and label font;
its QBI checkbox uses the same compact checkbox treatment as packing. Regression tests passed.

[Alta's closet](https://mobbin.com/screens/92896683-86ed-42ec-892c-631ecc012be7) was inspected
for category/filter hierarchy. SJPJr already keeps categories visible and folds extra filters
on initial phone load; the expanded state in this resized desktop session came from the
initial desktop width. Preserve that deliberate behavior rather than claiming a phone defect.
The WhatsApp avatar-clothing result was excluded because it does not represent owned garments.

The third pass below addresses keyboard/focus, transaction review and recovery states.
No new code is deployed yet.

## Third pass: transaction review and recovery

Compared inspected [Monarch transactions](https://mobbin.com/screens/6d7710b7-7222-45d8-a3a9-550a8bae1516)
and [Rocket Money transactions](https://mobbin.com/screens/29fb2f53-983e-49cd-90c0-fabd5a8593f0):
compact rows support scanning; search/filter controls sit above the list; corrections are
revealed on demand. SJPJr now uses native expandable transaction summaries, newest first,
search within the selected category, a result count and batches of 50. It builds edit fields
only for opened rows. Search preserves in-memory drafts when a matching row is hidden and
shown again; changing sections/backgrounding still clears Finance, with no persistent copy.

A failed Finance load now offers Try again, running the same authentication/permission path.
A failed correction preserves its fields and shows an inline error instead of erasing the
whole dashboard. Save has an in-flight state and announces success. Category switching keeps
focus on the selected category; a saved correction returns focus to its row, or the detail
heading when the row no longer belongs in that category.

Hands-on CUA walkthrough of the synthetic-only compiled page:
opened Needs review, expanded a transaction, tabbed from summary into Treatment, then Category
and Note, typed a synthetic note, tabbed to Save and pressed Enter, reopened the row and
verified the note persisted. This found focus falling to the page after switching/saving.
After the repair, repeated the flow and observed category focus retained, “Transaction saved”
feedback, and focus returned to the transaction summary. No personal records were edited.

Desktop/phone tests passed for failed-load/retry recovery, bounded large-list rendering,
search/no-match states, draft retention, corrected category/focus behavior and existing privacy
checks. The rebuilt full-shell app smoke suite passed, and the generated phone review screenshot was inspected.
A final small refinement makes Show more move focus to the newly revealed rows and uses a
decorative chevron instead of reading a plus/minus sign in each disclosure label.

## Release review

Live Settings walkthrough: changed Auto to Terminal, inspected the dialog, restored Auto,
then pressed Escape. The dialog closed and focus returned to Settings. The terminal view
revealed Finance's balance text hard-coded the display font; it now uses `--font-display`.
Synthetic light/dark/terminal screenshots at desktop and phone widths were checked after
letting theme transitions settle; terminal balance typography now follows the theme.
The targeted Finance suite passes including failed writes that retain the draft and leave
stored records unchanged. The full repository `npm test` release run passed, including all app/security and planet
suites. The final font-token correction also passed targeted Finance theme tests and a new
app smoke run against the final build. The final strict Jekyll build and all 258 internal
links passed. The JavaScript build retains the pre-existing duplicate `head` warning in
`world/robot.js`; this change does not touch that file.

Current main advanced only with two Audible data sync commits; this task's changes remain
isolated in the named worktree. No public screenshots or actual financial data were added.
PR #160 merged with Steve's approval and deployed successfully on November 12, 2026.
Production run 43121030420 initially stopped on the holiday smoke test: its scenario assertions
passed, but the console recorded three GLTF blob-texture loading errors. The failed screenshot
was inspected, and the same holiday test passed locally with its strict console check intact.
Retrying the failed job passed and Pages deployment completed. The intermittent cause has not
been conclusively identified; no assertions were weakened.

## Deployed walkthrough: November 12, 2026

Hands-on CUA checks in signed-in Chromium, after deployment:

| Section | Observed workflow |
| --- | --- |
| Finance | Refresh; edit plan and cancel with focus restored; category selection; transaction pagination; search, no matches and clearing; expand correction fields without saving |
| Today | Open the empty outfit picker and cancel; focus returns to Log what you wore |
| Closet | Add and cancel; open garment details and Done |
| Trips | New trip and cancel with focus restored; open itinerary; switch packing filters and restore the original filter |
| Places | Open detail and Done; focus returns to the original place |
| Recipes | Add; empty submission correctly focuses required Name; cancel |

Finance's dock, toolbar and long plan editor, plus Recipes' search, creation and filters, were
also inspected at a 390px Chromium emulated phone viewport. This is not physical iPhone/Safari
coverage. Production records were not edited; write, failure, undo and security behavior remain
covered by synthetic fixtures and the preceding release checks. The original theme was preserved
and DevTools was closed after testing. No private records or screenshots are committed here.

Two polish defects were observed: closing a garment lost focus when redraw re-appended its card,
and dark-mode Finance sticky actions allowed fields to show through. The follow-up preserves a
focused visible Closet button across reordering and composites the action-bar background over
an opaque page color. A garment-close focus regression and dark/terminal editor screenshots
cover these cases. Targeted app and Finance checks, the full repository `npm test`, JavaScript
build, strict Jekyll and 258 internal links passed. Scrolled dark-mode phone and terminal desktop
editor screenshots were inspected. PR #161 subsequently merged and deployed at
`b0183bdb982c90a8a6cb5e7d8729fa81130c61be`, with all production jobs passing in
[run 43271582888](https://github.com/stevepisani/stevepisani.github.io/actions/runs/43271582888).
Its deployed CSS and JavaScript matched the tested build. On November 15, hands-on Chromium
verification confirmed garment Done returns focus to its original card and Tab advances to the
next card. Finance's scrolled actions were opaque on desktop and at 390 × 626; canceling the
unchanged plan restored the opener. No personal records were changed.

## Current completion audit: November 15

The previous goal turn made progress: PR #161's two deployed fixes were verified and the
[PR record](https://github.com/stevepisani/stevepisani.github.io/pull/161) updated. Completion of
the broader goal is still unproven. Current main differs only by Audible syncs since that merge.

| Requirement | Evidence and remaining work |
| --- | --- |
| Actual walkthroughs across six sections | November 12 section-by-section evidence above; mutation flows additionally use synthetic smoke fixtures. Today’s empty-plan handoff still needs a complete path check. |
| Mobbin comparisons | Inspected references above cover Finance, Closet, Trips and Recipes; retain domain and platform limits rather than infer missing flows. |
| Coherent buttons/forms/navigation/themes | PR #160 shared hierarchy, fields, distinct Finance icon, theme tokens and sticky actions; PR #161 focus/opacity verified live. Finance management still occupies too much phone space. |
| Feedback, accessibility and responsive behavior | Synthetic failure/retry/draft/privacy tests, keyboard correction walkthrough, live cancel/focus and emulated phone checks. Real iPhone/Safari remains untested. |
| Preserve data/security | Synthetic writes and owner/privacy checks passed; deployed walkthroughs did not edit records. No screenshots or private values are in this repository. |
| Release gates and durable tracking | PRs #160/#161 merged, CI/deployment/live checks passed. New changes below require their own checks, review, merge and deployment. |

The next live session opened a fresh Chromium profile at the sign-in screen, not the previously
authenticated tab. Sign-in was requested; this is a new session dependency, not evidence of a
regression or a completed walkthrough. Source and synthetic work can continue meanwhile.

### Finance management hierarchy (in development)

The previously observed phone toolbar puts five management actions ahead of the balances.
New iOS references were inspected: [Wealthfront](https://mobbin.com/screens/cd0cef83-c4cb-41a8-bed8-094c2c816377)
places account creation/linking below balance information; [Neo Financial](https://mobbin.com/screens/af3ef809-655b-4d32-b2c3-1ea257d816b3)
leads with spending, account filtering and categories. These inform hierarchy, not copied native
controls. The Copilot result is a metrics sheet, so it is not evidence for dashboard management.

The implementation keeps Month and Refresh visible, groups setup/maintenance under Manage,
and automatically reveals Import when a funding plan is missing. Choosing an action closes the
panel; Escape closes it with focus retained. Cancel returns to Manage if its opener is folded.
Targeted Finance desktop/phone tests passed, including disclosure/Escape, cancel focus, all
existing management actions and privacy behavior. Screenshot review caught the month field
overlapping Refresh at 390px; the narrow layout now uses two rows and a non-overlap regression
passes. The corrected expanded phone panel was inspected. JavaScript build, strict Jekyll and
258 links passed before that final CSS adjustment; final build/full suite, fresh hands-on
synthetic review and PR/deployment gates remain. This work is local and not yet published.

Release-check follow-up: the full command passed the model/schema and targeted UI tests, then
exposed an outdated backup-export helper that clicked a now-hidden control. The verifier now
opens Manage when needed; its desktop and phone synthetic runs passed export, anonymous access,
offline clearing, sign-out and owner isolation. The remaining full smoke suite is running
(`/tmp/sjpj-manage-smoke.log`); do not infer a pass yet. The expanded desktop management
screenshot was inspected too. Chromium is unlocked but the live Today tab still shows sign-in;
its authenticated walkthrough remains pending. No personal records were changed.

Hands-on synthetic browser verification passed: Manage opened with Return, Escape closed it
and retained focus, Edit plan focused its first input, and Cancel restored Manage focus.
The original live sign-in tab was restored. Empty-plan guidance now precedes the toolbar so
the automatically expanded panel cannot obscure it; desktop/phone non-overlap assertions
and the targeted Finance suite passed, and the 390px empty-state screenshot was inspected.
The broad smoke run is still active; the final source adjustment needs a rebuilt-app check.

## Web and MCP parity audit — November 15

The web app and the embedded MCP card are separate interfaces. A web CSS or focus fix does
not establish parity in chat. Source inspection of `mcp/server.js` and `mcp-app/widget.js`
confirms the following; this is not a claim of a fresh deployed connector walkthrough.

| Area | MCP tool coverage | Embedded interface | Remaining evidence/work |
|---|---|---|---|
| Today | Day/history tools registered | No dedicated Today view | Walk the planning handoff and chat-to-web outcome |
| Closet | Wardrobe tools registered | Closet, garment and ingest views | Recheck keyboard navigation, focus, feedback and host themes separately from web |
| Trips | Trips, packing and trip parts registered | Itinerary and packing views | Recheck navigation, packing feedback and responsive host behavior |
| Places | Saved-place reads registered | No dedicated Places view | Record the read-only boundary in the workflow comparison |
| Recipes | No recipe area registered | No recipe view | Capability gap; not delivered by the web button changes |
| Finance | No finance area registered | No finance view | Capability gap with a deliberate authorization boundary |

Finance's `can_finance()` currently rejects OAuth tokens carrying `client_id`. Existing
wardrobe connector consent must not be widened implicitly to financial records. Any future
Finance MCP implementation needs explicit scoped authorization, owner isolation, denial tests,
and its own deployment verification. No such access is introduced in the current UI change.

Next parity pass: inspect the existing chat card with synthetic records and the actual host
bridge, document concrete interaction differences, and separate UI fixes from new tool/access
capabilities. Recipe and Finance capability work requires its own coherent implementation and
review; neither is represented as completed in this audit.

Final-source validation: JavaScript build, strict Jekyll build into an isolated temporary
destination, and all 258 internal links passed. The real built-app Finance verifier also
passed against that final build on desktop and phone. Final test review also restored populated
records before the sign-out race test (after the empty-plan case); that strengthened desktop/phone
regression passed. Its optional site-directory argument
allows this check without replacing files used by an in-progress smoke run. The broad smoke
run remains pending; no release or live parity completion is claimed.

Release gate update: the full smoke suite completed with exit code 0 and `smoke test passed`,
including desktop/phone apps and offline behavior, desktop/phone planets, holidays, embedded
cards, host fallbacks, reduced-motion responses and no-WebGL behavior. Earlier pending-run
notes above are superseded by this result. Combined with the completed model/schema checks,
final build/link checks and final Finance UI/built-app checks, local validation is complete.
PR CI, review, deployment and authenticated live verification remain open.

### Observed MCP keyboard follow-up

A hands-on Chromium walkthrough used the existing built MCP card inside the official
AppBridge with two synthetic garments and read-only tool responses. Tab entered the first
garment; Return opened its detail, but focus moved to the frame. Tab reached Back; Return
returned to the full wardrobe, but focus again moved to the frame instead of the garment.
Selecting Tops also lost focus; the next Tab restarted at All. This confirms the web focus
fix did not carry into the separate card renderer. No live connector or personal records
were used. The live Today tab was restored and still requires sign-in.

Follow-up acceptance: detail navigation focuses a meaningful heading or Back action, Back
restores the originating garment when present, and filter redraw preserves the activated
filter. Verify with the actual host bridge and a hands-on keyboard repeat before claiming
MCP parity. This issue is separate from the compact Finance controls in PR #162.

MCP focus implementation (isolated `codex/sjpj-mcp-focus` checkout): garment details now focus
their heading, Back restores the original garment, and category redraw keeps the activated
filter focused. The official AppBridge regression passed desktop/phone, light/dark and
fullscreen/inline-only combinations. A hands-on Chromium repeat confirmed heading focus,
Shift+Tab to Back, return to the garment, Tops retaining focus, then Tab advancing to Shoes.
Synthetic screenshots were inspected; no personal data or connector writes were used. The
regression is included in npm test and the app smoke CI job. Full release checks remain.

MCP focus release validation completed: JavaScript build, strict Jekyll, link checks and the
full npm test command all passed with exit code 0, including the existing card-in-chat
integration and full smoke suite. The focus follow-up is ready for draft review; CI, merge
approval, deployment and live-host verification remain.

## Live desktop recheck — November 18

PRs #162 and #163 were merged after their PR checks passed. Production deployment and
verification of those new bundles remain pending; the observations below are of the preceding
live version in an authenticated Chrome window. No records were saved or changed.

- Finance initially remained at its loading message. A full toolbar reload with Chrome brought
  to the foreground completed the permission check and all five table reads, including the
  transaction pages. This does not establish a server or authentication failure. The old toolbar
  was still present. Edit plan opened, and Cancel restored focus to Edit plan.
- Closet opened a garment and Done returned focus to its originating tile.
- Trips opened the itinerary and packing list. The Packed filter changed the view, but focus
  fell back to the document rather than staying on the activated filter.
- Places opened a saved-place detail; Done restored focus to the originating item.
- Recipes filtered the collection to cooked recipes and retained focus on that filter. The
  collection was returned to All.
- Today moved to the preceding date and back to the current date. Both date-button redraws
  lost focus to the document. Preserve the corresponding date control in a follow-up.

The temporary checkouts for the unpublished Today planning handoff and additional MCP trip
focus work were no longer present. Neither follow-up was included in these merges; recovery,
fresh validation and review remain necessary. The published MCP garment focus change in
#163 is separate from that unfinished trip work.

PR #162's production run 44400188747 subsequently passed and deployed. A fresh live reload
showed the compact toolbar. Manage opened with Enter, Escape closed it while retaining focus,
Edit plan focused the first field, and Cancel restored Manage focus. Refresh completed and
restored the dashboard. These controls are now verified live; #163's production run remains
in progress. No financial records were changed.

PR #163's production run 44400332493 also passed and deployed. The public card bundle
downloaded afterward (SHA-256 `2f3d0136898cc780a694ed0574aef594e222a8f369850e58a298dff8dbef0abf`)
passed the existing MCP card focus regression in all eight desktop/phone, light/dark and
fullscreen/inline combinations. The regression used that downloaded script with synthetic
records and the official AppBridge; all network requests were blocked. The phone dark-theme
screenshot was inspected. A live read through the SJPJr connector succeeded too. No embedded
SJPJr app tab was available in this chat, so an actual chat-host card walkthrough remains
unverified. Server card-script caching can delay a new resource by up to ten minutes, and an
already-open host card may need refreshing. This result does not claim complete web/MCP parity.

## Today and packing focus follow-up — November 19

The web redraw now restores the focused Today date direction, or the enabled opposite direction
at the trip boundary. Packing chip redraws retain the focused status or traveler value, including
Everyone's empty value. Restoration checks the current focused element rather than retaining
a stale opener across asynchronous weather loading. The app regression adds keyboard activation,
forward Tab continuity and first-trip-day fallback checks. Build and link checks passed; browser
validation and actual chat-host verification remain pending.

The actual SJPJr card was expanded into this chat's side panel. Opening a garment returned
its real detail and focused the garment heading; Back returned to the same wardrobe tile
with focus restored. Both focus states were confirmed against the host DOM, and the final
focused tile was inspected visually. No records were changed. This verifies the published
garment open/Back fix in the actual host; this compact one-item card did not expose category
filters, whose eight synthetic-host combinations remain the separate evidence.

The focused app integration suite passed, including the new Today and packing assertions,
existing edits/undo, member isolation, real host-bridge fixtures and offline replay. The
boundary-focus screenshot was inspected. Full `npm test` then passed with exit code 0,
including model/schema/security checks, Finance and MCP UI tests, desktop/phone homepage,
holiday, planet preview and no-WebGL coverage. PR CI, review and deployment remain.
