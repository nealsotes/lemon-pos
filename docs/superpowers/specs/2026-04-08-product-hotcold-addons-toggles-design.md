# Product Hot/Cold & Add-Ons Toggle Design

**Date:** 2026-04-08
**Status:** Approved
**Approach:** Per-product add-ons with autocomplete suggestions (Hybrid)

## Problem

Hot/cold pricing fields automatically appear for beverage categories, with no way to disable them per product. Add-ons are hardcoded in `add-ons-config.ts` and apply uniformly to all beverages. There is no per-product control over whether a product offers hot/cold variants or custom add-ons.

## Solution

Add toggle switches in the product editor to explicitly enable/disable hot/cold and add-ons per product. When add-ons are enabled, provide an inline editor for defining custom add-ons (name + price) per product, with autocomplete suggestions from previously used add-ons.

## Data Model Changes

### Frontend — `product.model.ts`

Add to the `Product` interface:

```typescript
hasHotCold?: boolean;    // toggle for hot/cold pricing (beverages only)
hasAddOns?: boolean;     // toggle for add-ons (any category)
addOns?: AddOn[];        // custom add-ons defined per product
```

### Backend — `Product.cs`

Add three new properties:

```csharp
public bool HasHotCold { get; set; } = false;
public bool HasAddOns { get; set; } = false;
public string AddOnsJson { get; set; } = "[]";  // JSON-serialized array of {name, price}
```

`AddOnsJson` is a JSON string column. No new tables or relationships. Deserialized in the DTO/mapping layer to `List<AddOnDto>`.

### EF Core Migration

New migration adding three columns to the `Products` table:
- `HasHotCold` (bool, default false)
- `HasAddOns` (bool, default false)
- `AddOnsJson` (longtext, default "[]")

### Backward Compatibility Migration

Existing products that have `HotPrice` or `ColdPrice` set should have `HasHotCold` defaulted to `true`. This can be done as a SQL data migration step after the schema migration:

```sql
UPDATE Products SET HasHotCold = 1 WHERE HotPrice IS NOT NULL OR ColdPrice IS NOT NULL;
```

## Product Editor Dialog Changes

File: `product-editor-dialog.component.ts`

### Form Controls

Add to the form group:
- `hasHotCold: [false]`
- `hasAddOns: [false]`
- `addOns: FormArray` — each entry is a FormGroup with `name` (required) and `price` (required, min 0.01)

### Template — Between Price/Stock Row and Image Section

#### a) Hot/Cold Toggle (beverage categories only)

Visible only when `isBeverageCategory(category)` returns true.

```
[checkbox] Has Hot & Cold Variants
```

When ON: reveals hot price + cold price fields (the existing fields, re-gated behind this toggle instead of category alone).
When OFF: hides hot/cold price fields, clears their values.

This replaces the current logic where hot/cold fields auto-appear for any beverage category.

#### b) Add-Ons Toggle (all categories)

Always visible regardless of category.

```
[checkbox] Has Add-Ons
```

When ON: reveals the inline add-on editor below.
When OFF: hides the editor, clears the add-ons FormArray.

#### c) Add-On Editor (inline list)

Shown when `hasAddOns` is true. Each row:

```
[Name input with autocomplete] [Price input (₱)] [Delete button]
```

- "+ Add Add-On" button at bottom appends a new empty row
- Name field provides autocomplete suggestions from add-ons used across all products (collected from the product list already loaded in the component)
- No drag-and-drop, no reordering — simple append/delete
- Validation: name required, price required and > 0

### Category Change Behavior

When category changes:
- If new category is NOT a beverage: set `hasHotCold = false`, hide and clear hot/cold fields
- If new category IS a beverage: show the hot/cold toggle (but don't auto-enable it)
- Add-ons toggle remains visible regardless of category change

### Editing Existing Products

When editing a product:
- `hasHotCold` populated from product data (or inferred: true if hotPrice/coldPrice exist)
- `hasAddOns` populated from product data (or inferred: true if addOns array is non-empty)
- `addOns` FormArray populated from product's add-ons list

## Save Flow Changes

File: `product-management.component.ts` — `saveProduct()`

Current logic determines hot/cold by category detection (`isBeverageCategory`). New logic:

- Hot/cold pricing saved only when `hasHotCold === true`
- If `hasHotCold === false`, send `hotPrice: null, coldPrice: null`
- `hasAddOns` and `addOns[]` included in the product payload
- If `hasAddOns === false`, send `addOns: []`

## Temperature Select Dialog Changes

File: `temperature-select-dialog.component.ts`

### Add-Ons Source

Replace:
```typescript
availableAddOns = BEVERAGE_ADD_ONS;  // hardcoded
```

With:
```typescript
availableAddOns = this.data.product.addOns || [];  // per-product
```

### Add-Ons Visibility

Only show the add-ons section if:
```typescript
data.product.hasAddOns && data.product.addOns?.length > 0
```

### Hardcoded Config

`add-ons-config.ts` (`BEVERAGE_ADD_ONS`) becomes unused. Remove it or keep as a reference — no runtime dependency.

## Product Grid Trigger Logic

File: `product-grid.component.ts`

Current: opens temperature dialog for any beverage product.

New logic for when a product is clicked:

1. If `product.hasHotCold` OR `product.hasAddOns` → open temperature/add-ons dialog
2. If only `hasAddOns` (no `hasHotCold`) → dialog skips temperature selection, shows add-ons only
3. If neither flag → add directly to cart (no dialog)

## Backend API Changes

### DTO Updates

`ProductDto` and `CreateProductDto` / `UpdateProductDto` gain:
- `HasHotCold` (bool)
- `HasAddOns` (bool)
- `AddOns` (List<AddOnDto>) — serialized to/from `AddOnsJson`

```csharp
public class AddOnDto
{
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
}
```

### AutoMapper Profile

Map `AddOnsJson` (string) ↔ `AddOns` (List<AddOnDto>) using `System.Text.Json` serialization in the mapping profile.

### Controller / Service

No new endpoints needed. Existing `POST /api/products` and `PUT /api/products/{id}` handle the new fields through the updated DTOs.

## Files to Modify

### Frontend
1. `frontend/src/app/features/pos/models/product.model.ts` — add fields
2. `frontend/src/app/features/admin/components/product-management/product-editor-dialog.component.ts` — toggles + add-on editor
3. `frontend/src/app/features/admin/components/product-management/product-management.component.ts` — save logic
4. `frontend/src/app/features/pos/components/product-grid/temperature-select-dialog.component.ts` — use per-product add-ons
5. `frontend/src/app/features/pos/components/product-grid/product-grid.component.ts` — dialog trigger logic

### Backend
6. `backend/PosSystem/PosSystem/Core/Models/Product.cs` — add properties
7. `backend/PosSystem/PosSystem/Core/Models/ProductDto.cs` (or equivalent DTO file) — add DTO fields
8. `backend/PosSystem/PosSystem/Infrastructure/Data/PosSystemDbContext.cs` — column config if needed
9. New EF Core migration — schema + data migration
10. AutoMapper profile — JSON serialization mapping

### Removable
11. `frontend/src/app/features/pos/components/product-grid/add-ons-config.ts` — remove (no longer needed)
