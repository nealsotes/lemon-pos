# Lead Backlog

Running log of defects and improvement items the team lead tracks outside the currently active roadmap phases. Each entry carries evidence, a disposition, and its routing. Supersedes ad-hoc notes in task results.

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