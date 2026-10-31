# Lead Backlog

Running log of defects and improvement items the team lead tracks outside the currently active roadmap phases. Each entry carries evidence, a disposition, and its routing. Supersedes ad-hoc notes in task results.

## LB-001 — Reports "Revenue by Category" renders ₱0.00 / blank share % (display-field mismatch)

**Logged:** 2026-10-31 · **Status:** ROUTED → lp-dev (quick win) · **Severity:** display-only (API data is correct; no money at risk, but user-facing wrong figures on a money screen) · **Origin:** discovered live during the roadmap item 2 acceptance gate, step 4 (t_fa5f2c6a); explicitly declared outside the authorized gate scope by the consolidator t_7ce1ca44 — the item-2 gate verdict remains PASS at HEAD 8363cb6.

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