# P&L Tab Restructure + Expense System Design

**Date:** 2026-04-03
**Status:** Approved
**Audience:** Business owner (daily use) + Bookkeeper/Accountant (monthly review)

---

## Summary

Restructure the Reports page to split the current "Costs" tab into two dedicated tabs — **Profit & Loss** (clean financial statement with expenses) and **Inventory** (stock valuation, activity, suppliers, consumption). Add a full **Expense management system** with recurring support, and fix backend P&L calculation issues.

---

## 1. Tab Restructure

### Current tabs
Dashboard | Sales | ~~Costs~~ | Export

### New tabs
Dashboard | Sales | **Profit & Loss** | **Inventory** | Export

### Profit & Loss tab
- Contains only the redesigned P&L statement (Section 2)
- Internal `activeTab` value: `'pnl'`

### Inventory tab (new)
- Receives the 4 existing sections from the old "Costs" tab, moved as-is with no content changes:
  - **Inventory Valuation** (expanded by default) — stock value, period change, waste, low stock, top ingredients, movement summary
  - **Stock Activity** (collapsed) — movement ledger with type filters and ingredient search
  - **Suppliers** (collapsed) — spend by supplier, cost comparison
  - **Consumption** (collapsed) — ingredient usage ranking
- Internal `activeTab` value: `'inventory'`
- Tab icon: box/package SVG (consistent with existing icon style)
- Uses same `costsExpanded` record for collapsible state (renamed to `inventoryExpanded`)

---

## 2. P&L Statement Redesign

Replaces the current 4 KPIs + simple table with a proper accounting-format statement.

### Statement layout

```
PROFIT & LOSS STATEMENT
Period: Mar 1 - Mar 31, 2026

Revenue
  Gross Revenue                          ₱125,000.00
  Less: Discounts                         (₱3,200.00)
  ─────────────────────────────────────────────────────
  Net Revenue                            ₱121,800.00

Cost of Goods Sold
  Ingredients Consumed                   (₱42,630.00)
  ─────────────────────────────────────────────────────
  Total COGS                             (₱42,630.00)

GROSS PROFIT                              ₱79,170.00
Gross Margin                                   65.0%

Expenses                        [Manage Expenses →]
  Rent                                   (₱15,000.00)
  Labor / Wages                          (₱25,000.00)
  Utilities                               (₱4,500.00)
  Supplies                                (₱2,100.00)
  Marketing                               (₱1,000.00)
  ─────────────────────────────────────────────────────
  Total Expenses                         (₱47,600.00)

NET PROFIT                                ₱31,570.00
Net Margin                                     25.9%
```

### Design details
- Standard accounting format: line items indented under headers, subtotals bold
- Negative amounts shown in parentheses (accounting convention)
- "Manage Expenses" link navigates to `/expenses` page
- Quick-add button (+ icon) next to "Manage Expenses" opens the expense modal without leaving reports
- Margin color coding: green (>40%), yellow (20-40%), red (<20%)
- Empty expenses state: "No expenses recorded. Add expenses to see your Net Profit." with CTA button

### Period Breakdown Table

Shown below the statement. Full breakdown including prorated expenses.

| Period | Revenue | COGS | Gross Profit | Expenses | Net Profit | Net Margin |
|--------|---------|------|-------------|----------|------------|------------|
| Mar 1-7 | ₱28,500 | ₱9,975 | ₱18,525 | ₱11,900 | ₱6,625 | 23.2% |
| Mar 8-14 | ₱31,200 | ₱10,920 | ₱20,280 | ₱11,900 | ₱8,380 | 26.9% |

- Recurring expenses prorated: `monthly amount / days in month * days in period`
- One-time expenses assigned to the period containing their date
- Grouping: daily if date range ≤ 60 days, weekly if > 60 days

---

## 3. Expense System — Data Model

### ExpenseCategory entity

| Field | Type | Notes |
|-------|------|-------|
| Id | string (GUID) | PK |
| Name | string | e.g., "Rent", "Labor / Wages" |
| IsSystem | bool | `true` for pre-seeded, `false` for user-created |
| IsActive | bool | Soft delete for custom categories |
| SortOrder | int | Display ordering |
| CreatedAt | DateTime | UTC |

### Expense entity

| Field | Type | Notes |
|-------|------|-------|
| Id | string (GUID) | PK |
| CategoryId | string | FK → ExpenseCategory |
| Description | string | e.g., "March rent payment" |
| Amount | decimal(18,2) | Always positive |
| Date | DateTime | When the expense occurred |
| IsRecurring | bool | |
| RecurrenceType | string? | "monthly", "weekly", "yearly" (null if not recurring) |
| RecurrenceEndDate | DateTime? | null = no end date |
| ParentExpenseId | string? | FK → self. Links overridden instances to their recurring template |
| Notes | string? | Optional |
| CreatedBy | string | User ID who created it |
| CreatedAt | DateTime | UTC |
| UpdatedAt | DateTime | UTC |

### Pre-seeded categories (via EF migration)

| Name | SortOrder |
|------|-----------|
| Rent | 1 |
| Labor / Wages | 2 |
| Utilities | 3 |
| Insurance | 4 |
| Marketing / Advertising | 5 |
| Maintenance / Repairs | 6 |
| Supplies | 7 |
| Delivery / Transportation | 8 |
| Software / Subscriptions | 9 |
| Taxes / Permits | 10 |
| Miscellaneous | 11 |

### Recurring expense logic

- Owner creates expense with `IsRecurring = true` — this is the **template** (parent)
- Instances are **generated at query time**, not pre-created in DB
- Query logic for a date range:
  1. Fetch all one-time expenses (`IsRecurring = false`, `ParentExpenseId = null`) within the range
  2. Fetch all active recurring templates where: start date (Date field) ≤ end of range AND (RecurrenceEndDate is null OR RecurrenceEndDate ≥ start of range)
  3. Generate virtual instances for each recurrence falling within the range
  4. Fetch any child overrides (`ParentExpenseId != null`) within the range — these replace the generated instance for that period
  5. Return combined list
- Owner can edit/delete a single instance (creates child with `ParentExpenseId`) or edit the template (affects all future generated instances)

---

## 4. Expense System — API Endpoints

All endpoints require Owner or Admin role.

### Expense CRUD

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/expenses` | List expenses. Query params: `startDate`, `endDate`, `categoryId` (optional). Returns one-time + materialized recurring instances. |
| GET | `/api/expenses/{id}` | Get single expense |
| POST | `/api/expenses` | Create expense (one-time or recurring template) |
| PUT | `/api/expenses/{id}` | Update expense or template |
| DELETE | `/api/expenses/{id}` | Delete expense. For recurring templates: stops all future instances. |

### Category CRUD

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/expense-categories` | List all active categories |
| POST | `/api/expense-categories` | Create custom category |
| PUT | `/api/expense-categories/{id}` | Update custom category (system categories: name not editable) |
| DELETE | `/api/expense-categories/{id}` | Soft-delete (`IsActive = false`). System categories cannot be deleted. |

### Updated P&L report

`GET /api/reports/profit-loss` response adds:

```
ProfitLossReportDto (updated fields):
  + TotalExpenses: decimal
  + NetProfit: decimal
  + NetMarginPercent: decimal
  + ExpensesByCategory: ExpenseCategorySummaryDto[]

  Breakdown[] adds:
  + Expenses: decimal
  + NetProfit: decimal
  + NetMarginPercent: decimal

ExpenseCategorySummaryDto:
  CategoryName: string
  Total: decimal
```

---

## 5. Expenses Page — Frontend

### Route
`/expenses` — role-protected (Owner/Admin). Added to admin sidebar navigation.

### Page layout

```
┌─────────────────────────────────────────────────────┐
│  Expenses                          [+ Add Expense]  │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │ [All Categories ▼]  [This Month ▼]  [Search...] ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─── Summary Cards ───────────────────────────────┐│
│  │ Total This Period    Recurring/mo    One-time    ││
│  │ ₱47,600             ₱44,500         ₱3,100      ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─── Recurring Expenses ──────────────────────────┐│
│  │ Rent          Monthly   ₱15,000   [Edit] [···]  ││
│  │ Labor/Wages   Monthly   ₱25,000   [Edit] [···]  ││
│  │ Utilities     Monthly   ₱4,500    [Edit] [···]  ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─── One-time Expenses ───────────────────────────┐│
│  │ Mar 5   Supplies    Packaging restock   ₱2,100  ││
│  │ Mar 12  Marketing   Flyer printing      ₱1,000  ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Add/Edit Expense Modal

Fields:
- **Category** — dropdown with pre-seeded + custom categories. "+ New Category" option at bottom opens inline name input.
- **Description** — text input (required)
- **Amount** — number input, currency formatted (required)
- **Date** — date picker, defaults to today (required)
- **Recurring** — toggle. When ON, shows:
  - Recurrence type: Monthly / Weekly / Yearly (dropdown)
  - End date: optional date picker (null = no end)
- **Notes** — optional textarea

This same modal is reused for the Quick-Add from the P&L tab.

### Validation rules
- **Amount:** Required, must be > 0, decimal(18,2)
- **Description:** Required, max 200 characters
- **Category:** Required, must reference an active ExpenseCategory
- **Date:** Required, cannot be in the future (max = today)
- **RecurrenceType:** Required if IsRecurring = true, must be one of: "monthly", "weekly", "yearly"
- **RecurrenceEndDate:** If provided, must be ≥ Date
- **Notes:** Optional, max 500 characters

### Recurring section behaviors
- Shows templates grouped with: category color dot, frequency label, amount
- Edit: opens modal pre-filled
- More menu (···): Delete (with confirmation — deletes template + all child overrides), Pause (sets `RecurrenceEndDate` to today on the template — past instances remain, no future ones generated), View history (shows all materialized + overridden instances)

### One-time section behaviors
- Sorted by date, newest first
- Shows: date, category, description, amount
- Click to edit, menu to delete
- Delete always shows confirmation dialog

---

## 6. Export Tab Updates

The Export tab needs minor updates to reflect the new structure:

### Accountant Summary
- Add Expenses section below the existing Sales Summary:
  - List each expense category with total
  - Show Total Expenses line
  - Update bottom line from Gross Profit → Net Profit with Net Margin
- Keep existing sections (Transaction Breakdown, Sales by Category, Inventory Snapshot) unchanged

### Download Reports
- **Profit & Loss export** (existing "Profit & Loss" card): update to include expenses and net profit columns in the CSV/Excel output
- **Add new export card:** "Expenses" — exports all expenses for the period (date, category, description, amount, recurring flag, notes)
- Other export cards (Full Report, Sales Detail, Inventory & Stock) remain unchanged. Full Report now includes the expanded P&L with expenses.

---

## 7. Backend Fixes (Included in Scope)

### Fix 1: Discount not applied to NetRevenue
- **Current:** `NetRevenue = GrossRevenue` (discounts reported but never subtracted)
- **Fix:** `NetRevenue = GrossRevenue - TotalDiscounts`
- **Affects:** ProfitLossReportDto, AccountantSummaryDto

### Fix 2: COGS calculation mismatch
- **Current:** Grand total uses movement-based COGS; period breakdown uses recipe-based COGS. Rows don't sum to total.
- **Fix:** Use movement-based COGS for everything. Filter stock movements by date for each period in the breakdown.
- **Fallback:** If no sale movements exist but revenue does, fall back to recipe-based COGS with a warning indicator.

### Fix 3: Silent zero COGS
- **Current:** When stock movements lack `UnitCost`, COGS silently shows ₱0.
- **Fix:** When COGS = 0 and revenue > 0, show info banner: "COGS may be incomplete. Ensure inventory is being deducted when products are sold."

---

## 8. Out of Scope (Deferred)

- Automatic stock deduction on sale (separate feature)
- Historical inventory valuation snapshots
- Receipt/attachment uploads for expenses
- Expense approval workflows
- Inventory tab improvements (turnover rate, price trends, waste % comparison)

---

## 9. File Impact Summary

### Backend (new files)
- `Core/Models/Expense.cs` — Expense entity
- `Core/Models/ExpenseCategory.cs` — ExpenseCategory entity
- `Core/Interfaces/IExpenseRepository.cs` — repository contract
- `Core/Interfaces/IExpenseCategoryRepository.cs` — repository contract
- `Core/Interfaces/IExpenseService.cs` — service contract
- `Infrastructure/Repositories/ExpenseRepository.cs` — data access
- `Infrastructure/Repositories/ExpenseCategoryRepository.cs` — data access
- `Infrastructure/Services/ExpenseService.cs` — business logic + recurring generation
- `API/Controllers/ExpensesController.cs` — REST endpoints
- `API/Controllers/ExpenseCategoriesController.cs` — REST endpoints
- `Migrations/` — new migration for Expense + ExpenseCategory tables + seed data

### Backend (modified files)
- `Infrastructure/Data/PosSystemDbContext.cs` — add DbSets for Expense, ExpenseCategory
- `Infrastructure/Services/ReportingService.cs` — fix COGS calculation, fix discount handling, integrate expenses into P&L report
- DTOs file — add/update ProfitLossReportDto fields, add ExpenseCategorySummaryDto

### Frontend (new files)
- `features/admin/components/expenses/expenses.component.ts` — expenses page
- `features/admin/components/expenses/expenses.component.html` — template
- `features/admin/components/expenses/expenses.component.css` — styles
- `features/admin/components/expense-modal/expense-modal.component.ts` — add/edit modal (reused from P&L quick-add)
- `features/admin/components/expense-modal/expense-modal.component.html`
- `features/admin/components/expense-modal/expense-modal.component.css`
- `core/services/expense.service.ts` — API client for expenses + categories

### Frontend (modified files)
- `features/admin/components/reports/reports.component.ts` — tab restructure, P&L redesign, remove inventory sections from P&L tab
- `features/admin/components/reports/reports.component.html` — new P&L layout, new Inventory tab, remove old Costs tab
- `features/admin/components/reports/reports.component.css` — P&L statement styles, inventory tab styles
- `app.routes.ts` — add `/expenses` route
- Sidebar/navigation component — add Expenses nav item
