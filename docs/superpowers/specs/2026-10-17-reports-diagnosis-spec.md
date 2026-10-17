# Reports page — diagnosis and specification

**Task:** SWI-6 · **Author:** EngLead · **Date:** 2026-10-17
**Status:** For board review. No production code was changed by this task.
**Revision 2 (2026-10-17)** — revised after putting the page on screen in a real
browser at the board's request. Changes from revision 1: **C1 corrected** (the
KPI cap is a load-dependent race, not the unconditional ~70 % understatement
previously claimed, and it did not reproduce here); **C2 added** (the P&L tab
reports two different Net Profit figures for the same period); **L3 escalated**
(at 768 px the Export button is off-screen entirely, not clipped 12 px); **L5
reclassified** (the empty states resolve once loaded — symptom, not defect). See
§11 for what was and was not reproduced visually.

---

## 0. Headline

The two "existing branches" named in the brief are **not unmerged**. Both
`origin/feat/reports-production-polish` (`dead04f8`) and
`origin/feat/pnl-restructure-expenses` (`1daeda19`) are already ancestors of
`main`; `main` is 38 and 34 commits *ahead* of them respectively. They shipped
on 2026-04-03. They are not a pending fix for this complaint — **they are the
code the board is complaining about.** One of them is the direct cause of the
worst layout defect below. There is no branch to rebase and finish; this work
starts from `main`.

On slowness, the complaint is real and much worse than "slower than I would
like." Measured on a seeded one-year dataset, the reports page at its **default
"Today" setting** takes **26.5 seconds** to finish loading and pulls **50.4 MB**
over the network. At a 90-day range the same page takes **169 seconds**.

The cause is not rendering. Client-side scripting is 1.2 s and layout+style is
0.5 s of that 26.5 s. The cause is that the page issues 14 strictly-sequential
requests covering all four tabs, two of them unbounded full-table reads, against
report endpoints that load whole entity graphs into memory to aggregate them,
over a `Transactions` table with **no index on `Timestamp`**.

On screen this is unambiguous: five seconds after navigating to `/reports` the
viewport is still empty but for a "Loading reports…" spinner, and the page is
not finished for another half-minute.

Separately, and arguably more serious than either complaint the board raised:
the Profit & Loss tab displays **two different Net Profit figures for the same
day** — −₱43,294.73 in the statement and −₱53,850.47 in the Period Breakdown
immediately below it. That is **C2**, it reproduces against the API with no
browser involved, and it is gated on a board decision (**Q8**) rather than an
engineering one.

---

## 1. Scope and method

### What was measured

A throwaway MySQL 8 container (`swi6-perf-mysql`, port 3399, database
`quickserve_perf`), schema created by the application itself, seeded with
**fabricated** data by `.perf-harness/seed-gen.js`. The backend ran against that
database on `127.0.0.1:5099`; `ng serve` proxied to it on `127.0.0.1:4299`;
headless Chrome 155 was driven over the DevTools protocol. Nothing in this task
changed application code — the only files added are the harness and this
document.

**No production data was read, copied, exported or displayed.** The seeder
fabricates customers as `Walk-in` / `Counter Guest` placeholders and generates
no Senior Citizen / PWD identifiers, names, emails or phone numbers. The dev
MySQL instance on port 3307 was not reachable from the sandbox and was not used.
The `tb-prodcopy` container present on this machine was not touched.

### Data volume, and why

| Table | Rows seeded (365 days) | Rows in a 30-day window |
| --- | ---: | ---: |
| Transactions | 64,662 | **5,569** |
| TransactionItem | 161,789 | ~13,900 |
| AddOn | 73,155 | ~6,300 |
| StockMovements | 580,941 | **50,083** |
| IngredientLots | 3,120 | 260 |
| Expenses | 391 | 33 |
| Products / Ingredients / Recipes | 40 / 60 / 155 | — |

**Assumption the board should correct if wrong:** one busy single-location cafe
doing ~170 transactions/day (weekend-weighted), 1–4 line items per sale, ~6
distinct ingredients consumed per sale, trading for one year. That puts a 30-day
window at 5,569 transactions, which matches the volume the brief itself names.
If the client's real volume is materially different — multiple branches, or
only 30 transactions a day — **every number below moves and the targets should
be re-set.** This is open question **Q1**.

Measurements are medians of 3 runs (2 at 1/7/90 days) against a warm database on
one machine. They are useful for ranking causes and for pass/fail gating against
the same harness; they are not a model of Railway production hardware
(open question **Q4**).

---

## 2. Slowness — where the time actually goes

### 2.1 Real browser, default view (`/reports`, "Today", 1440×900)

| Metric | Measured |
| --- | ---: |
| Spinner replaced by content (`firstContentMs`) | **11,046 ms** |
| All API requests finished (`networkIdleMs`) | **26,477 ms** |
| Total API payload | **50,404 KB** |
| &nbsp;&nbsp;of which `GET /api/transactions` | 50,010 KB (**99.2 %**) |
| API requests issued | 23 |
| ScriptDuration | 1.22 s |
| LayoutDuration | 0.20 s |
| RecalcStyleDuration | 0.34 s |
| DOM nodes | 471 |

**Attribution.** Of 26.5 s: roughly **25 s is backend query time plus transfer**,
**1.2 s is client scripting**, **0.5 s is layout and style recalculation**. The
rendering of the Dashboard tab is not a problem at all — 471 DOM nodes. This
answers the brief's question directly: the slowness is backend and over-fetching,
not client-side rendering. (The one place where rendering *will* become a problem
is called out as **S10**.)

Note the gap between 11.0 s and 26.5 s: the user is shown a page at ~11 s that is
still missing data, and values appear underneath them afterwards. That is **S9**.

### 2.2 Endpoint timings by date range (median ms, direct HTTP)

| Endpoint | 1 day | 7 days | **30 days** | 90 days |
| --- | ---: | ---: | ---: | ---: |
| `reports/sales` (daily) | 177 | 367 | 1,388 | 1,780 |
| `reports/top-products` | 128 | 183 | 678 | 1,727 |
| `reports/sales` (trend 7d) | 239 | 284 | 221 | 213 |
| `reports/all-time-sales` | 10,483 | 6,869 | **7,786** | 7,173 |
| `reports/profit-loss` | 793 | 1,649 | 3,019 | 5,540 |
| `reports/inventory-valuation` | 175 | 372 | 637 | 1,227 |
| `reports/accountant-summary` | 2,300 | 1,061 | 1,646 | 4,500 |
| `reports/period-comparison` | 263 | 454 | 914 | 3,514 |
| `reports/category` | 108 | 216 | 486 | 1,604 |
| `reports/supplier-breakdown` | 67 | 61 | 67 | 222 |
| `reports/consumption` | 81 | 165 | 388 | 1,927 |
| `products` | 95 | 172 | 103 | 71 |
| `ingredients` | 163 | 132 | 24 | 85 |
| `stockmovements` (ranged) | 70 | 5,579 | **15,542** | **139,138** |
| **Sequential total** | **15,173** | **17,580** | **32,903** | **168,742** |
| **Total payload** | 45 KB | 1.7 MB | **9.1 MB** | **27.4 MB** |

Unbounded endpoints, measured separately (cold):

| Endpoint | Time | Payload |
| --- | ---: | ---: |
| `GET /api/transactions` (no filter) | **223,329 ms** | **48.81 MB** |
| `GET /api/stockmovements` (no filter) | **383,607 ms** | **111.92 MB** |

### 2.3 Root causes, in order of measured impact

**S1 — `loadAllData()` awaits 14 calls strictly in series, for all four tabs.**
`reports.component.ts:477-511`. Nothing runs in parallel and nothing is deferred
to the tab that needs it. One tab is visible; four tabs' data is fetched. The
"sequential total" row above is the direct consequence.

**S2 — `all-time-sales` is requested twice per load and ignores the date range.**
`ngOnInit` calls `loadAllTimeProductSales()` (line 196) and `loadAllData()` calls
it again (line 491). Confirmed in the browser trace: two requests, 18.1 s and
11.3 s. Server-side `GetAllTimeProductSalesAsync` calls
`_transactionRepository.GetAllAsync()` — the entire transaction history with full
item graphs — to produce a 7 KB response.

**S3 — `TransactionService`'s constructor downloads the whole transactions table,
and then throws the result away.**
`transaction.service.ts:18-31` → `loadTransactions()` (line 459) issues an
unbounded `GET /api/transactions` and then `saveToLocalStorage('transactions', …)`.
Measured: **48.8 MB / 223 s** cold; 50,010 KB and 99.2 % of all page bytes in the
browser trace. The service is `providedIn: 'root'`, so this fires app-wide, not
only on `/reports`.

The caching it exists for **does not work at this volume.** Measured on the app's
own origin (`storage-capacity-probe.js`): localStorage accepts **4 MB** before
`QuotaExceededError`. The write is ~48.8 MB. And `saveToLocalStorage`
(lines 508-514) catches the exception into an empty block, so the failure is
silent. The app therefore pays a 48.8 MB download plus a ~48.8 MB synchronous
`JSON.stringify` on the main thread, and persists **nothing**.

That blocking stringify is also observable: during it, CDP `Runtime.evaluate`
against the page stops responding for minutes, which is what a frozen tab looks
like to a user.

On the reports page this data feeds only the capped "recent transactions" list —
see **C1**, where the cap is also a correctness bug.

**S4 — `Transactions` has no index on `Timestamp`.**
`PosSystemDbContext.cs:45-99` configures the entity with no `HasIndex`, confirmed
against the live schema (`Key` column empty for `Timestamp`). Every ranged report
does a full table scan plus a filesort for `ORDER BY Timestamp DESC`. Eight such
queries run per page load. By contrast `StockMovements.CreatedAt`,
`Expenses.Date` and `IngredientLots.(IngredientId, ReceivedAt)` *are* indexed.

**S5 — report endpoints materialise entity graphs and aggregate in memory.**
`TransactionRepository.GetByDateRangeAsync` eager-loads
`Items → Discount` and `Items → AddOns` with change tracking on (no
`AsNoTracking()`); `ReportingService` then aggregates with LINQ-to-Objects. A
30-day page load materialises ~5,569 transactions, ~13,900 items and ~6,300
add-ons **eight times over**. None of these aggregates needs the rows — they all
reduce to `SUM`/`GROUP BY`.

**S6 — N+1 in `GetCogsByProductIdAsync`** (`ReportingService.cs:182-221`). One
`GetOldestActiveLotAsync` and possibly one `GetMostRecentLotAsync` per distinct
recipe ingredient — up to 120 sequential round trips at 60 ingredients. Called by
both `profit-loss` and `accountant-summary`.

**S7 — N+1 in the P&L breakdown loop** (`ReportingService.cs:328` and `:367`).
`GetProratedExpensesForPeriodAsync` is awaited once **per day** of the range, and
each call runs `GetByDateRangeAsync` + `GetRecurringTemplatesAsync` plus one
`GetOverridesForParentAsync` per active recurring template. A 30-day range adds
90–150 round trips. This is why `profit-loss` scales 0.8 s → 5.5 s.

**S8 — the Activity data is always fetched and usually discarded.**
`loadActivityMovements()` runs unconditionally inside `loadAllData()` and pulls
every stock movement in the range: **9.1 MB / 15.5 s at 30 days**, **27.4 MB /
139 s at 90 days**. The Inventory → Activity section is **collapsed by default**
(`inventoryExpanded.activity = false`), so this data is normally thrown away.
`toggleInventorySection()` already contains the correct lazy-load path
(line 1180) — `loadAllData()` makes it dead code.

**S9 — a 10-second timer hides the real duration and causes layout shift.**
`loadAllData()` sets `isLoading = false` after 10 s regardless of completion
(lines 481-483). Because all content is behind `*ngIf="!isLoading"`
(`reports.component.html:80`), the user gets a partially-populated page at ~11 s
and watches numbers fill in for another ~15 s.

**S10 — change detection will become the bottleneck once the data is fast.**
Default change-detection strategy; **162 method-call bindings** in the template;
**21 `*ngFor` loops with only 2 `trackBy`**. Not the current constraint (1.2 s),
but the Activity table renders `filteredActivityMovements` with no virtualisation
— at 30 days that is **50,083 rows × 7 spans ≈ 350,000 DOM nodes** the moment a
user expands the section.

---

## 3. Correctness defect found while profiling

**C1 — the default view's revenue KPI can silently sum at most 50
transactions. It is a race, not a certainty — corrected 2026-10-17 after
browser verification.**

`getTotalSales()` (`reports.component.ts:983-998`) returns
`sum(this.recentTransactions)` whenever `isCustomDateRange` is false.
`setDatePreset()` sets `isCustomDateRange = false` for exactly one preset —
**"Today"**, which is the default landing state. `recentTransactions` comes from
`getRecentTransactions(50)`, which `.slice(0, 50)`s
(`transaction.service.ts:342-370`). `getTransactionCount()` (line 1000) has the
same shape.

**What an earlier revision of this document got wrong.** It stated that the
Owner's headline revenue is understated by roughly 70 % on the default view. That
overstates the defect. Whether it manifests depends on a race:

`loadRecentTransactions()` (`reports.component.ts:677`) calls
`firstValueFrom(getRecentTransactions(50))` against a `BehaviorSubject` that is
seeded `[]` (`transaction.service.ts:15`) and filled by the app-wide full-table
download started in the service constructor (line 22). `BehaviorSubject` replays
its *current* value synchronously, so `firstValueFrom` resolves immediately with
whatever happens to be in the subject at that instant:

- Subject still empty → `recentTransactions = []` → both getters fall through to
  the backend `dailyReport` → **correct figures**.
- Subject already filled → up to 50 of today's transactions → **understated
  revenue and transaction count, with no error and no visual cue.**

In the measured configuration the race resolves the *safe* way, and this was
confirmed on screen: the dashboard renders Revenue ₱23,330.82 / Transactions 188,
which match the backend exactly and are not a 50-row sum. The reason is that the
48.8 MB download (S3) is slower than the report requests, so the subject is still
empty when the reports page reads it. The defect is therefore **latent and
load-dependent**: a smaller dataset, a warm cache, or any future change that
makes the transaction load land earlier flips it to the wrong branch.

That makes it harder to catch, not less serious — the failure mode is a
plausible-looking wrong number on the Owner's landing page. It does **not** change
discount, service-fee or VAT arithmetic; the fix is to read the already-correct
backend figure instead of a client-side array capped at 50, which also removes
the race. The acceptance criterion below is written to be deterministic rather
than to depend on which branch wins.

**C2 — the Profit & Loss tab shows two different Net Profit figures for the same
period, on the same screen. Found during browser verification, 2026-10-17.**

For a single day ("Today", the default), the P&L statement and the Period
Breakdown table immediately below it disagree:

| Figure | P&L statement | Period Breakdown row | Difference |
| --- | ---: | ---: | ---: |
| Expenses | ₱4,897.63 | **₱15,453.37** | ₱10,555.74 |
| Net Profit | −₱43,294.73 | **−₱53,850.47** | ₱10,555.74 |
| Net Margin | −185.6 % | **−230.8 %** | 45.2 pp |

Revenue, COGS and Gross Profit agree exactly; expenses are the only input that
differs, and each side is internally consistent with its own expense number.

This is **not** a rendering artefact of L1 and not an artefact of the synthetic
data volume. It reproduces directly against the API with no browser involved:
`GET /api/reports/profit-loss?startDate=<today>&endDate=<today>` returns
`totalExpenses: 4897.63` alongside `breakdown[0].expenses: 15453.371333…`.

**Cause.** `ReportingService.cs:284` computes the statement total with
`GetTotalExpensesForPeriodAsync(startDate, endDate)`, while
`ReportingService.cs:367` computes each breakdown row with
`GetProratedExpensesForPeriodAsync(dayStart, dayEnd, startDate, endDate)`. When
the requested range is a single day the two windows are identical, so the two
calls must return the same number by definition. They do not: the prorated call
is pulling in expense amounts from outside the requested window. The long
fractional tail on the breakdown figure is the signature of an amortisation
divide.

**Severity.** Both numbers are labelled "Net Profit" for the same day, so at
least one of them is wrong and the page gives the Owner no way to tell which.
This is money on screen and it is the figure an owner is most likely to act on.
Classified **broken**, equal in priority to the layout fix.

**This one is flagged under the arithmetic guard.** It is profit arithmetic, and
deciding *which* number is correct is a business question about how a recurring
expense should be attributed to a single day — not a question an engineer should
answer unilaterally. The fix is therefore gated on the board answering **Q8**
below. Writing a test that asserts the two figures agree for a one-day range is
not a change to the arithmetic and should be done first.

---

## 4. Layout — enumerated defects

Verified two independent ways: in the live app in headless Chrome, and in a
static reproduction (`.perf-harness/layout-probe.js`) that reads the component's
own `.css` and `.html` from disk so it cannot drift from the source. Both agree
exactly at every width they share. Each grid is measured as declared column
count vs. visible children vs. grid rows actually occupied — a correctly
specified grid puts one record on one row.

### L1 / L2 — the P&L breakdown table wraps every row in two, at every width. **Broken.** High priority.

- **Where:** Profit & Loss tab, period breakdown table.
- **Role:** Owner / Admin (the whole page is `[Authorize(Roles = "Owner,Admin")]`).
- **Viewports:** **all of them.** Two different causes either side of 640 px.

```
width  declaredCols  visibleSpans  gridRowsUsed   verdict
 1920             5             7             2   BROKEN
 1440             5             7             2   BROKEN
 1280             5             7             2   BROKEN
 1024             5             7             2   BROKEN
  900             5             7             2   BROKEN
  768             5             7             2   BROKEN
  640             3             6             2   BROKEN
  540             3             6             2   BROKEN
  414             3             6             2   BROKEN
  390             3             6             2   BROKEN
  360             3             6             2   BROKEN
```

Live-app confirmation at 1920, 1440 and 1024: `.pnl-table-head` and
`.pnl-table-row` both report `declaredCols: 5, visibleChildren: 7,
occupiedRows: 2` — identical to the static reproduction.

- **L1, ≥ 641 px.** `reports.component.html:513-523` emits **7** `<span>`s per row
  (Period, Revenue, COGS, Gross Profit, Expenses, Net Profit, Net Margin) while
  `reports.component.css:418` still declares
  `grid-template-columns: 1.5fr 1fr 1fr 1fr 0.8fr` — **5 columns**. Net Profit
  and Net Margin wrap onto a second grid line under every row, including the
  header, so no value sits under its own heading.
- **L2, ≤ 640 px.** `reports.component.css:543-544` switches to
  `grid-template-columns: 1fr 1fr 1fr` and hides only `span:nth-child(3)`,
  leaving **6 visible spans across 3 columns** — two rows per record, header
  misaligned again. The adjacent Activity table does this correctly
  (`css:904-917` hides children 5, 6 and 7 to match its 4-column mobile grid);
  the P&L table was never given the same treatment.
- **Regression origin:** `1daeda19` (2026-04-03, `feat(reports): restructure P&L
  tab…`) added the Expenses / Net Profit / Net Margin columns to the markup and
  did not update either CSS rule. Before that commit the markup had exactly 5
  spans and matched. This is a regression in shipped code, not an original design
  flaw — and it is the direct answer to "what is wrong with the layout".
- Fixing L1 without also fixing L2 leaves the tab broken on tablets and phones.

### L3 — the top bar overflows and the Export button is unreachable between roughly 700 px and 1200 px. **Broken.** Raised to high priority 2026-10-17.

- **Where:** top bar, primary **Export** action and the date-range picker.
- **Viewports:** measured broken at **1024×900** and **768×1024**. Not present at
  1440 or 1920.
- **Evidence at 1024:** `.top-bar-actions` and the `button.btn.btn-primary.btn-sm`
  both have a right edge at **1036 px** against a `clientWidth` of **1024 px** —
  12 px overhanging. `document.scrollWidth` is still 1024, so **no horizontal
  scrollbar appears**: the button is silently cut, not scrolled to.
- **Evidence at 768 (added after browser verification):** far worse than the
  12 px clip above. `.top-bar-actions` overflows by **188 px**, the date picker
  and all three of its descendants by **30 px**, and the refresh
  `button.btn.btn-ghost.btn-sm` by **82 px**. On screen the "Reports" title, the
  five date presets and the FROM/TO inputs are crammed onto a single line, the TO
  input is cut at the edge, and **the Export button is not visible at all.**
  Again `document.scrollWidth == clientWidth`, so there is nothing to scroll to.
- **Consequence:** an Owner on a tablet or a small laptop cannot export a report.
  That is a function the board cannot reach, not a cosmetic clip — which is why
  this is no longer medium priority.
- The top bar packs five date presets, two date inputs, a refresh button and the
  Export button onto one line; `@media (max-width: 640px)` stacks the date picker
  but nothing handles the 700–1200 px band. 1024 px is a common laptop and
  tablet-landscape width; 768 px is portrait tablet.

### L4 — margin health marker escapes its track on a loss-making period. **Ugly.** Low priority.

- **Where:** Dashboard tab, "Margin health" bar.
- **Cause:** `reports.component.html:141-142` binds `[style.width.%]` and
  `[style.left.%]` straight to `profitLossData.marginPercent`. `.health-bar-fill`
  is clamped by `max-width: 100%`, but `.health-bar-marker` is not, and
  `.health-bar-track` is `overflow: visible` (`css:1025-1051`). A negative margin
  — COGS exceeding revenue for the period — renders the marker outside the track.
  A negative width is also an invalid declaration, so the fill silently vanishes
  rather than reading zero.
- Classified **ugly, not broken**: it needs a loss-making period to appear and it
  misleads rather than obstructs.

### L5 — the whole page is behind an all-or-nothing spinner. **Unfamiliar, bordering on broken.** Medium priority.

- `reports.component.html:77-80` renders either the spinner or the content, never
  both, and S9 flips the switch on a timer rather than on completion. The result
  at the default setting is 11 s of spinner, then a page whose numbers change
  underneath the reader for another 15 s. An Owner reading a figure at 12 s may
  be reading a different figure at 20 s.
- Listed under layout because the remedy is a layout decision (per-card skeleton
  and per-section loading state) as much as a data-loading one.
- **Confirmed visually, and it is worse than "numbers change".** Captured at
  1440 px on the Dashboard tab: at 5 s the page is entirely empty but for a
  "Loading reports…" spinner; at an intermediate point the KPI strip has rendered
  but Gross Margin reads **"N/A"** and the Profit Snapshot card reads **"No
  profit data — No profit data available for this period."** Both are the
  component's genuine *empty states*, rendered because `profitLossData` is still
  null while the 14 sequential requests work through the queue.
- Left to settle (~36 s), the same view fills in correctly: Gross Margin
  −164.6 %, Profit Snapshot populated, insight banners present. **So these panels
  are not broken — they lie temporarily.** For tens of seconds the page
  confidently tells the Owner there is no profit data for a period that in fact
  has data, with nothing on screen distinguishing "still loading" from "nothing
  to show". An Owner who glances and leaves takes away a false answer.
- This reclassifies the empty states from "defect" to "symptom of S1/S6": fixing
  the sequential loading removes it, and a per-card skeleton makes the
  distinction visible in the meantime. Recorded here so a reviewer who sees "No
  profit data" mid-load does not file it as a separate bug.

### Not defects

No *scrollable* horizontal overflow was produced at any tested width
(`document.scrollWidth == clientWidth` at 1920, 1440 and 1024) — L3 is a clip,
not a scroll. The tab bar, date presets, KPI strip, two-column rows, accountant
grid and export grid all collapse correctly at their breakpoints. The Activity
table's responsive column hiding is correct and is the model the P&L table
should copy. Whatever else the board dislikes about the layout is **not** a
measurable defect and is open question **Q2**.

---

## 5. Targets

All targets are measured with `.perf-harness` at the **seeded volume in §1**
(5,569 transactions in the 30-day window), against the same machine, warm.
Re-baseline if Q1 changes the volume assumption.

| ID | Measure | Baseline | Target |
| --- | --- | ---: | ---: |
| **T1** | "Today" view, content visible with real data | 11,046 ms (stale) | **≤ 1,500 ms** |
| **T2** | "Today" view, all API requests finished | 26,477 ms | **≤ 2,500 ms** |
| **T3** | 30-day Dashboard, all API requests finished | 32,903 ms | **≤ 2,000 ms** |
| **T4** | 90-day Dashboard, all API requests finished | 168,742 ms | **≤ 4,000 ms** |
| **T5** | Total API payload, one page load at 30 days | 50,404 KB | **≤ 512 KB** |
| **T6** | Slowest single `/api/reports` call at 30 days | 15,542 ms | **≤ 500 ms** |
| **T7** | Requests issued on first paint of one tab | 23 | **≤ 8** |

---

## 6. Proposed changes, each with one pass/fail criterion

Criteria are written so a reviewer can mark them pass or fail without re-reading
the component. Every one is checkable with `.perf-harness`.

| # | Change | Pass/fail criterion |
| --- | --- | --- |
| **R1** | Add an index on `Transactions.Timestamp` (and a composite `(Timestamp, Status)` if the plan shows it helps) via an EF Core migration. | `SHOW INDEX FROM Transactions` lists an index with `Timestamp` as the leading column, and `EXPLAIN` on the 30-day report query reports `type=range` with `key` set rather than `type=ALL`. |
| **R2** | Stop `TransactionService`'s constructor from loading all transactions; remove the `localStorage` mirror of the full list (it cannot fit — see S3). | Loading `/reports` issues **zero** unbounded `GET /api/transactions` requests, and total page payload at 30 days is ≤ 512 KB (**T5**). |
| **R2b** | Stop `saveToLocalStorage` swallowing write failures silently. | A failed `localStorage` write is logged or surfaced; `node storage-capacity-probe.js` is referenced in the fix so the 4 MB ceiling is explicit. |
| **R3** | Paginate / bound `GET /api/transactions` and `GET /api/stockmovements` at the controller so an unbounded read is not reachable. | A request to either endpoint with no filter returns at most one page (default ≤ 200 rows) and responds in ≤ 500 ms at the seeded volume. |
| **R4** | Call `loadAllTimeProductSales()` once per load, not twice. | A single page load issues exactly **one** `GET /api/reports/all-time-sales`. |
| **R5** | Make `all-time-sales` aggregate in SQL instead of `GetAllAsync()`. **Touches money aggregation — see §7.** | `GET /api/reports/all-time-sales` responds in ≤ 500 ms at the seeded volume, and returns byte-identical JSON to the current implementation for the seeded dataset. |
| **R6** | Run the independent loads in `loadAllData()` concurrently instead of 14 sequential `await`s. | The browser trace shows the reports requests overlapping, and **T3** is met. |
| **R7** | Load only the active tab's data; fetch the other tabs' data when that tab is first opened. | Opening `/reports` on Dashboard issues ≤ 8 API requests (**T7**); switching to each other tab issues only that tab's requests. |
| **R8** | Delete the unconditional `loadActivityMovements()` from `loadAllData()` and rely on the existing lazy path in `toggleInventorySection()`. | A page load with the Activity section collapsed issues **no** `GET /api/stockmovements`; expanding it issues exactly one. |
| **R9** | Push the per-period expense proration out of the P&L day loop — fetch expenses and recurring templates once for the whole range and allocate in memory. **Touches money aggregation — see §7.** | `GET /api/reports/profit-loss` issues a constant number of DB round trips regardless of range length (verify by query log), responds in ≤ 500 ms at 30 days, and the existing `ReportingServiceDiscountTests` still pass. |
| **R10** | Compute the FIFO cost map in one query instead of 1–2 per ingredient. **Touches money aggregation — see §7.** | `GetCogsByProductIdAsync` issues ≤ 2 queries total, and returns the same map as the current implementation for the seeded dataset. |
| **R11** | Push `sales`, `top-products`, `category`, `period-comparison`, `accountant-summary`, `profit-loss` aggregation into SQL; add `AsNoTracking()` wherever rows are still read. **Touches money aggregation — see §7.** | **T6** met for every `/api/reports` endpoint, and every endpoint returns byte-identical JSON to the current implementation for the seeded dataset. |
| **R12** | Fix the "Today" revenue and transaction-count KPIs to read the backend sales report rather than the 50-item `recentTransactions` array (**C1**). | With 170 seeded transactions on the current day, the Dashboard revenue KPI equals `GET /api/reports/sales` `totalSales` for that day, and the transaction count equals `totalTransactions` — **and this holds whether or not `TransactionService` has finished populating its subject**, which the test must force both ways (pre-populate the subject with 50+ of today's transactions, and leave it empty). |
| **R19** | Add a regression test asserting the P&L statement total and the Period Breakdown agree (**C2**). **Test only — not a change to the arithmetic, and not blocked.** | For a one-day range over seeded data, `profit-loss` satisfies `totalExpenses == Σ breakdown[].expenses` and `netProfit == Σ breakdown[].netProfit`. The test is expected to **fail** on current `main`; that failing test is the deliverable. |
| **R20** | Make both expense call sites use the basis the board selects in **Q8** (**C2**). **Touches profit arithmetic — blocked pending Q8.** | R19 passes, and the P&L tab shows one Net Profit figure per period. |
| **R13** | Fix the P&L table grid to 7 columns at ≥ 641 px (**L1**). | `node layout-probe.js` reports `ok` — `gridRowsUsed: 1` — at 1920, 1440, 1280, 1024, 900 and 768, and each value sits under its own heading. |
| **R14** | Give the P&L table a correct ≤ 640 px rule — hide columns to match the declared count, as the Activity table does (**L2**). | `node layout-probe.js` reports `ok` at 640, 540, 414, 390 and 360, with `visibleSpans == declaredCols` at each. |
| **R15** | Stop the top bar clipping its primary action between ~700 and ~1200 px (**L3**). | At **both 1024×900 and 768×1024** the probe's `offenders` array is empty — no element in `.reports-container` has a right edge beyond `clientWidth` — and the Export button is visible and fully clickable at each. |
| **R16** | Clamp the margin-health fill and marker to 0–100 % (**L4**). | With `marginPercent = -40`, the marker's bounding box is inside `.health-bar-track` and the fill width is 0; with `marginPercent = 140`, both are at 100 %. |
| **R17** | Replace the all-or-nothing spinner with per-section loading states, and delete the 10-second `setTimeout` (**L5**, **S9**). | No `setTimeout` remains in `loadAllData()`; the page never displays a populated metric that later changes value without a user action; **T1** met. |
| **R18** | Add `trackBy` to the `*ngFor` loops that render API data, and virtualise or paginate the Activity table (**S10**). | With the Activity section expanded over a 30-day range, DOM node count stays under 5,000 and the section becomes interactive in ≤ 1,000 ms. |

---

## 7. Arithmetic guard — board approval required before any edit

The brief requires an explicit flag on anything touching **discount,
service-fee or VAT arithmetic**. Findings:

- **VAT does not appear in the reports path at all.** The only VAT arithmetic in
  the backend is in `PrintService.cs` (lines 252-264 and 390-402, extracting 12 %
  from VAT-inclusive totals for receipts). No change proposed here touches it.
  Whether the accountant export *should* break out VAT is open question **Q3**.
- **Discount and service-fee arithmetic do sit directly in the hot path.**
  `GetProfitLossReportAsync` and `GetAccountantSummaryAsync`
  (`ReportingService.cs:244-398` and `:472-564`) compute
  `netRevenue = Σ Transaction.Total`, `totalDiscounts = Σ TransactionItem.Discount.Amount`
  and `grossRevenue = netRevenue + totalDiscounts`, with documented assumptions
  that `Total` is already net of line discounts and that `Discount.Amount` is a
  whole-line total that must **not** be multiplied by quantity. `Total` also
  already includes `ServiceFee`.

**R5, R9, R10 and R11 cannot be implemented without rewriting those
expressions**, because making them fast means moving them from LINQ-to-Objects
into SQL. That is exactly the class of change the board has ring-fenced.

**Therefore:** R5, R9, R10 and R11 are **blocked** pending a written approach
note approved by the board. The note must state, per expression, the current
in-memory form, the proposed SQL form, and the proof they are equivalent —
including how `NULL` discounts, the movement-based-COGS fallback, the
recipe-COGS fallback and the zero-COGS warning behave under the rewrite.

R1, R2, R3, R4, R6, R7, R8, R12 and R13–R18 touch none of that arithmetic and can
proceed without the note. **They are also the larger share of the win**: R1–R4 and
R6–R8 alone remove the two unbounded reads (48.8 MB + 9.1 MB), the duplicate
`all-time-sales` call and the serialisation, which is the bulk of the measured
26.5 s.

Writing *tests* against the arithmetic is encouraged and is not a change.
`PosSystem.Tests/ReportingServiceDiscountTests.cs` currently pins exactly two
cases. That net must be widened **before** any SQL pushdown — see W1.

---

## 8. Task breakdown

Sized so an engineer can pick one up without re-reading the component. Each
references its criterion in §6.

### Wave 1 — safety net (do first, blocks the arithmetic work)

- **W1. Widen `ReportingServiceDiscountTests` into a characterisation suite.**
  Pin the current output of `profit-loss` and `accountant-summary` across:
  no discount, line discount, multiple discounted lines, service fee present and
  absent, zero-COGS fallback to recipe COGS, genuine zero COGS (warning flag),
  weekly vs daily breakdown grouping (the 60-day boundary), and an empty range.
  These are *tests*, not a change, so no approval is needed.
  *Done when:* each case asserts exact decimal values and the suite passes on
  `main` unmodified.
- **W1b. Add the P&L internal-consistency test.** R19. Asserts the statement
  total and the Period Breakdown agree for a one-day range (**C2**). A test, so
  not blocked — but unlike W1 it is **expected to fail on `main`**, and that
  failing test is the point: it pins the contradiction so the board can see it
  and so W14 has a target. Do not "fix" it by changing either expense call site;
  that is W14 and it is gated on Q8.

### Wave 2 — unblocked performance work (the bulk of the win)

- **W2. Index `Transactions.Timestamp`.** R1. EF Core migration + `EXPLAIN`
  evidence. Touches `PosSystemDbContext.cs` and `Migrations/`.
- **W3. Stop the app-wide full transaction download.** R2 + R2b + R3. Touches
  `transaction.service.ts` (constructor, `loadTransactions`, `saveToLocalStorage`)
  and the `Transactions`/`StockMovements` controllers for bounded paging.
  Check the POS and cart pages still work — they share this service, and the
  offline fallback currently depends on a cache that never populates. Decide
  deliberately what the offline story is rather than restoring a 48.8 MB mirror.
  **Biggest single performance win available.**
- **W4. De-duplicate `all-time-sales`.** R4. One-line change in `ngOnInit`.
- **W5. Parallelise and tab-scope `loadAllData()`.** R6 + R7 + R8. Touches
  `reports.component.ts:477-511` and the tab-switch handler; re-enables the
  already-written lazy path at line 1180.
- **W6. Fix the "Today" revenue KPI race.** R12. Touches `getTotalSales()` and
  `getTransactionCount()`. Add a frontend spec asserting the KPI equals the
  backend figure **with the transaction subject both empty and pre-populated** —
  the defect is a race (see C1) and a test that only covers the empty case will
  pass on broken code. Note that W3 changes which branch wins, so W6 and W3
  should land together or W6 first.

### Wave 3 — layout

- **W7. Fix the P&L table grid, both breakpoints.** R13 + R14. Two CSS rules
  (`reports.component.css:418` and `:543-544`); decide which columns to drop
  below 640 px and hide exactly that many, as `css:904-917` already does for the
  Activity table. Verify with `node layout-probe.js` — all 11 widths must read
  `ok`. **Smallest, highest-visibility fix in this spec; good first pick.**
- **W8. Make the top bar survive 700–1200 px.** R15. Verify at **768 as well as
  1024** — at 768 the Export button is not merely clipped, it is off-screen
  entirely, so an Owner on a tablet cannot export. Promoted to run alongside W7.
- **W9. Clamp the margin-health bar.** R16.
- **W10. Per-section loading states; delete the 10-second timer.** R17.
- **W11. `trackBy` + virtualised Activity table.** R18.

### Wave 4 — blocked on the approach note

- **W12. Write the arithmetic approach note** and take it to the board.
- **W13. SQL pushdown for the report aggregates.** R5 + R9 + R10 + R11.
  Do not start before W1 is green and W12 is approved.
- **W14. Reconcile the two expense bases.** R20. Blocked on **Q8** — the board
  must state whether a single day's expenses are cash-basis (dated in the
  window) or amortised. Engineering should not choose. W1b must be in place
  first so the fix has a test to turn green.

**Suggested order:** W1 → (W2, W3, W4, W5, W6 in parallel) → (W7–W11) →
W12 → W13. W2–W6 should be re-measured with `.perf-harness` before Wave 4 is
scoped — they may get close enough to T3 that the arithmetic rewrite can be
deferred or dropped, which would be the cheapest possible outcome.

---

## 9. Open questions — named, not guessed

- **Q1 — Is 170 transactions/day right?** Every number in this spec is anchored
  to it. If the client does 30/day the slowness is far less severe and most of
  Wave 2 is premature; if they do 500/day across several branches the targets are
  too lax. The board should confirm the real order of magnitude. *This is the one
  question whose answer could change the plan.*
- **Q2 — What specifically does the board dislike about the layout?** Two real
  defects were found (L1/L2) and both are regressions on the P&L tab. No
  horizontal overflow exists at any tested width. If the complaint is about
  information density, the four-tab structure, or the April redesign generally,
  that is a design question this spec does not answer and did not try to.
- **Q3 — Should the accountant export break out VAT?** The reports path computes
  no VAT today; only receipts do. Whether a Philippine accountant needs
  VAT-inclusive/exclusive lines on the export is a domain question for the client.
- **Q4 — What does Railway production hardware look like?** All numbers here come
  from one developer machine. The *ranking* of causes will hold, but the absolute
  targets in §5 may need adjusting against the deployed environment.
- **Q5 — Is `grossRevenue` meant to include `ServiceFee`?** `Transaction.Total`
  includes it, so `grossRevenue = Σ Total + Σ discounts` currently counts service
  fees as revenue. This may well be intended. It is **not** proposed as a change
  — it is flagged because W12 will have to preserve or deliberately alter it, and
  the board should decide which.
- **Q6 — Should the Activity table be in reports at all?** It is the single most
  expensive *ranged* thing the page fetches, it is collapsed by default, and
  `/inventory` already has a stock-movements view. Removing it from reports
  entirely may be better than optimising it.
- **Q7 — What is the offline requirement?** The full-transaction `localStorage`
  mirror (S3) is dead weight today — it cannot fit and fails silently — so
  removing it loses nothing that currently works. But an offline fallback was
  clearly intended. The board should say whether offline reports are a real
  requirement before W3 decides what to replace it with.
- **Q8 — Which Net Profit figure is correct, and how should a recurring expense
  be attributed to a single day?** This gates the C2 fix and is the one new
  blocking question from browser verification. The P&L statement counts only
  expenses dated inside the window (₱4,897.63 for a day); the Period Breakdown
  prorates, pulling in a share of expenses dated outside it (₱15,453.37 for the
  same day). Both are defensible accounting positions — cash-basis versus
  accrual/amortised — and the right answer depends on how the client's
  bookkeeper treats rent, salaries and utilities. **Engineering should not pick
  one.** Once the board states the intended basis, the fix is to make both call
  sites use it. Until then the two figures must at minimum not be presented side
  by side as if both were true.

---

## 10. Reproducing these numbers

The harness is committed at **`.perf-harness/`** with a README, on branch
`spec/reports-diagnosis`. It seeds its own throwaway MySQL container, runs the
endpoint benchmark, and drives headless Chrome for the browser, layout and
storage measurements. Raw endpoint results are committed as `bench-1d.json`,
`bench-7d.json`, `bench-30d-baseline.json` and `bench-90d.json`.

| Claim in this spec | Reproduce with |
| --- | --- |
| Endpoint timings and payloads (§2.2) | `bench.ps1 -Days 1\|7\|30\|90` |
| Browser timings and attribution (§2.1) | `browser-probe.js --width 1440 --preset today` |
| P&L grid defect at 11 widths (L1/L2) | `layout-probe.js` — no backend needed, runs in seconds |
| Export button clipped at 1024 px (L3) | `browser-probe.js --width 1024 --tab pnl` → `layout.offenders` |
| Export button unreachable at 768 px (L3) | `screenshot-probe.js --width 768 --tab pnl` → `geom.offenders` |
| localStorage 4 MB ceiling (S3) | `storage-capacity-probe.js` |
| Two Net Profit figures for one day (C2) | `GET /api/reports/profit-loss?startDate=<today>&endDate=<today>`; compare `totalExpenses` with `breakdown[0].expenses` |

Teardown is `docker rm -f swi6-perf-mysql`.

---

## 11. Visual verification — 2026-10-17

The board asked for the page to be put on screen before any implementation task
was created, rather than relying on DOM geometry alone. That was done with
`.perf-harness/screenshot-probe.js`, which drives the same real Chrome build and
captures full-page PNGs of `/reports` signed in as Owner, against the synthetic
dataset only.

Widths captured: **1920, 1440, 1024, 768, 390**. Screenshots are written to
`.perf-harness/shots/` and are **deliberately not committed** — they are large
binaries of no long-term value and `.perf-harness/.gitignore` excludes them.
They contain only fabricated data, but the standing rule is that no report
imagery goes into comments or documents, so they stay local.

| Claim | Visual outcome |
| --- | --- |
| L1 — P&L breakdown wraps every row | **Confirmed**, 1920/1440/1024/768/390. The header renders as "PERIOD / NET PROFIT" and "REVENUE / NET MARGIN" stacked; values land under the wrong headings. |
| L3 — Export clipped at 1024 | **Confirmed**, and worse at 768 where the button is absent entirely. |
| S1 — the page is slow | **Confirmed.** At 5 s the viewport is empty but for "Loading reports…". First content 10.9–11.5 s across widths; network idle 35.7–38.4 s. |
| L4 — margin marker escapes track | **Confirmed** on the settled Dashboard at 1440 with a negative margin. |
| C1 — revenue KPI capped at 50 | **Not reproduced** — it is a race and it resolved the safe way here. C1 rewritten accordingly; this is the one claim browser verification corrected. |
| L5 — empty states during load | **Confirmed, and reclassified** — the panels fill in once settled, so they are a symptom of S1, not broken panels. |
| C2 — two Net Profit figures | **New.** Found on screen, then reproduced against the API without a browser. |

Two incidental observations, neither filed as reports defects: the PWA install
banner floats over report content at every width (it is
`shared/components/PwaInstallComponent`, app-wide, outside this task's scope),
and at 390 px the top bar overlaps the "Reports" title with the FROM field —
the same root cause as L3, at the other end of the range.

### One caveat on the browser probes

`browser-probe.js` can hang while the page's main thread is blocked by the
~48.8 MB `JSON.stringify` described in S3 — CDP evaluation queues behind it. Two
of the planned viewport runs (768 px and 390 px) had to be abandoned for that
reason. Those two widths are covered instead by `layout-probe.js`, which renders
the component's real CSS and markup without the backend and agrees exactly with
the live app at the three widths where both ran (1920, 1440, 1024). Once R2
lands, the browser probe should stop hanging.
