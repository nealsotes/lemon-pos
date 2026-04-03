# FIFO Recipe Costing Design

## Problem

Recipe ingredient costs and COGS reporting use `Ingredient.UnitCost` (weighted average across all active lots). This does not reflect true FIFO costing — the actual cost of the next unit consumed should be the oldest active lot's price.

Two areas affected:
1. **Recipe editor UI** — shows blended average cost per ingredient line (e.g. "₱4.60 cost" for Bangus)
2. **P&L / COGS reports** — `GetCogsByProductIdAsync()` multiplies recipe quantities by average unit cost instead of using actual sale movement costs

## Design

### 1. Backend: FIFO Cost Query

**New method on `IIngredientLotRepository`:**
```
GetFifoCostByIngredientIdAsync(string ingredientId) -> decimal?
```
Returns the `UnitCost` of the oldest active lot (smallest `ReceivedAt` where `IsActive && RemainingQuantity > 0`).

**New method on `IIngredientLotService`:**
```
GetFifoCostsAsync() -> Dictionary<string, decimal>
```
For each ingredient with active lots, returns the oldest lot's unit cost. For ingredients with no active lots, falls back to the most recent depleted lot's cost. Ingredients with no lots at all are omitted (frontend falls back to `ingredient.unitCost`).

**New endpoint on `IngredientsController`:**
```
GET /api/ingredients/fifo-costs -> { [ingredientId]: cost }
```
Thin controller, delegates to service.

### 2. Backend: Fix COGS in Reporting

**Change `GetCogsByProductIdAsync(DateTime startDate, DateTime endDate)`:**

Current: Loads all recipes, multiplies `QuantityPerUnit * Ingredient.UnitCost` (average).

New: Query `StockMovement` records where `MovementType == Sale` within the date range. Each sale movement already records the actual FIFO lot cost (`UnitCost`) and links to `IngredientId`. Cross-reference with `ProductIngredient` recipes to attribute ingredient costs back to products.

Approach:
1. Get all sale movements in the date range (already have actual FIFO costs)
2. Get all recipe lines (ProductIngredient)
3. Get all transactions with items in the date range
4. For each transaction item sold, calculate its ingredient cost from the sale movements that occurred at that time

Simplified: Since sale movements record total ingredient cost consumed (not per-product), and a single sale may deduct ingredients used by multiple products, the most practical approach is:

- Total COGS for the period = sum of `|Quantity| * UnitCost` for all Sale movements
- Per-product COGS = recipe cost using FIFO costs (oldest lot price at query time)

This gives historically accurate total COGS from movements, and current FIFO cost for per-product breakdowns.

### 3. Frontend: Recipe Editor

**`recipe-editor-dialog.component.ts` changes:**

- On dialog open, call `GET /api/ingredients/fifo-costs` to get FIFO cost map
- `getLineCost()`: Use `fifoCostMap[ingredientId]` instead of `ingredient.unitCost`. Fall back to `ingredient.unitCost` if ingredient not in map.
- `getRecipeCost()`: Same change, aggregates line costs.
- Cost display updates reactively (no UX change, just more accurate numbers).

**`ingredient.service.ts` changes:**
- Add `getFifoCosts(): Observable<Record<string, number>>` method.

### Fallback Behavior

| Scenario | Cost Used |
|----------|-----------|
| Ingredient has active lots | Oldest active lot's `UnitCost` |
| All lots depleted | Most recent lot's `UnitCost` |
| No lots exist at all | `Ingredient.UnitCost` (weighted average, existing field) |

### What Does NOT Change

- `Ingredient.UnitCost` continues to be maintained as weighted average by `SyncIngredientAggregatesAsync`
- `DeductFifoAsync` — already correct, records actual lot cost per movement
- Lot management UI — no changes
- Stock movement history — no changes

## Files to Modify

### Backend
- `Core/Interfaces/IIngredientLotRepository.cs` — add `GetFifoCostByIngredientIdAsync`
- `Core/Interfaces/IIngredientLotService.cs` — add `GetFifoCostsAsync`
- `Infrastructure/Repositories/IngredientLotRepository.cs` — implement new method
- `Infrastructure/Services/IngredientLotService.cs` — implement new method
- `API/Controllers/IngredientsController.cs` — add endpoint
- `Infrastructure/Services/ReportingService.cs` — fix `GetCogsByProductIdAsync`

### Frontend
- `features/pos/services/ingredient.service.ts` — add `getFifoCosts()`
- `features/inventory/components/product-recipes/recipe-editor-dialog.component.ts` — use FIFO costs
