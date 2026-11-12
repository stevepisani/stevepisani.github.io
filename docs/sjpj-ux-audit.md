# SJPJr UX improvement audit

Active goal started November 11, 2026. Improve the whole app through observed workflows,
specific Mobbin comparisons, implementation and verified desktop/mobile behavior. Preserve
the app's identity, data, permissions and Finance's private-storage boundaries.

## Walkthrough coverage

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
editor screenshots were inspected. Follow-up CI, merge approval and deployed recheck remain;
these fixes are not part of the already deployed PR #160.
