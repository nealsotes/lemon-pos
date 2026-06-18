# Product "Show Inactive" Toggle Design

**Date:** 2026-06-18
**Status:** Approved
**Approach:** Optional `isActive` query param on the list endpoint + admin-only one-shot fetch

## Problem

Products are soft-deleted: deactivating sets `IsActive = false` and the row stays in the database. But every read path filters to active-only, including the list endpoint (`GetPaginatedAsync`) that feeds the admin product-management page. As a result, once a product is deactivated it disappears from the admin list entirely after a refresh, so there is no way to find it and turn it back on. The "Inactive" badge already present in the product table template is effectively unreachable.

The list endpoint is shared with the POS product grid and the public menu, so it cannot simply be unfiltered — that would expose inactive products for sale.

(Related: a separate bug where reactivating via `PUT` returned 404 because `GetByIdAsync` filtered out inactive products has already been fixed. This spec covers only the visibility/toggle.)

## Solution

Add a **"Show inactive"** toggle to the product-management filter area, default **off**:

- **Off** → active products only (today's behavior, unchanged).
- **On** → **only inactive** products, each shown with the existing red "Inactive" badge. Editing one and re-checking "Active Product" reactivates it; it then drops out of the inactive list on the next reload.

The backend list endpoint gains an optional `isActive` filter. The admin page fetches its list through a dedicated method that bypasses the shared product `BehaviorSubject`, so the POS grid and public menu can never receive inactive products.

## Backend API Changes

Thread an optional `bool? isActive` filter through the existing paginated list path. No new endpoint.

### `IProductRepository` / `ProductRepository`

```csharp
Task<IEnumerable<Product>> GetPaginatedAsync(int page, int pageSize, bool? isActive);
```

```csharp
public async Task<IEnumerable<Product>> GetPaginatedAsync(int page, int pageSize, bool? isActive)
{
    var query = _context.Products.AsQueryable();
    if (isActive.HasValue)
    {
        query = query.Where(p => p.IsActive == isActive.Value);
    }
    return await query
        .OrderBy(p => p.Category)
        .ThenBy(p => p.Name)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .ToListAsync();
}
```

Semantics: `true` → active only, `false` → inactive only, `null` → all (not used by the UI, kept for flexibility).

### `IProductService` / `ProductService`

```csharp
Task<IEnumerable<Product>> GetProductsPaginatedAsync(int page, int pageSize, bool? isActive);
```

Passes `isActive` straight through to the repository.

### `ProductsController.GetProducts`

```csharp
public async Task<ActionResult<IEnumerable<Product>>> GetProducts(
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 20,
    [FromQuery] bool? isActive = true)
```

The query-param default of `true` keeps the endpoint backward compatible: every existing caller omits the param and still gets active-only.

## Frontend Changes

### `ProductService` (`features/pos/services/product.service.ts`)

`getProducts()` returns a shared `BehaviorSubject` consumed by the POS grid and public menu. To keep inactive products out of that shared stream, add a dedicated one-shot fetch for admin:

```typescript
getProductsForAdmin(activeOnly: boolean): Observable<Product[]> {
  return this.http
    .get<Product[]>(`${this.apiUrl}/products?page=1&pageSize=100&isActive=${activeOnly}`)
    .pipe(catchError(() => of([])));
}
```

This does not touch `productsSubject`. On API error, the **active** view falls back to the cached products (`loadFromLocalStorage('products')`, preserving today's offline behavior); the **inactive** view returns an empty list, since no cache of inactive products exists.

### `ProductManagementComponent` (`.../product-management.component.ts`)

- Add `showInactive = false`.
- Change `loadProducts()` to call `getProductsForAdmin(!this.showInactive)` (a one-shot fetch) instead of subscribing to the shared `getProducts()` subject. After every add/update/delete/bulk operation (which already call `loadProducts()`), the list re-fetches with the current toggle state.
- Add `onToggleInactive(checked: boolean)`: set `showInactive`, clear `selectedProducts` (avoid acting on a stale selection across views), and call `loadProducts()`.
- KPI strip continues to reflect the currently loaded list (in inactive view it shows inactive stats). Accepted as-is.

### Template (`.../product-management.component.html`)

`FilterBarComponent` has fixed inputs and no content projection, so add the toggle directly in this template — a small control row inside `.panel`, immediately below `<app-filter-bar>` and above the bulk action bar:

```html
<div class="status-filter-row">
  <label class="show-inactive-toggle">
    <input type="checkbox" [checked]="showInactive"
           (change)="onToggleInactive($any($event.target).checked)">
    <span>Show inactive</span>
  </label>
</div>
```

Styles go in `product-management.component.css`, using existing design tokens to match the surrounding controls. The shared `FilterBarComponent` is **not** modified.

## Behavior Notes

- Search, sort, and category filters operate client-side on whichever set is loaded, so they work in both views unchanged.
- Reactivation from the inactive view: edit product → check "Active Product" → save → `loadProducts()` re-fetches inactive-only → the now-active product is gone from the list (correct).
- Category chips are still sourced from active categories (`getCategories()`); an inactive-only category may be absent from the chips but its products still display. Acceptable for this scope.

## Out of Scope

- No change to the shared `getProducts()` stream, POS grid, public menu, or transaction/sales paths.
- No database or migration changes.
- No persistence of the toggle state across navigation (defaults off on each visit).

## Files to Modify

### Backend
1. `backend/PosSystem/PosSystem/Core/Interfaces/IProductRepository.cs` — `GetPaginatedAsync` signature
2. `backend/PosSystem/PosSystem/Infrastructure/Repositories/ProductRepository.cs` — filter impl
3. `backend/PosSystem/PosSystem/Core/Interfaces/IProductService.cs` — `GetProductsPaginatedAsync` signature
4. `backend/PosSystem/PosSystem/Infrastructure/Services/ProductService.cs` — pass-through
5. `backend/PosSystem/PosSystem/API/Controllers/ProductsController.cs` — `isActive` query param

### Frontend
6. `frontend/src/app/features/pos/services/product.service.ts` — `getProductsForAdmin()`
7. `frontend/src/app/features/admin/components/product-management/product-management.component.ts` — `showInactive`, `loadProducts()`, `onToggleInactive()`
8. `frontend/src/app/features/admin/components/product-management/product-management.component.html` — toggle control
9. `frontend/src/app/features/admin/components/product-management/product-management.component.css` — toggle styles
