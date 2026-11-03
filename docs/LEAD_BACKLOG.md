# Lead Backlog

Running log of defects and improvement items the team lead tracks outside the currently active roadmap phases. Each entry carries evidence, a disposition, and its routing. Supersedes ad-hoc notes in task results.

**Project concluded 2026-11-03** — completion-gate motion `t_df200982` unanimously ADOPTED: every adopted roadmap item landed with cited commits (item 1 offline/idempotency `t_2961a346`; item 2 reporting math `t_13913d80`/`t_83c4f349`; item 3 security RC-01..RC-05, phase-2 fan-in `t_308c3403`; item 4 coverage growth 56→171 via `430879c`/`t_08a7942f`), LB-001..004 below are all FIXED with gate IDs, and fresh runs at HEAD `07307d5` give backend 238/238 + frontend 56/56 (combined 294/294) green. The two deliberately deferred remainders below — DR-001 (roadmap item 5) and DR-002 (rider H1) — were never voted into task scope (phase-2 gate `t_15c91c93` deferred item 5 as an "owner-level decision" and sequenced H1 after RC-05), so they are recorded here as future **owner-decision** work, explicitly NOT open defects, per action item 2 of `t_df200982`.

## DR-001 — Roadmap item 5: PWA/offline owner decision + code-quality sweep (DEFERRED)

**Logged:** 2026-10-31 via roadmap motion `t_ae2cae3c` · **Status:** DEFERRED at the 2026-11-03 conclusion — never adopted into task scope (`t_15c91c93`: item 5 "needs an owner-level decision") · **Effort estimate:** ~2 dev-days (sweep qa-mechanical, decision owner) · **Origin:** item 5 "PWA/OFFLINE DECISION + CODE-QUALITY SWEEP (C3, H7-H10, H6/H11/H12)" in the adopted consolidation of frontend audit `t_32af13da` (103 findings).

Two halves from the adopted text, decision comes first:

1. **PWA/offline owner decision.** Re-enable the production-disabled service worker with a cache strategy, or formally descope the offline-PWA promise. Verified at source at HEAD `07307d5`: `frontend/src/main.ts:32` reads `enabled: false, // Temporarily disabled: !isDevMode()` while the PWA machinery itself is fully wired — `frontend/ngsw-config.json` + `angular.json:38` `ngswConfigPath` and `pwa.service.ts:149` registering `/ngsw-worker.js` — so the offline-shell config exists but never activates (frontend audit critical C3: "PWA service worker disabled in production so no offline shell exists"). This is a reversal-or-descope of a shipped product decision rather than a defect: "item 5's PWA re-enable-vs-descope fork is genuinely an owner call (it reverses a shipped product decision, not a defect)" (`t_df200982` discussion).
2. **Mechanical code-quality sweep (follows the decision).** destroy$/ngOnDestroy/OnPush sweep across flagged components (~20 findings, incl. the checkout money component — 1,331 LOC in the adopted roadmap text, **now 1,378** at `features/checkout/components/checkout/checkout-sidebar.component.ts`), plus one error channel with honest failure states ("kill the fake print success, the false P6/H6 'All clear' insight, silent catch sites"). Audit IDs C3, H7-H10, H6/H11/H12 from `t_32af13da`.

### Why it survives the conclusion

The gate's QA verdict pinned the gap as known-and-deferred: "the frontend suite (56 specs) is a thin net relative to 18 services/26 components — a coverage gap that is precisely roadmap item 5, i.e. deliberately deferred, not an open adopted item" (`t_df200982` discussion). Nothing in this entry blocks the concluded HEAD `07307d5`.

### Routing

Owner decision first (Neal): re-enable PWA vs formal descope. If scheduled: lp-dev + lp-qa mechanical sweep, ~2 dev-days per the adopted estimate, scoped per this entry and the frontend audit artifact on `t_32af13da`.

## DR-002 — Rider H1: anonymous public-menu endpoint to unblock the QR menu (DEFERRED)

**Logged:** 2026-10-31 via the quick-wins rider in motion `t_ae2cae3c` · **Status:** DEFERRED at the 2026-11-03 conclusion — the only rider item not landed (H2+TA-02 `7016ba9`, OT-02+OT-03 `07486bc`, gitignore `8363cb6` all landed) · **Effort estimate:** ~0.5 dev-day-half.

### Defect today (verified at HEAD `07307d5`)

The QR menu is served unauthenticated but its data endpoints are role-protected, so an anonymous scan dead-ends on 401:

- `app-routing.module.ts:20` mounts it unauthenticated: `{ path: 'menu', component: PublicMenuComponent }` ("Public menu - no auth required").
- The component loads through the POS catalog service (`features/pos/components/public-menu/public-menu.component.ts:39-58` → `GET /api/products`, `GET /api/products/categories`).
- Backend `ProductsController.cs:11` is class-scoped `[Authorize(Roles = "Owner,Employee,Admin")]` with no `[AllowAnonymous]` on the list/categories actions (`:44`, `:371`) → 401 for an anonymous menu visitor (frontend audit L4: "public menu calls role-protected endpoint (401, anonymous menu dead)").
- The consumer ships already: the checkout QR generator codes `${origin}/menu` by default (`features/checkout/components/qr-code-generator/qr-code-generator.component.ts:32-39`).
- The only anonymous API surface today is the RC-05-confined image route (`ProductsController.cs:286-287`; confined to uploads by `e384a44`) and the settings read (`SettingsController.cs:22`) — nothing menu-shaped exists yet.

### Sequencing constraint recorded in the adoption vote

lp-dev (`t_ae2cae3c`): "the public menu endpoint should land AFTER item 3's path-traversal fix (RC-05) or at minimum ship as a read-only whitelisted DTO that doesn't touch the image path, so we don't add a second anonymous endpoint while the first anonymous hole is still open." **Precondition satisfied:** RC-05 landed (`e384a44`) and gate-verified (`t_308c3403`) — H1 is sequencing-unblocked; only the owner's go is missing.

### Routing

Owner decision (Neal): schedule or keep parked. On go: shape = read-only, GET-only, whitelisted DTO (no image-path exposure, only fields the owner wants public); lp-dev implements, lp-qa gates with an anonymous browser walkthrough of `/menu` plus both suites green.

## LB-004 — A real standard products export (.xlsx/.csv) cannot be re-imported: header detection keys on grid[0], so every row errors "Name is required."

**Logged:** 2026-11-03 · **Status:** FIXED 2026-11-03 — commit `f964906` (header detection locates the real column-header row by content — kind-aware lead column ("Name"/"Date") + recognized-vocabulary match with ≥2 recognized columns and half the row recognizable, so foreign-sheet headers don't qualify — and data records stop at the workbook's next section marker ("PRODUCTS"/"BY CATEGORY"/… sheet stamps), so the By-Category summary block parses as neither records nor errors; a banner-less hand-built file whose first row IS the header still matches at grid[0], a zero-products export imports cleanly, and a no-recognizable-header file fails up front with one clear message and zero mutation); 6 new ImportServiceTests — incl. real `ExportService.ExportProductsAsync` byte round-trips in both .csv and .xlsx — landed in the same commit; QA gate t_5fe48ff9 re-verified at HEAD `f964906`: targeted ImportServiceTests 24/24, full backend suite 238/238 (232 prior + 6 new), 0 failed · **Severity:** moderate (fail-safe — zero mutation — but it breaks the documented export → edit → import loop: the Product Management UI downloads `GET /api/products/export?format=xlsx` and the import dialog uploads the picked file raw to `POST /api/products/import`) · **Origin:** found 2026-11-03 during the LB-003 QA gate (t_2123c7cc) while empirically checking pre/post identity for hot/cold-less products on real export bytes.

### Symptom

Re-importing a downloaded standard products export reports Created=0 / Updated=0 with a `Name is required.` error for every non-blank row — .xlsx and .csv alike. Probe-verified at HEAD 8edc909 AND at the pre-LB-003 revision 31625fd: outcomes byte-identical at both revisions (csv: 9 errors, xlsx: 4 errors), so it is unrelated to the LB-003 fix. Even the real header row itself errors — its leading cell "Name" lands under the bogus title-keyed column.

### Root cause

- `ImportService.ImportAsync` hardcodes `grid[0]` as THE header row (`Infrastructure/Services/ImportService.cs:108`) and keys every data row off it.
- `ExportService` writes a banner BEFORE the column header: `RenderCsv` emits a `products` title record, a `Generated: … UTC` line and a blank line before `PRODUCTS` + the real header (`ExportService.cs:480-499`); `RenderXlsx` writes the title + `Generated:` + blank into the sheet (`ExportService.cs:532-545`). `grid[0]` is therefore the 1-cell title, and every later record parses as data over a 1-column header where `GetValue(row,"name",…)` never matches → `Name is required.` per row.
- Even with banner-skipping fixed, the products workbook also carries the `By Category` summary sheet (`ExportService.cs:119-132`), whose summary rows also land in the Products parse — needs the same total/summary-block exclusion as `IsBlankOrTotalRow`.

### Disposition

Header detection must locate the real column-header row (skip the export banner records/rows) instead of `grid[0]`, and must exclude the By-Category summary block, before "export → edit → import" round-trips end-to-end. LB-003's fix is verified unaffected (identity probe ran clean at both revisions). Left for lead arbitration (t_75c9c242) rather than auto-assigned a fix.

**Resolved** 2026-11-03 (commit `f964906`): `FindHeaderRowIndex` scans the grid for the real header row by content — the leading cell must be the kind's primary column ("Name"/"Date") and a multi-cell row must carry ≥2 recognized columns covering at least half the row (the vocabulary includes the informational Created/Updated/Total Value columns the import itself ignores, so real export header rows still qualify); a lone primary-cell row (degenerate one-column file) still matches, so banner-less hand-built files whose first row IS the header keep importing unchanged. Data records stop at the first section marker (`ExportSheetMarkerNames` — "PRODUCTS", "BY CATEGORY", …, the single-cell sheet stamps ExportService writes between CSV sheets), so the appended By-Category summary block parses as neither records nor errors (pre-fix it could upsert a product from category totals). A file with no recognizable header throws up front ("Could not find a recognized column header row…") with zero mutation; a zero-products export imports cleanly without a crash. QA gate t_5fe48ff9: real-export byte round-trip (csv+xlsx) green with created+updated == row count and an EMPTY error list (no `Name is required.`), summary block contributing no upserts/errors; empty-catalog export imports cleanly; banner-less header-first CSV still imports; LB-003 pin `ImportAsync_ProductsReimport_HotColdColumnsAbsentCarryOver_PresentColumnsWinAndBlankCellsClear` 1/1; full backend suite 238/238 (232 prior + 6 new), 0 failed. Evidence attached to the gate card.

## LB-003 — Product import nulls Hot/Cold prices for rows without those columns

**Logged:** 2026-10-31 · **Status:** FIXED 2026-11-03 — commit `86e467c` (hot/cold read branches on column presence: Hot/Cold columns ABSENT → the live row's HotPrice/ColdPrice carry over; column PRESENT → the value imports and a blank cell is an explicit clear, `HasHotCold` derived from the final values); round-trip pin test `ImportAsync_ProductsReimport_HotColdColumnsAbsentCarryOver_PresentColumnsWinAndBlankCellsClear` landed in commit `8edc909`; QA gate t_2123c7cc re-verified at HEAD `8edc909`: targeted pin 1/1, full backend suite 232/232, and a pre/post worktree probe (31625fd vs 8edc909) proved the standard-layout round-trip for hot/cold-less products byte-identical (UpdateProductAsync payload: HotPrice/ColdPrice null, HasHotCold=false, every other carried field intact) · **Severity:** low (only affects files without Hot Price/Cold Price columns, e.g. stale exports or hand-built CSVs — the standard product export always includes them; the separate fact that whole-file export bytes do not currently re-import is now tracked as LB-004 and was verified identical pre/post during this gate) · **Origin:** noticed while fixing OT-03 (rider batch B, t_b8af3d46).

### Root cause

`ImportService.ImportProductsAsync` treats a missing/blank Hot Price or Cold Price column as "no hot/cold pricing": `hotPrice`/`coldPrice` parse to null and the upsert sets `HotPrice = null, ColdPrice = null, HasHotCold = false`, which `ProductService.UpdateProductAsync` then overwrites the live row with. Contrast the Low Stock Threshold fallback (`ParseOptionalInt(...) ?? existingProduct?.LowQuantityThreshold`), which carries the existing value when the column is absent.

### Disposition

**Resolved** 2026-11-03 (commit `86e467c`): the import now distinguishes "column absent" from "column present" via `ContainsKey` over the normalized headers — `ToRow` stores an entry per populated header, same synonyms `GetValue` matches. Absent Hot/Cold columns carry `existingProduct?.HotPrice`/`.ColdPrice` over (mirroring the Low Stock Threshold fallback this entry proposed); present columns win — a value imports, a blank cell is an explicit clear — and the `HasHotCold = hotPrice.HasValue || coldPrice.HasValue` derivation (unchanged) keys off the final values. QA gate t_2123c7cc: pin test green at HEAD, full backend suite 232/232, pre/post identity probe byte-identical for hot/cold-less products (see also LB-004, the adjacent whole-file export-bytes finding logged during the same gate).

## LB-002 — AuthService.GetUserFromTokenAsync can never resolve a user: claim-type lookup contradicts the tokens the same service mints

**Logged:** 2026-10-31 · **Status:** FIXED 2026-10-31 — commit `e681af1` (read side of `GetUserFromTokenAsync` resolves BOTH claim forms; mint side + wire contract byte-unchanged); live `POST /api/auth/validate` verified `{valid:true}` for a self-minted token in t_bfe79f59, and re-verified at phase-2 HEAD 07486bc by the phase-2 QA gate (t_308c3403): AuthServiceTests 20/20 incl. the reworked pin `GetUserFromTokenAsync_ServiceMintedToken_ResolvesUserFromShortClaimKey`, guard `GetUserFromTokenAsync_TokenWithOnlyAnIdentifierClaim_ReturnsNull`, IdP-shape pin `GetUserFromTokenAsync_TokenCarryingTheLongClaimType_LoadsUserByUsername`, and the `unique_name`/`nameid` wire-contract asserts (AuthServiceTests.cs:165-166); full suite 231/231 · **Severity:** latent (breaks `POST /api/auth/validate` only; the SPA's `validateToken()` has no callers today — `frontend/src/app/core/services/auth.service.ts:222`) · **Origin:** exposed by roadmap item 4 coverage work (t_08a7942f), proven by a standalone JWT probe against the repo's exact JWT package version.

### Symptom

`POST /api/auth/validate` returns `{ valid: false }` for any token minted by this service, no matter how fresh or correctly signed.

### Root cause

- `AuthService.GenerateToken` builds claims with the long `System.Security.Claims.ClaimTypes` URIs (`ClaimTypes.Name`, `NameIdentifier`, `Role` — `Infrastructure/Services/AuthService.cs:131-136`). `JwtSecurityTokenHandler`'s **outbound claim map** writes these into the JWT as the short payload keys `unique_name` / `nameid` / `role`.
- `AuthService.GetUserFromTokenAsync` then parses the raw token with `tokenHandler.ReadJwtToken` (`AuthService.cs:109`) — which returns the payload's **raw** claim types with no inbound mapping — and greps for `c.Type == ClaimTypes.Name` (`AuthService.cs:110`), i.e. the long WS-Fed URI. A raw payload never carries that key, so `username` is always null and the method returns null before the repository is ever consulted.
- Proven with the shipped JWT package: `ReadJwtToken(GenerateToken(...)).Claims` yields exactly `unique_name`, `nameid`, `role` (plus nbf/exp/iat/iss/aud).

### Disposition

**Resolved** by the adopted vote (motion t_15c91c93): keep the long-name mint and its pinned wire contract byte-unchanged; the read side (`GetUserFromTokenAsync`) now accepts both the raw payload's short `unique_name` form and the literal long ClaimTypes.Name URI (external-IdP-shaped tokens). A nameid-only token returns null without a repository call, so the identifier claim can never stand in for a username.

## LB-001 — Reports "Revenue by Category" renders ₱0.00 / blank share % (display-field mismatch)

**Logged:** 2026-10-31 · **Status:** FIXED 2026-10-31 — contract-preserving UI rebind landed (see git log `fix(reports)`); card re-verified in the running app against `GET /api/reports/category` (drinks ₱910.00/91.0%, bakery ₱90.00/9.0%) · **Severity:** display-only (API data is correct; no money at risk, but user-facing wrong figures on a money screen) · **Origin:** discovered live during the roadmap item 2 acceptance gate, step 4 (t_fa5f2c6a); explicitly declared outside the authorized gate scope by the consolidator t_7ce1ca44 — the item-2 gate verdict remains PASS at HEAD 8363cb6.

### Symptom

Admin → Reports → Sales tab, card "Revenue by Category" renders every category row with ₱0.00 and a blank share %, while the API returns real rows. Verified 7-day window: rows `drinks` and `bakery` visible on screen, both zeroed. Evidence screenshot `05-reports-dashboard-7d.png` on t_fa5f2c6a; live payload recorded there and cross-checked against `GET /api/reports/category`:

```
[{category: "drinks",  quantity: 13, revenue: 910.0},
 {category: "bakery",  quantity:  3, revenue:  90.0}]
```

### Root cause

- Template binds fields the endpoint does not emit — `frontend/src/app/features/admin/components/reports/reports.component.html:300` (`[style.width.%]="cat.percent"`), `:304` (`formatCurrency(cat.total)` → renders ₱0.00), `:305` (`cat.percent | number:'1.1-1'` → renders blank).
- Rows flow into the template raw from the API: `reports.component.ts:856-857` assigns `this.categoryBreakdown = data || []` straight from `transactionService.getCategoryReport(...)` (`features/checkout/services/transaction.service.ts:383-385`); there is no remap to `{category, total, percent}` anywhere. The only endpoint field the TS consumes is `.category` (`reports.component.ts:102`, the "Top Category" quick stat), which is why the row names render fine.
- Endpoint emits `{category, quantity, revenue}` per row: `backend/PosSystem/PosSystem/API/Controllers/ReportsController.cs:67-75` → `ReportingService.GetCategoryReportAsync`; contract verified live during gate step 4.
- Likely origin: the UI was written against a planned/assumed `{category, total, percent}` contract that was never shipped. The stale spec `docs/superpowers/specs/2026-03-30-reports-overview-enrichment-design.md:61` still documents the endpoint as "Returns category name, total, and percent", contradicting the actual wire contract.

### Disposition (lead decision)

Fix now as a **quick win on lp-dev** rather than folding into a future report-frontend phase: user-visible wrong money on a reports screen is exactly the trust-defect class the adopted roadmap targets, the fix is template-scale, and no adopted-roadmap card covers it (item 1 done t_2961a346; item 2 done t_83c4f349 + gate PASS 8363cb6; item 4 = zero-coverage test harness queued for lp-qa as t_08a7942f).

**Decided fix direction — keep the endpoint contract, rebind the UI** (the endpoint is verified against the ledger and consumed elsewhere; changing it would invert the cost/benefit):

- Render `formatCurrency(cat.revenue)`.
- Drop `cat.percent` or compute the share client-side: bar width and % label = row `revenue` ÷ Σ(revenue of the response rows) × 100. Share basis is **revenue** (the card is "Revenue by Category"); `quantity` stays available as row meta if wanted.
- A tiny TS helper/mapped getter is acceptable if that reads cleaner than inline math.
- Do NOT change the endpoint shape; if a genuine blocker forces a contract change instead, update `transaction.service.ts` consumers, shared types, and the spec docs in the same change and explain it in the completion summary.
- In the same change, correct line 61 of `docs/superpowers/specs/2026-03-30-reports-overview-enrichment-design.md` (or delete the stale claim) so the doc stops contradicting the wire contract.

### Acceptance criteria

1. The card renders real per-category revenue and share % bound to the endpoint fields, with bar widths consistent with the shares.
2. Verified **in the running app**, not just unit-green: load the reports screen over a non-empty range (e.g. 7-day window) in a browser; on-screen figures reconcile ₱-for-₱ with the live `GET /api/reports/category` payload for the same window; screenshots recorded in the worker's run.
3. `ng test` suite stays green (51/51 baseline at HEAD 8363cb6).

---

*Entries here are tracked by the lead profile (lp-leader); implementation work is dispatched as kanban cards — see each entry's routing line.*