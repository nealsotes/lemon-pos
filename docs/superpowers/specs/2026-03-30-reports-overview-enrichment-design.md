# Reports Overview Tab Enrichment

## Problem

The Overview tab shows 4 KPIs, a sales trend chart, top products, and recent transactions — but lacks context for quick decision-making. There's no comparison to previous periods, no category breakdown, and no payment method visibility. This data already exists in the backend but isn't surfaced in the overview.

## Solution

Three additions to the existing Overview tab, using mostly existing backend data:

1. Period comparison badges on KPI cards
2. Category revenue breakdown
3. Payment method split

## 1. Period Comparison on KPIs

Each KPI card gets a small comparison badge showing % change vs the equivalent previous period.

**Logic:** If the selected date range is 7 days (Mar 23-29), the previous period is the 7 days before that (Mar 16-22). Same duration, immediately preceding.

**Display:**
- Green up arrow + "X%" for increase
- Red down arrow + "X%" for decrease
- Gray "—" if no previous period data

**Compared metrics:**
- Total Sales (revenue)
- Transaction Count
- Average Order Value

Top Product KPI doesn't need comparison (it's a name, not a number).

### New Backend Endpoint

`GET /api/reports/period-comparison?startDate=X&endDate=Y`

Returns `PeriodComparisonDto`:
```csharp
public class PeriodComparisonDto
{
    public decimal CurrentSales { get; set; }
    public decimal PreviousSales { get; set; }
    public decimal SalesChangePercent { get; set; }
    public int CurrentTransactions { get; set; }
    public int PreviousTransactions { get; set; }
    public decimal TransactionsChangePercent { get; set; }
    public decimal CurrentAvgOrder { get; set; }
    public decimal PreviousAvgOrder { get; set; }
    public decimal AvgOrderChangePercent { get; set; }
}
```

Backend logic: calculate the previous period as `(startDate - duration)` to `startDate - 1 day`. Query transactions in both ranges, compute totals, calculate % change.

## 2. Category Revenue Breakdown

A section below the sales trend chart showing revenue split by product category within the date range.

**Layout:** Horizontal rows with category name, revenue amount, percentage, and a progress bar.

**Data source:** `GET /api/reports/category?startDate=X&endDate=Y` — already exists. Returns category name, total, and percent.

**Frontend:** Load category data alongside overview. Render as a simple card with rows. Sorted by revenue descending.

## 3. Payment Method Split

A compact row showing the cash/card/mobile split for the date range.

**Layout:** 3 equal columns, each showing method name, amount, and percentage.

**Data source:** Already part of `AccountantSummaryDto.PaymentMethodBreakdown`. Load accountant summary alongside overview data (or add a dedicated lightweight endpoint).

**Approach:** Reuse the accountant summary call — it's already being loaded. Just extract `paymentMethodBreakdown` from it.

## Frontend Changes

### reports.component.html
- Add comparison badges to KPI strip items (small `<span>` under each KPI value)
- Add "Revenue by Category" card below the sales trend chart
- Add "Payment Methods" compact row below category breakdown

### reports.component.ts
- Add `periodComparison: any = null` property
- Add `categoryData: any[] = []` property
- Load period comparison, category, and accountant summary in `loadAllData()`
- Helper methods: `getChangeClass(percent)`, `formatChange(percent)`

### reports.component.css
- Comparison badge styles (small text, colored arrows)
- Category row styles (reuse existing `inv-pct-bar` pattern)
- Payment method split row styles

## Backend Changes

### New DTO
`PeriodComparisonDto` in `AccountingReportDtos.cs`

### New Method
`ReportingService.GetPeriodComparisonAsync(startDate, endDate)` — queries transactions in current and previous periods, calculates totals and % changes.

### New Endpoint
`GET /api/reports/period-comparison` in `ReportsController`

### No Changes to Existing Endpoints
Category report and accountant summary already return the needed data.

## What Does NOT Change

- KPI strip component (badges are added in the template, not the shared component)
- Sales trend chart
- Top products and recent transactions sections
- Other tabs (Leaderboard, Profitability, Inventory, Summary)
- Backend sales/transaction data structures
