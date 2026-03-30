# Inventory Reports Detail — Stock Movements, Suppliers, Consumption

## Problem

The inventory tab in reports shows only a high-level summary: 4 KPIs, top 10 ingredients by value, and a movement type count/cost table. There's no way to see individual movements, analyze supplier spending, or understand ingredient consumption patterns. With lot tracking now in place, the data exists but isn't surfaced.

## Solution

Split the Inventory tab into 4 sub-tabs: Overview (existing), Activity (movement ledger), Suppliers (spend analysis), and Consumption (usage ranking). The date range filter at the top of the reports page applies to all sub-tabs.

## Sub-Tab Structure

| Sub-Tab | Content |
|---|---|
| **Overview** | Existing: 4 KPIs + Top Ingredients by Value + Movement Summary (unchanged) |
| **Activity** | Full stock movement ledger within date range |
| **Suppliers** | Spend per supplier + cost comparison across suppliers |
| **Consumption** | Top consumed ingredients by cost, daily averages |

Sub-tabs use underline-style navigation matching existing app patterns. Default sub-tab is Overview.

## Activity Sub-Tab

### Layout

Filter bar at top with:
- Movement type chips: All, Purchase, Sale, Waste, Return, Adjustment
- Search input to filter by ingredient name

Scrollable table below:

| Column | Content |
|---|---|
| Date | Formatted timestamp (Mar 29, 10:32 AM) |
| Ingredient | Ingredient name |
| Type | Movement type badge (color-coded) |
| Qty | Signed quantity with unit (e.g., -0.15 kg). Green for incoming, red for outgoing |
| Unit Cost | Cost per unit at time of movement |
| Total Cost | abs(Qty) x UnitCost |
| Supplier / Lot | Lot supplier + lot number badge when available, "--" when null |
| Notes | Movement notes (truncated, tooltip for full) |

Sorted by date descending. Footer row shows: total incoming value, total outgoing value, net change.

### Data Source

No new backend endpoint. Frontend fetches:
- `GET /api/stockmovements?startDate=X&endDate=Y` (all movements in range)
- `GET /api/ingredients` (cached, for ingredient names/units)
- `GET /api/ingredients/{id}/lots` (per ingredient, for lot supplier/number lookup)

Client-side join: movement.ingredientId -> ingredient.name, movement.lotId -> lot.supplier + lot.lotNumber.

Optimization: fetch lots only for ingredients that appear in movements, not all ingredients.

## Suppliers Sub-Tab

### Section A — Supplier Spend Table

| Column | Content |
|---|---|
| Supplier | Supplier name |
| Purchases | Count of Purchase movements |
| Total Spent | Sum of (qty x unitCost) for purchases |
| Ingredients | Comma-separated unique ingredient names |
| Avg Cost/Purchase | Total Spent / Purchases |

Sorted by Total Spent descending. Only Purchase-type movements in date range.

### Section B — Cost Comparison

Groups ingredients that have 2+ suppliers in the period:

| Column | Content |
|---|---|
| Ingredient | Ingredient name (row-spanning group header) |
| Supplier | Supplier name |
| Unit Cost | Cost per unit from the lot |
| Last Purchase | Most recent purchase date |
| Qty Purchased | Total quantity purchased from this supplier |

Highlights cheapest supplier per ingredient with a subtle accent badge.

### Data Source

New backend endpoint: `GET /api/reports/supplier-breakdown?startDate=X&endDate=Y`

Returns `SupplierBreakdownReportDto`:
```
{
  supplierSummary: [
    { supplier, purchaseCount, totalSpent, ingredients: string[], avgCostPerPurchase }
  ],
  costComparison: [
    { ingredientName, suppliers: [
      { supplier, unitCost, lastPurchaseDate, qtyPurchased }
    ]}
  ]
}
```

Backend logic: query IngredientLots joined with Ingredients, filter by ReceivedAt in date range, group by supplier and ingredient.

## Consumption Sub-Tab

### KPI Strip (3 cards)

- **Total Consumed** — total cost of all Sale movements in period: sum(abs(qty) x unitCost)
- **Top Ingredient** — ingredient name with highest consumption cost
- **Ingredients Used** — count of distinct ingredients with Sale movements

### Consumption Ranking Table

| Column | Content |
|---|---|
| # | Rank by cost consumed |
| Ingredient | Ingredient name |
| Qty Used | Total absolute quantity from Sale movements |
| Unit | Ingredient unit |
| Cost Consumed | qty x unitCost summed |
| % of Total | This ingredient's cost / total consumption cost |
| Avg Daily | Qty used / number of days in date range |

% of Total column includes a progress bar for visual weight. Sorted by cost consumed descending.

### Data Source

New backend endpoint: `GET /api/reports/consumption?startDate=X&endDate=Y`

Returns `ConsumptionReportDto`:
```
{
  totalConsumedCost: decimal,
  topIngredientName: string,
  ingredientsUsedCount: int,
  items: [
    { ingredientName, unit, qtyUsed, costConsumed, percentOfTotal, avgDaily }
  ]
}
```

Backend logic: query StockMovements where MovementType = Sale and CreatedAt in range, join with Ingredients, group by IngredientId, calculate aggregates. Avg daily = qtyUsed / days in range.

## New Backend Endpoints

| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/reports/supplier-breakdown?startDate&endDate` | `SupplierBreakdownReportDto` |
| GET | `/api/reports/consumption?startDate&endDate` | `ConsumptionReportDto` |

Both require Owner/Admin authorization.

## New DTOs

### SupplierBreakdownReportDto
```csharp
public class SupplierBreakdownReportDto
{
    public List<SupplierSummaryDto> SupplierSummary { get; set; }
    public List<IngredientCostComparisonDto> CostComparison { get; set; }
}

public class SupplierSummaryDto
{
    public string Supplier { get; set; }
    public int PurchaseCount { get; set; }
    public decimal TotalSpent { get; set; }
    public List<string> Ingredients { get; set; }
    public decimal AvgCostPerPurchase { get; set; }
}

public class IngredientCostComparisonDto
{
    public string IngredientName { get; set; }
    public List<SupplierCostDto> Suppliers { get; set; }
}

public class SupplierCostDto
{
    public string Supplier { get; set; }
    public decimal UnitCost { get; set; }
    public DateTime LastPurchaseDate { get; set; }
    public decimal QtyPurchased { get; set; }
}
```

### ConsumptionReportDto
```csharp
public class ConsumptionReportDto
{
    public decimal TotalConsumedCost { get; set; }
    public string TopIngredientName { get; set; }
    public int IngredientsUsedCount { get; set; }
    public List<ConsumptionItemDto> Items { get; set; }
}

public class ConsumptionItemDto
{
    public string IngredientName { get; set; }
    public string Unit { get; set; }
    public decimal QtyUsed { get; set; }
    public decimal CostConsumed { get; set; }
    public decimal PercentOfTotal { get; set; }
    public decimal AvgDaily { get; set; }
}
```

## Frontend Changes

### Files to Modify
- `reports.component.html` — Add sub-tab navigation inside inventory tab, add Activity/Suppliers/Consumption templates
- `reports.component.ts` — Add `inventorySubTab` state, loading methods for each sub-tab, data properties
- `reports.component.css` — Sub-tab styles (reuse existing tab pattern)

### Files to Create
- None — all rendering lives in the reports component template (it's already a large component with all tabs inline)

### Frontend Service
- `transaction.service.ts` — Add `getSupplierBreakdown(start, end)` and `getConsumption(start, end)` methods
- Activity sub-tab uses existing `StockMovementService.getAllMovements()` + `IngredientService` + `IngredientLotService`

## What Does NOT Change

- Overview sub-tab content (existing KPIs, top ingredients, movement summary)
- Other report tabs (Overview, Leaderboard, Profitability, Summary)
- Backend inventory valuation endpoint
- Date range filter behavior
