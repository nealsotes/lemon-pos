# Lot Management UI — Sub-project 2

## Problem

The backend now supports ingredient lot/batch tracking with FIFO deduction, but the frontend has no way to view lots, create purchases with lot details (supplier, cost, expiration), or see which lot was affected in the movement history.

## Solution

Three UI additions, all following existing dialog patterns:

1. **Lots Dialog** — view active lots per ingredient
2. **Enhanced Stock Adjustment Dialog** — purchase-specific lot fields
3. **Lot Tags in Movement History** — trace which batch was consumed

## 1. Lots Dialog

**Trigger:** New "lots" icon button on each ingredient row in the data table (alongside existing edit, history, delete icons).

**Component:** `IngredientLotsDialogComponent` — standalone dialog, same pattern as `StockMovementHistoryComponent`.

**Data source:** `GET /api/ingredients/{id}/lots`

**Layout:**
- **Header:** Ingredient avatar + name, total on-hand quantity, active lot count, close button
- **Lot rows** (sorted by ReceivedAt ASC — FIFO order):
  - Color bar on left: red if expiring within 7 days, orange if within 14, green otherwise
  - Supplier name + expiration badge
  - Lot number + received date
  - Remaining quantity / initial quantity
  - Unit cost per unit
- **Footer:** Weighted average cost, total inventory value, close button

**Empty state:** "No lots found. Use the + button to record a purchase."

## 2. Enhanced Stock Adjustment Dialog

**Component:** Modify existing `StockAdjustmentDialogComponent`.

**Change:** When `selectedType === 'purchase'`, reveal a "Lot Details" section below the quantity input with:

| Field | Type | Required | Default |
|---|---|---|---|
| Supplier | text input | No | Ingredient's current supplier |
| Unit Cost | number input | Yes | Ingredient's current unit cost |
| Expiration Date | date input | No | Empty |
| Lot / Invoice # | text input | No | Empty |

The section has a subtle green-tinted background with a "Lot Details" label to visually distinguish it from the base fields.

**On submit (purchase):** Send the lot fields alongside adjustment, movementType, reason, notes. The backend creates a new `IngredientLot`.

**Other movement types** (waste, return, adjustment): No additional fields. FIFO deduction happens automatically on the backend.

## 3. Lot Tags in Movement History

**Component:** Modify existing `StockMovementHistoryComponent`.

**Change:** When a movement has a `lotId`, fetch and display a small lot badge below the timestamp/reason line. The badge shows: `{supplier} · #{lotNumber}` in a purple-tinted tag.

**Data:** The `StockMovement` model already has `lotId`. We need to either:
- Enrich the movement response with lot details (supplier, lotNumber) from the backend, OR
- Fetch lots for the ingredient once and join client-side

**Recommendation:** Fetch lots once when the history dialog opens, build a `Map<lotId, {supplier, lotNumber}>`, and look up per movement. This avoids backend changes and keeps the API simple.

**Fallback:** If `lotId` is null (legacy movements), no badge is shown.

## Frontend Service

**New:** `IngredientLotService` (Angular)
- `getLots(ingredientId: string): Observable<IngredientLot[]>`
- `createLot(ingredientId: string, dto: IngredientLotDto): Observable<IngredientLot>`
- `updateLot(ingredientId: string, lotId: string, dto: IngredientLotUpdateDto): Observable<IngredientLot>`

**New model:** `IngredientLot` interface matching the backend entity.

**Modified:** `IngredientService.adjustQuantity()` — add optional `supplier`, `unitCost`, `expirationDate`, `lotNumber` params for purchase flow. Backend `AdjustQuantityRequest` already accepts `movementType`, `reason`, `notes` — extend it with lot fields.

## Backend Changes

**`AdjustQuantityRequest`** — add optional fields:
- `Supplier` (string?)
- `UnitCost` (decimal?)
- `ExpirationDate` (DateTime?)
- `LotNumber` (string?)

**`IngredientService.AdjustQuantityAsync`** — when movementType is Purchase and lot fields are provided, pass them to `CreateLotAsync` instead of using ingredient defaults.

**`StockMovement` API response** — no change needed. `LotId` is already on the model.

## Files to Create

- `frontend/src/app/features/inventory/services/ingredient-lot.service.ts`
- `frontend/src/app/features/inventory/models/ingredient-lot.model.ts`
- `frontend/src/app/features/inventory/components/inventory/ingredient-lots-dialog.component.ts`

## Files to Modify

- `frontend/src/app/features/inventory/components/inventory/inventory.component.html` — add lots icon button
- `frontend/src/app/features/inventory/components/inventory/inventory.component.ts` — add `viewLots()` method
- `frontend/src/app/features/inventory/components/inventory/stock-adjustment-dialog.component.ts` — add purchase lot fields
- `frontend/src/app/features/inventory/components/inventory/stock-movement-history.component.ts` — add lot badges
- `frontend/src/app/features/inventory/models/stock-movement.model.ts` — add `lotId` field
- `frontend/src/app/features/pos/services/ingredient.service.ts` — extend `adjustQuantity` with lot params
- `backend/.../Controllers/IngredientsController.cs` — extend `AdjustQuantityRequest` with lot fields
- `backend/.../Services/IngredientService.cs` — pass lot fields to `CreateLotAsync`

## What Does NOT Change

- Ingredient table layout and columns
- Recipe editor
- Product recipes tab
- History dialog filter/date functionality
- POS transaction flow (uses backend FIFO automatically)
