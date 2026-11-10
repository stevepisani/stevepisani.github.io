# Finance replacement

Finance in SJPJr replaces the local Streamlit application. A snapshot viewer or a link to
Streamlit is not the finished product. The existing Python calculations may be reused behind
a private service; routine use must not depend on running Streamlit or keeping a personal
computer online.

The approved interface starts with cash available after protected obligations, with category
spending and transaction detail alongside it. Use the existing SJPJr shell, themes and controls.
Expected receipts are forecasts, never available cash. Stale or incomplete balances must be
visible and must not produce an unconditional available-to-spend figure.

## Replacement coverage

Inspect the existing implementation before replacing each calculation or connector. Keep a
comparison against its reviewed outputs, using synthetic equivalents in this public repository.

| Current capability | Replacement acceptance |
|---|---|
| Account balances and financial overview | Source timestamps, stale-account warnings, cash and debt totals, protected reserves and available funds |
| Bank and personal transactions | Import or connected refresh, repeat-import deduplication, review and correction, explicit transfer and reimbursement treatment |
| Income and contractor reconciliation | Collected income distinguished from invoices and financing; contractor obligations and settled payments counted once |
| Spending | Monthly target, category budgets, transaction drill-down and business expenses paid personally excluded from household spending |
| Debt and projections | Balances, obligations and forecast assumptions remain inspectable; expected income cannot fund today's spending |
| Tax planning | Reviewed calculation inputs, scenario comparisons, deductions and credits, estimated payments and remaining reserve, with source dates and unresolved questions |
| Retirement funding | Goal and contributions, affordability after taxes and contractor obligations, with contributions counted once |
| Evidence and exports | Private provenance and recoverable exports without publishing tax documents or personal records in the site repository |
| Connections | Visible refresh status and recovery path; credentials stay server-side or in the provider's authorization flow |

## Security gates before private data

Use synthetic records through development and initial deployment verification. UI visibility
alone is not authorization. Finance needs explicit server-side permission, owner isolation and
default denial; existing wardrobe membership or OAuth grants must not silently grant finance
access. Test unauthenticated access, another member, another owner, revoked access and attempted
owner changes, including direct API calls.

Do not put private records, actual financial examples, account identifiers, credentials or tax
documents in Git, static HTML, build assets, screenshots committed here or CI logs. Do not reuse
the general photos bucket as a financial document store without separately verified policies.
Keep financial responses out of service-worker caches and browser persistent storage. Clear
rendered data and pending results on sign-out and account change; verify offline and background
behavior. Validate imports, enforce bounded inputs and prevent untrusted text becoming HTML.

Before importing real records, verify the deployed permissions using synthetic data, inspect
the published assets for leakage, and demonstrate backup/export and recovery. Local database
tests do not establish production security. Record remaining risks plainly; do not describe
the system as absolutely secure.

## Cutover and retirement

1. Inventory existing views, calculations, data sources and recurring sync processes. Migrate
   the useful workflows, not just the summary numbers.
2. Build and verify locally with synthetic data. Follow the repository's draft PR, CI and
   explicit merge process; a branch Supabase workflow is a production deployment.
3. Verify deployed access controls with synthetic data before any private import.
4. Migrate through the authenticated private path. Reconcile counts, balances, classifications,
   income, contractor payments, taxes and funding against the retained local evidence. Record
   intentional differences and unresolved items instead of forcing totals to agree.
5. Confirm routine refresh, correction, scenario editing and exports work without Streamlit
   or a local process. Exercise connection failure and recovery and check phone use.
6. Make SJPJr the single active interface and source of edits. Stop Streamlit and retire its
   launch jobs, obsolete sync jobs and unused credentials. Retain a private read-only backup
   and calculation regression fixtures; retirement does not mean deleting source evidence.

The replacement is not complete until these gates pass. Until then the local application is a
temporary comparison and rollback tool, not a second permanent product.

## Implementation evidence

The first migration adds owner-scoped accounts, transactions, annual funding plans, category
budgets and reviewed tax scenarios. Amounts are integer USD cents; non-USD imports must be
converted with provenance before import. Transaction amounts use positive inflows and negative
outflows; credit account balances use positive amounts owed. Source keys enforce repeat-import
uniqueness, and a transaction's account must belong to the same owner.

`members.finance_enabled` is an administrator-controlled capability, initially false. The
`can_finance()` database function requires membership and refuses tokens containing an OAuth
`client_id`; current wardrobe connector consent grants no finance access. Every finance table
has forced row-level security, owner checks on reads and writes, no anonymous privileges and
no public view. Enabling real use remains gated on deployed verification.

`node tools/finance-test.mjs` runs the actual migrations twice in PGlite and checks grants,
non-enabled members, owner separation, cross-owner account references, OAuth denial, revocation
and input bounds. `node tools/finance-model-test.mjs` checks funding and spending arithmetic,
including stale balances, forecasts, refunds and excluded transfers/business expenses. Both
run in CI. These are local evidence only; deployed checks and cutover remain open.

The Finance tab is independently discovered through `can_finance()`, never from cached profile
sections. Its data stays in memory; finance REST requests use `cache: no-store`. Leaving the
section, hiding the page, losing the connection or signing out clears the display and invalidates
pending loads. Loading verifies the user again. The shell's other sections keep their existing
offline behavior. The real finance module is rendered with synthetic transport in
`node tools/finance-ui-test.mjs`: desktop and phone, no horizontal overflow, untrusted text,
classification correction, a pending-load/sign-out race and no localStorage writes. This
isolated module test does not replace the full shell or deployed checks.

The full app smoke test now also enables Finance for a synthetic member, verifies navigation
and the cash calculation through the real Supabase browser client, checks that leaving the tab
and signing out clear the records, and confirms a non-enabled member's Finance link never
requests financial tables. Those integrated checks pass locally; production remains unverified.

## Import, backup and review

`finance_import(payload)` accepts version 1 JSON arrays for accounts, transactions, plans,
budgets and scenarios. Its server-side whitelist rejects owner/id injection, fractional cents,
unknown fields, oversized files and cross-owner account references. All rows commit together
or none do. Source keys deduplicate transactions; a changed date or amount on the same source
key stops the import for review. Reimports preserve classifications, notes, plans and scenarios;
account balances advance only to an equal or newer timestamp. Pending transactions can become
posted. The browser previews record counts before the authenticated upload.

Export backup downloads this format with source keys instead of database owner/id fields.
Imports merge; restoring an empty account is supported, but importing into a populated account
is not a destructive rollback. Keep exported files private. Plan editing and transaction
corrections check `updated_at` to reject conflicting edits. The deployment's existing `MEMBERS`
secret accepts `finance_enabled: true`; omission or false revokes the capability. No membership
or financial values belong in this repository.

The import database tests cover rollback, duplicates and preserved corrections. Browser tests
also cover upload confirmation, plan edits and a backup download. Native bank CSV mapping,
legacy-data reconciliation and tax-calculation migration have separate local checks below;
production proof remains outstanding.

CSV import runs in the browser for Monarch, TD and Lili exports. Choose the destination account
and, for Monarch, the account inside the export. Mixed-account TD files are rejected.
Routing/account numbers are discarded. New
transactions start in review; Lili pending rows are omitted until settled. Source keys are
stable hashes of provider, destination, date, description, signed cents and occurrence number;
complete dates must be included in overlapping exports to preserve repeated identical purchases.
The server refuses mixing CSV providers in the same account. CSVs do not update balances.
The legacy migration must use these same keys for provider-derived records, not a second set
of arbitrary IDs. Native CSV and upload tests are included in CI.

Account creation and balance updates are available directly in the app, with observation time,
account type and signed cents. Existing balance edits use optimistic concurrency checks. This
lets a manual CSV workflow operate without a local server. Full app smoke tests passed after
fixing the test's top-of-page precondition for Today's refresh gesture; the separate test for
non-refreshing drags lower on the page remains intact.

## Tax planning engine

`finance-tax.js` ports the reviewed federal/NJ, self-employment, conservative SSTB QBI,
home-office, SALT and research-credit calculations. Eighteen synthetic fixtures produced by
those Python functions check parity, including retirement and research sensitivities. All
private amounts are inputs; the browser can create, save, reopen and compare a scenario, then
explicitly apply its remaining tax estimate to the funding plan. Inputs are preserved in the
private scenario record and backup format.

Scope: 2026, MFJ/NJ, one active Schedule C owner under 50 with no owner W-2 wages or other
retirement contributions; spouse wages can be entered. No capital gains, loss carryovers, AMT,
dependent credits or safe-harbor calculation. NJ home-office benefit remains unclaimed as in
the reviewed model. The minimum deduction/brackets and QBI thresholds were checked against
[IRS Revenue Procedure 2025-32](https://www.irs.gov/irb/2025-45_IRB); contribution assumptions
against the [IRS solo 401(k) guidance](https://www.irs.gov/retirement-plans/one-participant-401k-plans).

A deliberate change from the old sensitivity: potential R&D credit does not automatically
reduce the reserve. Enter the amount confirmed usable under the applicable
[general business credit limits](https://www.irs.gov/instructions/i3800). The engine caps it at
potential credit and ordinary income tax, never self-employment tax; it does not determine
Form 3800 eligibility or AMT. A newly modeled scenario defaults to zero usable credit. Existing
imported reviewed estimates stay separate and retain their assumptions; they are not silently
replaced. Real-data reconciliation must explain this distinction before cutover.

## Migration verification and remaining release gates

The real migration is prepared outside this public repository, with file mode 0600. Its
provider-derived keys use the same parser as browser CSV imports. The actual schema accepted
the complete private dataset in a local in-memory database; a second import did not duplicate
transactions. Income, contractor payments, cash profit and the reviewed spending month matched
independent legacy totals. No private migration data, amounts or source names belong here.
Noncash invoice-financing reconciliation is stored in a separate excluded account and explains
its date uncertainty. Stale bank balances remain unresolved and block funding availability;
only fresh balances enter cash/card subtotals.

The production dependency audit found GHSA-mrhx-c7xc-m3w5 in Zod bundled by the pre-existing
background-removal package. An npm override alone would not replace the bundled copy. The
existing call site supplies a fixed configuration object, but release review must document
reachability and mitigation rather than treating a clean finance test as a clean dependency
audit. Live permission/cache tests, public-artifact checks, review/merge, private import and
Streamlit retirement remain outstanding.


The embedded Zod array parser now receives a bounded-collection guard during the app build
(`tools/background-removal-hardening.mjs`). It rejects oversized arrays before element reads
or allocation, in synchronous and asynchronous paths. The transform checks the entire upstream
bundle SHA-256 and fails closed on an upstream change. Regression tests exercise the actual
embedded parser with a million-element sparse proxy and verify valid callback behavior.
This is a local mitigation, not an upstream package upgrade: npm audit still reports the
installed package versions. Remove the transform when a reviewed upstream release includes the
fix. No finance input is passed to background-removal configuration.

The service worker also refuses no-store requests, Authorization-bearing requests and finance
API paths, and does not cache private/no-store/no-cache responses. A sandboxed worker test
checks these branches and preserves public asset caching. Browser finance requests explicitly
use no-store; cross-origin database responses already bypass the worker.

After migrations deploy on main, `tools/finance-live.mjs` uses the workflow's existing
Supabase credential to create two temporary synthetic users. It checks anonymous denial,
explicit membership, owner isolation, forged ownership, cross-owner account references,
repeat imports and revoked access. It then deletes the synthetic users and membership rows;
owned records cascade on user deletion. Credentials stay in memory and logs contain no record
payloads. A verification or cleanup failure fails the workflow and blocks private import.
This API check does not replace deployed browser, sign-out, cache and backup checks. It must
not be run from an unmerged branch against production as a substitute for local tests.

After both main deployments finish, run the Supabase workflow on main with `verify_finance`
selected. This verification-only job does not deploy migrations or functions. It runs the
API checks plus `tools/finance-browser-live.mjs` against the published app on desktop and phone:
anonymous gate, authenticated synthetic records, backup export, persistent-storage checks,
offline clearing, sign-out and a switch to a second owner. Browser sessions remain in memory;
no credential-bearing traces or screenshots are saved. The temporary users and records are
removed even if a browser assertion fails. A successful run is required before private import.

Synthetic members have no household sections. Their browser requests permit only Finance,
membership and authentication APIs, so verification does not load shared recipes or other
personal sections. Each viewport gets a fresh synthetic session; the test never depends on a
session remaining usable after sign-out. Logs name only fixed verification stages, not tokens,
record contents or screenshots. The first deployed browser attempt failed with insufficient
stage detail; private migration remains blocked until a complete run passes.
`node tools/finance-browser-live-test.mjs` exercises that verifier against the actual local
build with intercepted synthetic API responses, including rejection of signed-out sessions.
It checks both viewport flows and prevents unrelated private API reads; it is regression
evidence, not a substitute for the deployed run.
