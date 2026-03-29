# Ingredient Lot/Batch Tracking — Sub-project 1: Data Model + Backend

## Problem

The current inventory system stores a single supplier, unit cost, and quantity per ingredient. When the same ingredient is purchased from a different supplier at a different cost, the old values are overwritten. There is no way to track which stock came from where, what it cost, or which batch should be used first. This makes recipe costing inaccurate and inventory auditing impossible.

## Solution

Introduce an `IngredientLot` entity that tracks individual batches of ingredients. Each purchase creates a new lot with its own supplier, cost, quantity, and expiration. Stock deductions follow FIFO (First In, First Out) order. The existing `Ingredient` model retains its aggregate fields (Quantity, UnitCost, Supplier, ExpirationDate) and keeps them in sync with the underlying lots for backward compatibility.

This is sub-project 1 of 3:
1. **Data model + backend** (this spec)
2. Lot management UI (future)
3. Recipe costing update (future)

## Data Model

### New Entity: `IngredientLot`

| Field | Type | Constraints | Description |
|---|---|---|---|
| Id | string | PK, GUID | Primary key |
| IngredientId | string | Required, FK | References Ingredient.Id |
| Supplier | string? | MaxLength(100) | Who supplied this lot |
| UnitCost | decimal(18,2) | Required | Cost per unit at time of purchase |
| InitialQuantity | decimal(18,4) | Required | How much was received |
| RemainingQuantity | decimal(18,4) | Required | How much is left (decremented by FIFO) |
| ExpirationDate | DateTime? | | Lot-specific expiration |
| ReceivedAt | DateTime | Required | When this lot was received (drives FIFO order) |
| LotNumber | string? | MaxLength(50) | Optional external reference (invoice #, batch #) |
| Notes | string? | MaxLength(500) | Optional notes |
| IsActive | bool | Default true | Soft delete; set false when RemainingQuantity reaches 0 |

**Indexes:**
- `IngredientId + ReceivedAt` — FIFO query performance
- `IngredientId + IsActive` — active lot listing

### Changes to `Ingredient`

No fields removed. Aggregate fields kept in sync with lots:

- `Quantity` = SUM of all active lots' `RemainingQuantity`
- `UnitCost` = weighted average of active lots: SUM(RemainingQuantity * UnitCost) / SUM(RemainingQuantity)
- `Supplier` = most recently received lot's supplier
- `ExpirationDate` = earliest expiration across active lots (with non-null expiration)

### Changes to `StockMovement`

New nullable field:
- `LotId` (string?) — links the movement to the specific lot it affected

## FIFO Deduction Logic

When stock must be deducted (POS sale, waste, return, negative adjustment):

1. Query active lots for the ingredient, ordered by `ReceivedAt ASC`, then `ExpirationDate ASC` (nulls last) as tiebreaker
2. Walk lots in order, consuming from each until the required quantity is fulfilled:
   - If lot has enough: decrement `RemainingQuantity`, create `StockMovement` with `LotId`
   - If lot doesn't have enough: consume all remaining, set `RemainingQuantity = 0`, `IsActive = false`, create movement, continue to next lot
3. After all deductions, call `SyncIngredientAggregatesAsync` to update the ingredient's aggregate fields
4. If total remaining across all lots < required quantity, throw `InvalidOperationException` (reject the transaction)

### Purchase Flow

When a purchase stock adjustment is made:
1. Create a new `IngredientLot` with supplier, cost, quantity, expiration from the adjustment dialog
2. Create a `StockMovement` linked to the new lot (MovementType.Purchase)
3. Call `SyncIngredientAggregatesAsync` to update Quantity (add), UnitCost (weighted average), Supplier (latest), ExpirationDate (earliest)

### Non-Purchase Movement Flows

- **Waste**: FIFO deduction from oldest lots
- **Return**: FIFO deduction from oldest lots
- **Adjustment (decrease)**: FIFO deduction from oldest lots
- **Adjustment (increase)**: Create a new lot using the ingredient's current UnitCost and Supplier

## API

### New Endpoints

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/ingredients/{id}/lots` | List active lots ordered by ReceivedAt | Owner/Admin |
| GET | `/api/ingredients/{id}/lots/{lotId}` | Get a single lot | Owner/Admin |
| POST | `/api/ingredients/{id}/lots` | Manually create a lot | Owner/Admin |
| PUT | `/api/ingredients/{id}/lots/{lotId}` | Update lot details (supplier, notes, expiration) | Owner/Admin |

### Modified Endpoints

**`POST /api/ingredients/{id}/adjust-quantity`**

When `movementType` is `purchase`: creates a new `IngredientLot` using the supplier, cost, and expiration from the request. The stock adjustment dialog (already built) will be extended in sub-project 2 to include supplier/expiration fields.

For `waste`, `return`, `adjustment` (decrease): applies FIFO deduction to existing lots.

For `adjustment` (increase): creates a new lot with current ingredient defaults.

**`GET /api/ingredients`** — No response shape change. Aggregates remain on the ingredient.

**`GET /api/stockmovements`** — Response includes new `lotId` field (nullable).

### No Breaking Changes

All existing endpoints return the same shape. Lot detail is additive. Recipes reference ingredients, not lots.

## New Service: `IngredientLotService`

Implements `IIngredientLotService`:

- `GetLotsAsync(ingredientId)` — active lots ordered by ReceivedAt
- `GetLotByIdAsync(ingredientId, lotId)` — single lot
- `CreateLotAsync(ingredientId, lot)` — create lot + sync aggregates
- `UpdateLotAsync(ingredientId, lotId, lot)` — update mutable fields (supplier, notes, expiration, lotNumber)
- `DeductFifoAsync(ingredientId, quantity)` — FIFO deduction, returns list of StockMovements created
- `SyncIngredientAggregatesAsync(ingredientId)` — recalculate Quantity, UnitCost, Supplier, ExpirationDate from active lots

## Database Migration

### Schema Changes

1. Add `IngredientLots` table with all fields and indexes
2. Add `LotId` column (nullable VARCHAR(255)) to `StockMovements` table
3. Add index on `StockMovements.LotId`

### Data Migration

For each existing ingredient with `Quantity > 0`, create a seed lot:

- `Id` = new GUID
- `IngredientId` = ingredient's Id
- `Supplier` = ingredient's current Supplier
- `UnitCost` = ingredient's current UnitCost (or 0 if null)
- `InitialQuantity` = `RemainingQuantity` = ingredient's current Quantity
- `ExpirationDate` = ingredient's current ExpirationDate
- `ReceivedAt` = ingredient's CreatedAt
- `LotNumber` = "LEGACY-001"
- `Notes` = "Migrated from initial inventory"
- `IsActive` = true

Ingredients with `Quantity = 0` get no lots.

This ensures the system works immediately after migration with no orphaned ingredients.

## What Does NOT Change

- Ingredient model fields (all retained, kept in sync)
- Recipe system (references ingredients, not lots)
- Frontend ingredient list, editor dialog, recipe editor
- POS transaction flow (calls same deduction logic, now lot-aware internally)
- Stock movement history UI (shows lotId as additional detail in sub-project 2)
- All existing API response shapes

## Future Sub-Projects

**Sub-project 2: Lot Management UI**
- Lot list view per ingredient (expandable row or tab)
- Purchase dialog enhanced with supplier, cost, expiration, lot number fields
- Stock movement history shows lot reference
- Lot detail/edit dialog

**Sub-project 3: Recipe Costing Update**
- Recipe cost calculated from actual lot costs (weighted average or FIFO)
- Cost comparison across suppliers
- Margin alerts when ingredient costs change
