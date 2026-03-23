# Accounting Reports — Implementation Plan

**Design doc:** `docs/plans/2026-03-23-accounting-reports-design.md`
**Date:** 2026-03-23

## Step 1: Backend — Add Report DTOs

**Files to create/edit:**
- `backend/PosSystem/PosSystem/Core/Models/ProfitLossReportDto.cs` (new)

```
ProfitLossReportDto
  - GrossRevenue (decimal)
  - TotalDiscounts (decimal)
  - NetRevenue (decimal)
  - Cogs (decimal)
  - GrossProfit (decimal)
  - MarginPercent (decimal)
  - Breakdown: List<ProfitLossPeriodDto>

ProfitLossPeriodDto
  - Period (string — date or week label)
  - Revenue (decimal)
  - Cogs (decimal)
  - GrossProfit (decimal)
  - MarginPercent (decimal)

InventoryValuationReportDto
  - TotalValue (decimal)
  - PeriodChange (decimal)
  - WasteAndShrinkage (decimal)
  - LowStockCount (int)
  - TopIngredients: List<IngredientValueDto>
  - MovementSummary: List<MovementSummaryDto>

IngredientValueDto
  - Name (string)
  - OnHand (decimal)
  - Unit (string)
  - UnitCost (decimal)
  - TotalValue (decimal)
  - PercentOfTotal (decimal)

MovementSummaryDto
  - Type (string)
  - Count (int)
  - TotalCost (decimal)

AccountantSummaryDto
  - StartDate, EndDate (DateTime)
  - GrossRevenue, TotalDiscounts, NetRevenue (decimal)
  - Cogs, GrossProfit, GrossMarginPercent (decimal)
  - TransactionCount (int)
  - AverageTicket (decimal)
  - PaymentMethodBreakdown: List<PaymentMethodDto>
  - CategoryBreakdown: List<CategorySalesDto>
  - CurrentInventoryValue (decimal)
  - IngredientsConsumed (decimal)
  - WasteAndShrinkage (decimal)

PaymentMethodDto
  - Method (string)
  - Count (int)
  - Total (decimal)

CategorySalesDto
  - Category (string)
  - Total (decimal)
  - Percent (decimal)
```

## Step 2: Backend — Add IReportingService methods

**File:** `backend/PosSystem/PosSystem/Core/Interfaces/IReportingService.cs`

Add 3 new methods:
```csharp
Task<ProfitLossReportDto> GetProfitLossReportAsync(DateTime startDate, DateTime endDate);
Task<InventoryValuationReportDto> GetInventoryValuationReportAsync(DateTime startDate, DateTime endDate);
Task<AccountantSummaryDto> GetAccountantSummaryAsync(DateTime startDate, DateTime endDate);
```

## Step 3: Backend — Implement COGS calculation helper

**File:** `backend/PosSystem/PosSystem/Infrastructure/Services/ReportingService.cs`

Add a private helper method:
```
CalculateCogsForItems(List<TransactionItem> items) → decimal
```

Logic:
1. Get all unique ProductIds from transaction items
2. Load ProductIngredients (recipes) for those products, include Ingredient
3. For each transaction item:
   - Look up recipe lines for that ProductId
   - Sum: ingredientLine.QuantityPerUnit × ingredient.UnitCost × item.Quantity
4. Return total COGS

Products without recipes contribute ₱0 COGS.

## Step 4: Backend — Implement GetProfitLossReportAsync

**File:** `backend/PosSystem/PosSystem/Infrastructure/Services/ReportingService.cs`

1. Query completed transactions in date range
2. Calculate GrossRevenue = sum of transaction totals
3. Calculate TotalDiscounts = sum of item discount amounts
4. NetRevenue = GrossRevenue - TotalDiscounts
5. Flatten all transaction items, call CalculateCogsForItems
6. GrossProfit = NetRevenue - COGS
7. MarginPercent = (GrossProfit / NetRevenue) × 100
8. Group transactions by day (or week for 90D+) for breakdown rows
9. For each period group, calculate the same metrics
10. Return ProfitLossReportDto

## Step 5: Backend — Implement GetInventoryValuationReportAsync

**File:** `backend/PosSystem/PosSystem/Infrastructure/Services/ReportingService.cs`

1. **TotalValue:** Query all active ingredients, sum(quantity × unitCost)
2. **PeriodChange:** Sum stock movement costs in date range by type (purchases positive, sales/waste negative)
3. **WasteAndShrinkage:** Sum cost of StockMovements where type = Waste or Adjustment (negative) in date range
4. **LowStockCount:** Count ingredients where quantity <= lowStockThreshold
5. **TopIngredients:** Top 10 ingredients by totalValue desc, calculate percentOfTotal
6. **MovementSummary:** Group StockMovements in date range by MovementType, count + sum(qty × unitCost)

## Step 6: Backend — Implement GetAccountantSummaryAsync

**File:** `backend/PosSystem/PosSystem/Infrastructure/Services/ReportingService.cs`

Composes data from:
1. P&L data (reuse GetProfitLossReportAsync or inline the queries)
2. Transaction count + average ticket
3. Payment method breakdown: group transactions by PaymentMethod, count + sum
4. Category breakdown: reuse existing GetCategoryReportAsync logic
5. Inventory snapshot: currentValue, ingredients consumed (sale movements in period), waste

## Step 7: Backend — Add controller endpoints

**File:** `backend/PosSystem/PosSystem/API/Controllers/ReportsController.cs`

Add 3 endpoints following existing pattern:
```
[HttpGet("profit-loss")]     → GetProfitLossReportAsync(startDate, endDate)
[HttpGet("inventory-valuation")] → GetInventoryValuationReportAsync(startDate, endDate)
[HttpGet("accountant-summary")]  → GetAccountantSummaryAsync(startDate, endDate)
```

All use `[Authorize(Roles = "Owner,Admin")]`, same query params as existing endpoints.

## Step 8: Frontend — Add service methods

**File:** `frontend/src/app/features/checkout/services/transaction.service.ts`

Add 3 methods:
```typescript
getProfitLossReport(startDate: string, endDate: string): Observable<ProfitLossReport>
getInventoryValuation(startDate: string, endDate: string): Observable<InventoryValuationReport>
getAccountantSummary(startDate: string, endDate: string): Observable<AccountantSummary>
```

Add matching TypeScript interfaces in a new file or in the existing models.

## Step 9: Frontend — Add P&L panel to reports

**Files:** `frontend/src/app/features/admin/components/reports/reports.component.ts` and `.html`

1. Add `profitLossData` property
2. Call `getProfitLossReport()` in the existing `loadData()` flow, using the same date range
3. Add template section below sales trend chart:
   - KPI strip: Revenue, COGS, Gross Profit, Margin %
   - Data table with period breakdown rows
   - Margin % cell with green/red color treatment
4. Style using existing panel/data-table patterns

## Step 10: Frontend — Add Inventory Valuation panel

**Files:** `frontend/src/app/features/admin/components/reports/reports.component.ts` and `.html`

1. Add `inventoryData` property
2. Call `getInventoryValuation()` on load
3. Add template section below P&L panel:
   - KPI strip: Total Value, Period Change, Waste, Low Stock
   - Two-column layout:
     - Left: Top Ingredients table (name, on hand, unit cost, total value, % bar)
     - Right: Movement Summary table (type, count, cost)
4. TotalValue KPI is always current; other sections respect date filter

## Step 11: Frontend — Add Accountant Summary panel

**Files:** `frontend/src/app/features/admin/components/reports/reports.component.ts` and `.html`

1. Add `accountantSummary` property
2. Call `getAccountantSummary()` on load
3. Add template section at bottom:
   - Structured card with 4 subsections (Sales, Transactions, Category, Inventory)
   - Clean typography, receipt-like layout
   - Export CSV and Export Excel buttons
4. CSV export: generate from the summary data, trigger download
5. Excel export: generate HTML table, trigger download (same pattern as existing exports)

## Step 12: Test and verify

1. Build backend: `dotnet build`
2. Build frontend: `npm run build`
3. Verify all 3 new endpoints return correct data
4. Verify reports page renders all panels without scroll issues
5. Test exports generate valid files

## Execution Order

Steps 1-7 are backend (do sequentially).
Steps 8-11 are frontend (step 8 first, then 9-11 can be done sequentially).
Step 12 is verification.

## Dependencies

- Products must have recipes (ProductIngredient records) for COGS to be non-zero
- Ingredients must have UnitCost populated
- StockMovements must exist for movement summary data
